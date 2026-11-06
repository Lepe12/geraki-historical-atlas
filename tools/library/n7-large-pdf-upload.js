"use strict";
// N7 private large-PDF transfer. Authenticated in server.js BEFORE this handler is invoked.
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");

const MAX_FILE=200*1024*1024;
const MAX_CHUNK=4*1024*1024;
const TTL=45*60*1000;
const slots=new Map();

function validFileName(raw){
  if(typeof raw!=="string"||raw.length<1||raw.length>190)return null;
  const name=path.basename(raw.replace(/\\/g,"/"));
  if(!/\.pdf$/i.test(name)||/[\x00-\x1f<>:"|?*]/.test(name))return null;
  return name;
}
async function readSmall(req,max=2048){
  let size=0;const buffers=[];
  for await(const p of req){size+=p.length;if(size>max)throw new Error("SIZE_LIMIT");buffers.push(p);}
  return JSON.parse(Buffer.concat(buffers).toString("utf8"));
}
function evict(){
  const now=Date.now();
  for(const [id,item] of slots)if(now-item.created>TTL&&item.state!=="processing"){
    try{fs.unlinkSync(item.file);}catch(_){}
    slots.delete(id);
  }
}
function send(json,res,status,data){return json(res,status,data);}
async function hashFile(file){
  const h=crypto.createHash("sha256");
  for await(const b of fs.createReadStream(file,{highWaterMark:512*1024}))h.update(b);
  return h.digest("hex");
}
function createHandler({dataDir,json,keyPath,fetcher=fetch}){
  if(!dataDir||typeof json!=="function"||!keyPath)throw new Error("INVALID_UPLOAD_SETUP");
  const dir=path.join(dataDir,"private-large-pdf-staging");
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  return async function handle(req,res,pathname,owner){
    evict();
    if(!owner)return send(json,res,401,{error:"Authentication required"});
    if(req.method!=="POST")return send(json,res,405,{error:"Method not allowed"});
    if(pathname==="/api/library/large-pdf/start"){
      let input;try{input=await readSmall(req);}
      catch(_){return send(json,res,400,{error:"Invalid upload metadata"});}
      const size=input?.size,filename=validFileName(input?.filename);
      if(!Number.isSafeInteger(size)||size<5||size>MAX_FILE||!filename)
        return send(json,res,413,{error:"PDF must be between 5 bytes and 200 MB, with a valid filename"});
      if(slots.size>=4)return send(json,res,429,{error:"Too many simultaneous imports"});
      const id=crypto.randomBytes(20).toString("hex"),file=path.join(dir,id+".pdf");
      let fd;try{fd=fs.openSync(file,"wx",0o600);}
      catch(_){return send(json,res,503,{error:"Private upload storage unavailable"});}
      finally{if(fd!==undefined)fs.closeSync(fd);}
      slots.set(id,{file,size,filename,owner,received:0,created:Date.now(),state:"receiving"});
      return send(json,res,201,{id,chunk_bytes:MAX_CHUNK,max_bytes:MAX_FILE});
    }
    const match=pathname.match(/^\/api\/library\/large-pdf\/(chunk|finish|cancel)\/([a-f0-9]{40})$/);
    if(!match)return send(json,res,404,{error:"Unknown upload route"});
    const action=match[1],id=match[2],item=slots.get(id);
    if(!item||item.owner!==owner)return send(json,res,404,{error:"Upload session not found"});
    if(action==="cancel"){
      if(item.state==="processing")return send(json,res,409,{error:"Import already processing"});
      slots.delete(id);try{fs.unlinkSync(item.file);}catch(_){}
      return send(json,res,200,{status:"CANCELLED"});
    }
    if(action==="chunk"){
      if(item.state!=="receiving")return send(json,res,409,{error:"Upload is not receiving"});
      const offset=Number(req.headers["x-upload-offset"]);
      if(!Number.isSafeInteger(offset)||offset!==item.received)
        return send(json,res,409,{error:"Chunk offset mismatch",received:item.received});
      if(Number(req.headers["content-length"]||0)>MAX_CHUNK)
        return send(json,res,413,{error:"PDF chunk exceeds 4 MB"});
      let fd,bytes=0;
      try{
        fd=fs.openSync(item.file,"r+");
        for await(const data of req){
          bytes+=data.length;
          if(bytes>MAX_CHUNK||offset+bytes>item.size)throw new Error("CHUNK_TOO_LARGE");
          let written=0;
          while(written<data.length){
            written+=fs.writeSync(fd,data,written,data.length-written,offset+bytes-data.length+written);
          }
        }
        if(bytes===0)throw new Error("EMPTY_CHUNK");
        fs.fsyncSync(fd);
        item.received+=bytes;
        return send(json,res,200,{received:item.received,total:item.size});
      }catch(e){
        if(fd!==undefined)try{fs.ftruncateSync(fd,offset);}catch(_){}
        return send(json,res,e.message==="CHUNK_TOO_LARGE"?413:400,{error:"Upload chunk rejected"});
      }finally{if(fd!==undefined)fs.closeSync(fd);}
    }
    if(item.state!=="receiving"||item.received!==item.size)
      return send(json,res,409,{error:"Incomplete upload",received:item.received,total:item.size});
    item.state="processing";
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),300000);
    try{
      const key=fs.readFileSync(keyPath);
      if(key.length!==32)throw new Error("BRIDGE_KEY_UNAVAILABLE");
      const digest=await hashFile(item.file);
      const ts=String(Math.floor(Date.now()/1000));
      const signature=crypto.createHmac("sha256",key).update(ts+"."+digest).digest("hex");
      const response=await fetcher("https://pct-live.piratecartography.com/pct-api/live/n7/library/upload-signed",{
        method:"POST",redirect:"error",signal:controller.signal,duplex:"half",
        headers:{"Content-Type":"application/pdf","Content-Length":String(item.size),
          "X-File-Name":encodeURIComponent(item.filename),
          "X-N7-Library-Ts":ts,"X-N7-Library-Signature":signature,"X-N7-Library-Digest":digest},
        body:fs.createReadStream(item.file,{highWaterMark:512*1024})
      });
      const payload=await response.json().catch(()=>({}));
      if(response.status===201&&payload.status==="DATABASE_COMMITTED")
        return send(json,res,201,{status:"IMPORTED",source_id:payload.source_id,
          imported_pages:payload.imported_pages,searchable_pages:payload.searchable_pages,
          ocr_pending_pages:payload.ocr_pending_pages,historically_verified:false});
      return send(json,res,response.status===413?413:503,{
        error:String(payload.error||payload.reason||"Private PDF import failed").slice(0,110),
        imported_pages:Number(payload.imported_pages)||0});
    }catch(_){return send(json,res,503,{error:"Large PDF transfer or extraction unavailable"});}
    finally{
      clearTimeout(timer);slots.delete(id);
      try{fs.unlinkSync(item.file);}catch(_){}
    }
  };
}
module.exports={createHandler,MAX_FILE,MAX_CHUNK,validFileName};
