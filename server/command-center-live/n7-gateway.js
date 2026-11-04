"use strict";
const crypto=require("node:crypto");

// Routes are explicitly scoped to the existing live service. No shell,
// database writer, privileged host action, or arbitrary workflow selection.
function createN7Gateway({json,operatorAuthorized,readBody,statusFor,githubWorkflowDispatch,githubCodingDispatch}) {
  let lastAccepted=0;
  return async function handleN7(req,res,p) {
    if (p!=="/n7/status" && p!=="/n7/dispatch" && p!=="/n7/code") return false;
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
    if(req.method!=="POST"){json(res,405,{error:"method_not_allowed"});return true;}
    if(!operatorAuthorized(req)){json(res,401,{error:"operator_authorization_required"});return true;}
    if(!String(process.env.PCT_GITHUB_DISPATCH_TOKEN||"")){json(res,503,{error:"dispatch_not_configured"});return true;}
    // Enforce a same-origin operator flow or a server-side client with no Origin.
    // An arbitrary browser origin is not sufficient even with a bearer token.
    const origin=String(req.headers.origin||"");
    if(origin && origin!=="https://lepe12.github.io" && origin!=="https://pct-live.piratecartography.com"){json(res,403,{error:"origin_not_allowed"});return true;}
    const now=Date.now();
    if(now-lastAccepted<10000){json(res,429,{error:"n7_rate_limited"});return true;}
    let body;
    try {body=JSON.parse(await readBody(req));}
    catch(_){json(res,400,{error:"invalid_json"});return true;}
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
