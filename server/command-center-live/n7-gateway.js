"use strict";
const crypto=require("node:crypto");
const {execFile}=require("node:child_process");
const path=require("node:path");

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

// Routes are explicitly scoped to the existing live service. No shell,
// database writer, privileged host action, or arbitrary workflow selection.
function createN7Gateway({json,operatorAuthorized,sessionAuthorized=()=>false,readBody,statusFor,githubWorkflowDispatch,githubCodingDispatch,githubPrivateDispatch,libraryRunner=readPrivateLibrary}) {
  let lastAccepted=0;
  return async function handleN7(req,res,p) {
    if (p!=="/n7/status" && p!=="/n7/dispatch" && p!=="/n7/code" && p!=="/n7/brain/task" && p!=="/n7/library/search" && p!=="/n7/library/page") return false;
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
    if(p==="/n7/library/search" || p==="/n7/library/page"){
      if(req.method!=="GET"){json(res,405,{error:"method_not_allowed"});return true;}
      // Public pages and untrusted origins are forbidden even when the URL is known.
      const origin=String(req.headers.origin||"");
      if(origin && !["https://lepe12.github.io","https://pct-live.piratecartography.com","https://bot.piratecartography.com"].includes(origin)){
        json(res,403,{error:"origin_not_allowed"});return true;
      }
      if(!operatorAuthorized(req) && !sessionAuthorized(req)){
        json(res,401,{error:"operator_authorization_required"});return true;
      }
      const params=new URL(req.url||p,"http://localhost").searchParams;
      let command,argument;
      if(p==="/n7/library/search"){
        const term=String(params.get("q")||"").trim();
        if(term.length<2||term.length>150||[...term].some(x=>x.codePointAt(0)<32)){
          json(res,400,{error:"invalid_library_query"});return true;
        }
        command="search";argument=[term];
      }else{
        const id=String(params.get("source_id")||"");
        const scan=String(params.get("scan_index")||"");
        if(!/^[a-f0-9]{64}$/.test(id)||!(/^[1-9][0-9]{0,9}$/.test(scan))||Number(scan)>4294967295){
          json(res,400,{error:"invalid_page_reference"});return true;
        }
        command="page";argument=[id,scan];
      }
      try{
        const data=await libraryRunner(command,argument);
        json(res,200,{schema:"n7-private-library-read-v1",operation:command,
          result:data,historically_verified:false});
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
