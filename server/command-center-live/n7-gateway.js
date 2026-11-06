"use strict";
const crypto=require("node:crypto");
const {execFile}=require("node:child_process");
const path=require("node:path");
const os=require("node:os");
const fs=require("node:fs");
const {verifyLibraryBridge}=require("./n7-library-bridge");

// Fixed local CLI, no shell or client-specified paths. All reads require authenticated operator.
function readPrivateLibrary(command,arg) {
  const cli=path.resolve(__dirname,"../../tools/library/n7_library.php");
  const php=process.env.PCT_PHP_BIN||"/opt/plesk/php/8.4/bin/php";
  return new Promise((resolve,reject)=>execFile(php,[cli,command,...arg],{
    timeout:15000,maxBuffer:2_000_000,windowsHide:true
  },(err,stdout)=>{
    if(err)return reject(new Error("PRIVATE_LIBRARY_UNAVAILABLE"));
    try{resolve(JSON.parse(stdout.trim()));}
    catch(_){reject(new Error("PRIVATE_LIBRARY_RESPONSE_INVALID"));}
  }));
}


// Dedicated OAuth-protected PDF ingestion; avoids changing the existing app.js upload code.
async function privateLibraryUpload(req,rawOverride=null){
  const diskFile=typeof rawOverride==="string"?rawOverride:null;
  const max=diskFile?200*1024*1024:25*1024*1024;
  const chunks=[];let bytes=0;let raw=null,digest;
  if(diskFile){
    const info=fs.statSync(diskFile);
    if(!info.isFile()||info.size<5||info.size>max)throw new Error("INVALID_PDF_SIZE");
    const fd=fs.openSync(diskFile,"r"),head=Buffer.alloc(5);
    try{fs.readSync(fd,head,0,5,0);}finally{fs.closeSync(fd);}
    if(head.toString("ascii")!=="%PDF-")throw new Error("INVALID_PDF");
    const hash=crypto.createHash("sha256");
    for await(const chunk of fs.createReadStream(diskFile,{highWaterMark:512*1024}))hash.update(chunk);
    digest=hash.digest("hex");
  }else{
    if(rawOverride!==null)raw=rawOverride;
    else{
      for await(const part of req){
        bytes+=part.length;
        if(bytes>max)throw new Error("PDF_TOO_LARGE");
        chunks.push(part);
      }
      raw=Buffer.concat(chunks);
    }
    if(!Buffer.isBuffer(raw)||raw.length>max||raw.length<5||raw.subarray(0,5).toString("ascii")!=="%PDF-")
      throw new Error("INVALID_PDF");
    digest=crypto.createHash("sha256").update(raw).digest("hex");
  }
  const dataRoot=process.env.PCT_KNOWLEDGE_DIR||path.join(__dirname,"knowledge-data");
  const originals=path.join(dataRoot,"uploads");
  fs.mkdirSync(originals,{recursive:true,mode:0o700});
  const full=path.join(originals,"n7-library-"+digest+".pdf");
  try{
    if(diskFile)fs.copyFileSync(diskFile,full,fs.constants.COPYFILE_EXCL);
    else fs.writeFileSync(full,raw,{flag:"wx",mode:0o600});
  }catch(error){if(error.code!=="EEXIST")throw error;}
  const copyHash=crypto.createHash("sha256");
  for await(const part of fs.createReadStream(full,{highWaterMark:512*1024}))copyHash.update(part);
  if(copyHash.digest("hex")!==digest)throw new Error("SOURCE_CHECKSUM_FAILED");
  const replay=await new Promise((resolve,reject)=>execFile(
    process.env.PCT_PYTHON_BIN||"python3",
    [path.join(__dirname,"pdf-evidence.py"),full],
    {timeout:300000,maxBuffer:32*1024*1024},(error,stdout)=>{
      let parsed;try{parsed=JSON.parse(stdout);}catch(_){return reject(new Error("PDF_EXTRACTION_FAILED"));}
      if(error||parsed.error)return reject(new Error("PDF_EXTRACTION_LIMIT_OR_FAILURE"));
      resolve(parsed);
    }
  ));
  if(replay.source_sha256!==digest||!Array.isArray(replay.pages)||!replay.pages.length)
    throw new Error("SOURCE_REPLAY_MISMATCH");
  let title;
  try{title=decodeURIComponent(String(req.headers["x-file-name"]||"Historical source.pdf"));}
  catch(_){title="Historical source.pdf";}
  title=path.basename(title).slice(0,180)||"Historical source.pdf";
  const batches=path.join(dataRoot,"library-batches",digest);
  fs.mkdirSync(batches,{recursive:true,mode:0o700});
  const cli=path.resolve(__dirname,"../../tools/library/n7_library.php");
  let imported=0,searchable=0,pendingOCR=0;
  for(let i=0;i<replay.pages.length;i+=20){
    const pageGroup=replay.pages.slice(i,i+20);
    const pageRows=pageGroup.map(pg=>({
      scan_index:Number(pg.page),printed_page:pg.printed_page==null?null:String(pg.printed_page),
      text:String(pg.text||""),ocr_status:pg.method==="OCR_DEFERRED"?"OCR_PENDING":"UNREVIEWED"
    }));
    if(pageRows.some(p=>!Number.isSafeInteger(p.scan_index)||p.scan_index<1))
      throw new Error("PAGE_INDEX_INVALID");
    const record={source_id:digest,title,
      source_uri:"private://n7-knowledge/uploads/n7-library-"+digest+".pdf",
      rights_note:"Private operator upload; never publish the original PDF.",pages:pageRows};
    const target=path.join(batches,"pages-"+String(pageRows[0].scan_index).padStart(6,"0")+".json");
    const tmp=target+"."+crypto.randomBytes(5).toString("hex")+".tmp";
    fs.writeFileSync(tmp,JSON.stringify(record),{flag:"wx",mode:0o600});
    fs.renameSync(tmp,target);
    const db=await new Promise(resolve=>execFile(
      process.env.PCT_PHP_BIN||"/opt/plesk/php/8.4/bin/php",
      [cli,"import",target],{timeout:30000,maxBuffer:65536},(error,stdout)=>{
        if(error)return resolve(null);
        try{resolve(JSON.parse(stdout.trim()));}catch(_){resolve(null);}
      }
    ));
    if(db?.status!=="IMPORTED"||db.source_id!==digest)
      return {status:"STAGED",source_id:digest,imported_pages:imported,
        reason:"LIBRARY_DB_IMPORT_NOT_CONFIRMED",historically_verified:false};
    imported+=pageRows.length;
    searchable+=pageRows.filter(pg=>pg.ocr_status!=="OCR_PENDING"&&pg.text.trim().length).length;
    pendingOCR+=pageRows.filter(pg=>pg.ocr_status==="OCR_PENDING").length;
  }
  return {status:"DATABASE_COMMITTED",source_id:digest,imported_pages:imported,
    searchable_pages:searchable,ocr_pending_pages:pendingOCR,
    printed_pages_inferred:false,historically_verified:false};
}

