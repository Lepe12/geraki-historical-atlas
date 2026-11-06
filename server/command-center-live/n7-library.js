"use strict";
const path=require("node:path");
const {execFile}=require("node:child_process");

// PRIVATE read-only page search for the authenticated N7 chat.
// Do not serve private page text to anonymous users or expose database credentials.
function createN7Library({json,readBody,operatorAuthorized,sessionAuthorized,runCli=null,env=process.env}){
  const cli=runCli||((args)=>new Promise((resolve,reject)=>{
    const bin=env.PCT_PHP_BIN||"/opt/plesk/php/8.4/bin/php";
    const script=env.PCT_N7_LIBRARY_CLI||path.resolve(__dirname,"../../tools/library/n7_library.php");
    execFile(bin,[script,...args],{timeout:12000,maxBuffer:300000,windowsHide:true},(error,stdout)=>{
      if(error)return reject(error);
      try{resolve(JSON.parse(stdout));}catch(_){reject(new Error("invalid_library_reply"));}
    });
  }));
  return async function handle(req,res,p,u) {
    if(!["/n7/library/search","/n7/library/page"].includes(p))return false;
    const origin=String(req.headers.origin||"");
    const bot=origin==="https://bot.piratecartography.com" &&
      req.headers["x-nabou-agent-room"]==="1" && sessionAuthorized(req);
    const admin=operatorAuthorized(req) &&
      (!origin||["https://bot.piratecartography.com","https://pct-live.piratecartography.com","https://lepe12.github.io"].includes(origin));
    if(!bot&&!admin){json(res,401,{error:"library_auth_required"});return true;}
    if(req.method!==(p.endsWith("/search")?"POST":"GET")){json(res,405,{error:"method_not_allowed"});return true;}
    let args;
    if(p.endsWith("/search")){
      let body;
      try{body=JSON.parse(await readBody(req,4096));}catch(_){json(res,400,{error:"invalid_json"});return true;}
      const term=body?.query;
      if(typeof term!=="string"||term.trim().length<2||term.length>150||/[\u0000-\u001f]/u.test(term)){
        json(res,400,{error:"invalid_library_query"});return true;
      }
      args=["search",term.trim()];
    }else{
      const id=u.searchParams.get("source_id")||"",index=u.searchParams.get("scan_index")||"";
      if(!/^[a-f0-9]{64}$/.test(id)||!/^[1-9][0-9]{0,8}$/.test(index)){
        json(res,400,{error:"invalid_page_reference"});return true;
      }
      args=["page",id,index];
    }
    try{
      const result=await runCli(args);
      json(res,200,{schema:"n7-library-read-v1",...result,scientific_status:"UNVERIFIED_SOURCE_TEXT"});
    }catch(_){json(res,503,{error:"library_backend_unavailable"});}
    return true;
  };
}
module.exports={createN7Library};