// Routes are explicitly scoped to the existing live service. No shell,
// database writer, privileged host action, or arbitrary workflow selection.
function createN7Gateway({json,operatorAuthorized,sessionAuthorized=()=>false,readBody,statusFor,githubWorkflowDispatch,githubCodingDispatch,githubPrivateDispatch,libraryRunner=readPrivateLibrary,libraryUploadRunner=privateLibraryUpload,libraryBridgeVerifier=verifyLibraryBridge}) {
  let lastAccepted=0;
  return async function handleN7(req,res,p) {
    // PDF ingestion requires the existing N7 session on the bot and a fresh
    // server-to-server HMAC signature of the raw PDF SHA-256. No public direct upload.
    if(p==="/n7/library/upload-signed"){
      if(req.method!=="POST"){json(res,405,{error:"method_not_allowed"});return true;}
      if(req.headers.origin){json(res,403,{error:"server_bridge_only"});return true;}
      if(!String(req.headers["content-type"]||"").toLowerCase().startsWith("application/pdf")){
        json(res,415,{error:"pdf_required"});return true;
      }
      const max=200*1024*1024,folder=fs.mkdtempSync(path.join(os.tmpdir(),"n7-private-pdf-"));
      const staged=path.join(folder,"incoming.pdf");
      const digestHash=crypto.createHash("sha256");
      let fd=null,total=0,validPDF=true,header=Buffer.alloc(0);
      try{
        fd=fs.openSync(staged,"wx",0o600);
        for await(const part of req){
          total+=part.length;
          if(total>max)throw new Error("PDF_TOO_LARGE");
          if(header.length<5)header=Buffer.concat([header,part.subarray(0,5-header.length)]);
          digestHash.update(part);
          let written=0;
          while(written<part.length)written+=fs.writeSync(fd,part,written,part.length-written);
        }
        fs.closeSync(fd);fd=null;
        validPDF=total>=5&&header.toString("ascii")==="%PDF-";
        if(!validPDF){json(res,415,{error:"invalid_pdf_magic"});return true;}
        const digest=digestHash.digest("hex");
        if(!libraryBridgeVerifier(req,digest)){json(res,401,{error:"signed_upload_required"});return true;}
        const outcome=await libraryUploadRunner(req,staged);
        const committed=outcome?.status==="DATABASE_COMMITTED";
        json(res,committed?201:503,{
          schema:"n7-private-pdf-import-v1",
          status:outcome?.status||"UNKNOWN",source_id:outcome?.source_id||null,
          imported_pages:outcome?.imported_pages||0,
          searchable_pages:outcome?.searchable_pages||0,
          ocr_pending_pages:outcome?.ocr_pending_pages||0,
          historically_verified:false,
          ...(committed?{}:{reason:outcome?.reason||"import_not_confirmed"})
        });
      }catch(error){
        json(res,error.message==="PDF_TOO_LARGE"?413:503,
          {error:error.message==="PDF_TOO_LARGE"?"pdf_exceeds_200mb":"pdf_extraction_or_import_unavailable"});
      }finally{
        if(fd!==null)try{fs.closeSync(fd);}catch(_){}
        try{fs.rmSync(folder,{recursive:true,force:true});}catch(_){}
      }
      return true;
    }
    // Import only two rights-verified, fixed Gutenberg works over the authenticated host bridge.
    // This endpoint is not public and does not accept user-selected file paths or shell commands.
    if(p==="/n7/library/import-signed"){
      if(req.method!=="POST"){json(res,405,{error:"method_not_allowed"});return true;}
      let raw;
      try{raw=await readBody(req,650000);}
      catch(_){json(res,413,{error:"import_payload_too_large"});return true;}
      if(!verifyLibraryBridge(req,raw,Math.floor(Date.now()/1000),650000)){
        json(res,401,{error:"signed_import_required"});return true;
      }
      let source;
      try{source=JSON.parse(raw);}
      catch(_){json(res,400,{error:"invalid_import_json"});return true;}
      const allowlist={
        "22169":{uri:"https://www.gutenberg.org/ebooks/22169",title:"The Story of the Barbary Corsairs",author:"Stanley Lane-Poole; J. D. Jerrold Kelley",year:"1890"},
        "13689":{uri:"https://www.gutenberg.org/ebooks/13689",title:"Sea-Wolves of the Mediterranean",author:"E. Hamilton Currey",year:"1910"}
      };
      const book=allowlist[String(source?.gutenberg_id||"")];
      const expectedId=book&&crypto.createHash("sha256").update("gutenberg:"+source.gutenberg_id).digest("hex");
      if(!book||source.source_id!==expectedId||source.title!==book.title||
         source.author!==book.author||source.publication_year!==book.year||
         source.source_uri!==book.uri||!Array.isArray(source.pages)||
         source.pages.length<1||source.pages.length>18||
         source.pages.some(pg=>!Number.isSafeInteger(pg?.scan_index)||pg.scan_index<1||pg.scan_index>10000||
           typeof pg.text!=="string"||pg.text.length<1||pg.text.length>60000||
           pg.ocr_status!=="UNREVIEWED"||
           !(pg.printed_page===null||typeof pg.printed_page==="string"&&pg.printed_page.length<=24))
      ){
        json(res,400,{error:"invalid_gutenberg_import_batch"});return true;
      }
      // Convert the signed transport record to the fixed existing CLI import schema.
      const record={source_id:expectedId,title:book.title,author:book.author,
        publication_year:book.year,source_uri:book.uri,
        bibliographic_reference:book.author+". "+book.title+" ("+book.year+"). Project Gutenberg #"+source.gutenberg_id+".",
        rights_note:"Historical secondary source; public-domain edition; Gutenberg HTML transcription, page labels where marked. NOT a primary historical source. UNREVIEWED.",
        pages:source.pages};
      let dir;
      try{
        dir=fs.mkdtempSync(path.join(os.tmpdir(),"n7-pg-"));
        const file=path.join(dir,"batch.json");
        fs.writeFileSync(file,JSON.stringify(record),{mode:0o600,flag:"wx"});
        const result=await new Promise((resolve,reject)=>execFile(
          process.env.PCT_PHP_BIN||"/opt/plesk/php/8.4/bin/php",
          [path.resolve(__dirname,"../../tools/library/n7_library.php"),"import",file],
          {timeout:30000,maxBuffer:65536,windowsHide:true},(error,stdout)=>{
            if(error)return reject(error);
            try{resolve(JSON.parse(stdout));}catch(e){reject(e);}
          }));
        if(result?.status!=="IMPORTED"||result.source_id!==expectedId||
           result.page_count!==record.pages.length)
          throw new Error("import_not_confirmed");
        json(res,201,{status:"IMPORTED",source_id:expectedId,page_count:result.page_count});
      }catch(_){json(res,503,{error:"gutenberg_import_unavailable"});}
      finally{
        if(dir)try{fs.rmSync(dir,{recursive:true,force:true});}catch(_){}
      }
      return true;
    }
    if (p!=="/n7/status" && p!=="/n7/dispatch" && p!=="/n7/code" && p!=="/n7/brain/task" && p!=="/n7/library/search" && p!=="/n7/library/page" && p!=="/n7/library/upload") return false;
    if (p==="/n7/status") {
      if(req.method!=="GET") {json(res,405,{error:"method_not_allowed"});return true;}
      const state=await statusFor("latest");
      const snapshot=state.snapshot||null;
      json(res,200,{
        schema:"nabou-n7-agent-status-v1",
        agent:"N7", project:"piratecartography",
        connected:Boolean(snapshot),
        state:!snapshot?"NO_LIVE_SNAPSHOT":String(snapshot.mission?.status||"UNKNOWN"),
        run_id:state.run_id, transport:state.transport,
        updated_at:snapshot?.generated_utc||null,
        websocket:"/ws/piratecartography/latest",
        can_dispatch:false, // Public clients must never receive credentials.
        historical_verification:false
      });
      return true;
    }
    if(p==="/n7/library/upload"){
      if(req.method!=="POST"){json(res,405,{error:"method_not_allowed"});return true;}
      const origin=String(req.headers.origin||"");
      if(!["https://bot.piratecartography.com","https://pct-live.piratecartography.com"].includes(origin)
         ||req.headers["x-nabou-agent-room"]!=="1"){
        json(res,403,{error:"origin_not_allowed"});return true;
      }
      if(!operatorAuthorized(req)&&!sessionAuthorized(req)){
        json(res,401,{error:"operator_authorization_required"});return true;
      }
      if(!String(req.headers["content-type"]||"").toLowerCase().includes("application/pdf")){
        json(res,415,{error:"pdf_required"});return true;
      }
      try{
        const outcome=await libraryUploadRunner(req);
        json(res,outcome.status==="DATABASE_COMMITTED"?201:503,{
          schema:"n7-private-library-ingest-v1",...outcome});
      }catch(_){json(res,422,{error:"pdf_ingestion_failed_or_unsupported"});}
      return true;
    }
    if(p==="/n7/library/search" || p==="/n7/library/page"){
      if(req.method!=="GET" && req.method!=="POST"){
        json(res,405,{error:"method_not_allowed"});return true;
      }
      // Public pages and untrusted origins are forbidden even when the URL is known.
      const origin=String(req.headers.origin||"");
      if(origin && !["https://lepe12.github.io","https://pct-live.piratecartography.com","https://bot.piratecartography.com"].includes(origin)){
        json(res,403,{error:"origin_not_allowed"});return true;
      }
      let bridgeBody=null;
      const normalAuthorized=operatorAuthorized(req)||sessionAuthorized(req);
      if(!normalAuthorized && req.method==="POST"){
        try{
          const raw=await readBody(req,4096);
          if(libraryBridgeVerifier(req,raw))bridgeBody=JSON.parse(raw);
        }catch(_){}
      }
      if(!normalAuthorized && bridgeBody===null){
        json(res,401,{error:"operator_authorization_required"});return true;
      }
      const params=new URL(req.url||p,"http://localhost").searchParams;
      let command,argument;
      if(p==="/n7/library/search"){
        let term=String(params.get("q")||"").trim();
        if(req.method==="POST"){
          let request;
          try {request=bridgeBody!==null?bridgeBody:JSON.parse(await readBody(req,4096));}
          catch(_){json(res,400,{error:"invalid_json"});return true;}
          if(typeof request?.query!=="string"){
            json(res,400,{error:"invalid_library_query"});return true;
          }
          term=request.query.trim();
        }
        if(term.length<2||term.length>150||[...term].some(x=>x.codePointAt(0)<32)){
          json(res,400,{error:"invalid_library_query"});return true;
        }
        command="search";argument=[term];
      }else{
        let id=String(params.get("source_id")||"");
        let scan=String(params.get("scan_index")||"");
        if(req.method==="POST"){
          let request;
          try{request=bridgeBody!==null?bridgeBody:JSON.parse(await readBody(req,4096));}
          catch(_){json(res,400,{error:"invalid_json"});return true;}
          id=String(request?.source_id||"");scan=String(request?.scan_index||"");
        }
        if(!/^[a-f0-9]{64}$/.test(id)||!(/^[1-9][0-9]{0,9}$/.test(scan))||Number(scan)>4294967295){
          json(res,400,{error:"invalid_page_reference"});return true;
        }
        command="page";argument=[id,scan];
      }
      try{
        const data=await libraryRunner(command,argument);
        if(p==="/n7/library/search" && req.method==="POST"){
          json(res,200,{schema:"n7-library-read-v1",
            matches:Array.isArray(data.matches)?data.matches:[],
            source_count:Number.isSafeInteger(data.source_count)?data.source_count:null,
            page_count:Number.isSafeInteger(data.page_count)?data.page_count:null,
            historically_verified:false});
        }else if(p==="/n7/library/page" && req.method==="POST"){
          if(!data||data.status==="NOT_FOUND"){json(res,404,{error:"page_not_found"});return true;}
          json(res,200,{schema:"n7-library-page-v1",page:data,
            source_type:String(data.rights_note||"").toLowerCase().includes("historical secondary source")?
              "SECONDARY_HISTORIOGRAPHY":"UNCLASSIFIED_REQUIRES_REVIEW",historically_verified:false});
        }else{
          json(res,200,{schema:"n7-private-library-read-v1",operation:command,
            result:data,historically_verified:false});
        }
      }catch(_){json(res,503,{error:"private_library_unavailable"});}
      return true;
    }
    if(req.method!=="POST"){json(res,405,{error:"method_not_allowed"});return true;}
    const sessionOk=req.headers.origin==="https://bot.piratecartography.com" && req.headers["x-nabou-agent-room"]==="1" && sessionAuthorized(req);
    if(!operatorAuthorized(req)&&!sessionOk){json(res,401,{error:"operator_authorization_required"});return true;}
    if(!String(process.env.PCT_GITHUB_DISPATCH_TOKEN||"")){json(res,503,{error:"dispatch_not_configured"});return true;}
    // Enforce a same-origin operator flow or a server-side client with no Origin.
    // An arbitrary browser origin is not sufficient even with a bearer token.
    const origin=String(req.headers.origin||"");
    if(origin && origin!=="https://lepe12.github.io" && origin!=="https://pct-live.piratecartography.com" && origin!=="https://bot.piratecartography.com"){json(res,403,{error:"origin_not_allowed"});return true;}
    const now=Date.now();
    if(now-lastAccepted<10000){json(res,429,{error:"n7_rate_limited"});return true;}
    let body;
    try {body=JSON.parse(await readBody(req));}
    catch(_){json(res,400,{error:"invalid_json"});return true;}
    if(p==="/n7/brain/task"){
      const task=body?.task,skill=body?.skill||"greek-prose-editor";
      if(typeof task!=="string"||task.trim().length<12||task.length>2000||
        [...task].some(ch=>ch.charCodeAt(0)<32&&![9,10,13].includes(ch.charCodeAt(0)))||
        !["greek-prose-editor","historical-source-audit"].includes(skill)){
        json(res,400,{error:"invalid_n7_private_task"});return true;
      }
      if(typeof githubPrivateDispatch!=="function")return json(res,503,{error:"private_dispatch_unavailable"}),true;
      lastAccepted=now;
      try{await githubPrivateDispatch({task:task.trim(),skill});}
      catch(_){json(res,502,{error:"private_n7_dispatch_failed"});return true;}
      json(res,202,{status:"ACCEPTED",agent:"N7",worker:"private-Qwen2.5-3B",
        workflow:"n7-private-model.yml",mode:"private_skill_task",private_result:true});
      return true;
    }
    if(p==="/n7/code") {
      const task=String(body?.task||"").trim();
      const allowed=new Set([
        "jarvis-intelligence-chamber/navigation-rail.css",
        "jarvis-intelligence-chamber/photon-windows.css",
        "jarvis-intelligence-chamber/nabou-shell.css"
      ]);
      const files=body?.target_files;
      if(task.length<8||task.length>2000||[...task].some(ch=>ch.charCodeAt(0)<32)||
        !Array.isArray(files)||files.length<2||files.length>3||
        new Set(files).size!==files.length||!files.every(f=>allowed.has(f))||
        (body?.apply_changes!==true && body?.apply_changes!==false && body?.apply_changes!==undefined) ||
        (body?.apply_changes===true && body?.confirm_draft_pr!==true)){
        json(res,400,{error:"invalid_coding_request"});return true;
      }
      lastAccepted=now;
      try{
        await githubCodingDispatch({
          task,target_files:files.join(","),apply_changes:body.apply_changes===true?"true":"false"
        });
      }catch(err){
        json(res,502,{error:"coding_dispatch_failed",reason:String(err.message||"unknown").slice(0,120)});
        return true;
      }
      json(res,202,{status:"ACCEPTED",agent:"N7",worker:"Qwen2.5-Coder-7B",
        workflow:"nabou-coder-v03.yml",mode:body.apply_changes===true?"draft_pr":"preview_only"});
      return true;
    }
    const target=String(body?.target||"").trim();
    if(target.length<3||target.length>500||/[\x00-\x1F]/.test(target)){
      json(res,400,{error:"invalid_target"});return true;
    }
    const requestId="n7-"+Date.now().toString(36)+"-"+crypto.randomBytes(6).toString("hex");
    lastAccepted=now;
    try {
      await githubWorkflowDispatch({
        request_id:requestId,target,aliases:"",date_range:"",
        purpose:target,selected_agents:""
      });
    }catch(err){
      json(res,502,{error:"workflow_dispatch_failed",reason:String(err.message||"unknown").slice(0,120)});
      return true;
    }
    json(res,202,{status:"ACCEPTED",agent:"N7",request_id:requestId,workflow:"jarvis-controlled-dispatch.yml"});
    return true;
  };
}
module.exports={createN7Gateway};
