"use strict";
const assert=require("node:assert/strict");
const test=require("node:test");
const {createN7Gateway}=require("./n7-gateway");
function rig(authorized=true, body={target:"Research Naxos piracy 1670"}) {
  const replies=[],dispatches=[],codingDispatches=[],privateDispatches=[];
  const handle=createN7Gateway({
    json:(res,status,payload)=>replies.push({status,payload}),
    operatorAuthorized:()=>authorized,
    readBody:async()=>JSON.stringify(body),
    statusFor:async()=>({run_id:"123",transport:"WEBSOCKET_LIVE",snapshot:{mission:{status:"RUNNING"},generated_utc:"2026-11-03T00:00:00Z"}}),
    githubWorkflowDispatch:async inputs=>dispatches.push(inputs),
    githubCodingDispatch:async inputs=>codingDispatches.push(inputs),
    githubPrivateDispatch:async inputs=>privateDispatches.push(inputs)
  });
  const call=async(method,path,headers={})=>{
    const ok=await handle({method,headers},{},path);
    return {ok,...replies.at(-1),dispatches};
  };
  return {call,dispatches,codingDispatches,privateDispatches,replies};
}
test("unknown routes are left untouched",async()=>{
  const x=rig();assert.equal((await x.call("GET","/health")).ok,false);assert.equal(x.replies.length,0);
});
test("status is read-only and contains no token",async()=>{
  const x=rig(false);const r=await x.call("GET","/n7/status");
  assert.equal(r.status,200);assert.equal(r.payload.agent,"N7");
  assert.equal(r.payload.state,"RUNNING");assert.equal(r.payload.can_dispatch,false);
  assert.equal(x.dispatches.length,0);
});
test("unauthenticated dispatch fails closed",async()=>{
  process.env.PCT_GITHUB_DISPATCH_TOKEN="test-placeholder";
  const x=rig(false);const r=await x.call("POST","/n7/dispatch");
  assert.equal(r.status,401);assert.equal(x.dispatches.length,0);
});
test("authorized dispatch only sends fixed workflow inputs",async()=>{
  process.env.PCT_GITHUB_DISPATCH_TOKEN="test-placeholder";
  const x=rig();const r=await x.call("POST","/n7/dispatch",{authorization:"Bearer test"});
  assert.equal(r.status,202);assert.equal(x.dispatches.length,1);
  assert.equal(x.dispatches[0].target,"Research Naxos piracy 1670");
  assert.equal(x.dispatches[0].selected_agents,"");
  assert.equal((await x.call("POST","/n7/dispatch")).status,429);
});
test("reject untrusted browser origins",async()=>{
  process.env.PCT_GITHUB_DISPATCH_TOKEN="test-placeholder";
  const x=rig();assert.equal((await x.call("POST","/n7/dispatch",{origin:"https://evil.example"})).status,403);
  assert.equal(x.dispatches.length,0);
});
test("reject invalid targets",async()=>{
  process.env.PCT_GITHUB_DISPATCH_TOKEN="test-placeholder";
  const x=rig(true,{target:"a"});
  assert.equal((await x.call("POST","/n7/dispatch")).status,400);
  assert.equal(x.dispatches.length,0);
});

test("N7 routes bounded coding tasks to Qwen 7B in preview-only mode",async()=>{
  process.env.PCT_GITHUB_DISPATCH_TOKEN="test-placeholder";
  const x=rig(true,{task:"Improve keyboard focus visibility",target_files:[
    "jarvis-intelligence-chamber/navigation-rail.css",
    "jarvis-intelligence-chamber/photon-windows.css"
  ]});
  const r=await x.call("POST","/n7/code");
  assert.equal(r.status,202);assert.equal(r.payload.mode,"preview_only");
  assert.equal(x.codingDispatches.length,1);
  assert.equal(x.codingDispatches[0].apply_changes,"false");
  assert.equal(x.dispatches.length,0);
});
test("N7 coding requires operator and rejects protected paths or unconfirmed apply",async()=>{
  process.env.PCT_GITHUB_DISPATCH_TOKEN="test-placeholder";
  const ok={task:"Improve keyboard focus visibility",target_files:[
    "jarvis-intelligence-chamber/navigation-rail.css",
    "jarvis-intelligence-chamber/photon-windows.css"
  ]};
  assert.equal((await rig(false,ok).call("POST","/n7/code")).status,401);
  assert.equal((await rig(true,{...ok,apply_changes:true}).call("POST","/n7/code")).status,400);
  assert.equal((await rig(true,{...ok,target_files:["server/command-center-live/app.js",
    "jarvis-intelligence-chamber/photon-windows.css"]}).call("POST","/n7/code")).status,400);
});

test("same-origin Plesk operator coding preview is permitted",async()=>{
  process.env.PCT_GITHUB_DISPATCH_TOKEN="test-placeholder";
  const x=rig(true,{task:"Review mobile readability in preview mode",target_files:[
    "jarvis-intelligence-chamber/navigation-rail.css",
    "jarvis-intelligence-chamber/photon-windows.css"
  ],apply_changes:false});
  const r=await x.call("POST","/n7/code",{origin:"https://pct-live.piratecartography.com"});
  assert.equal(r.status,202);
  assert.equal(x.codingDispatches.length,1);
  assert.equal(x.codingDispatches[0].apply_changes,"false");
});

test("authorized explicit draft PR request dispatches bounded apply",async()=>{
  process.env.PCT_GITHUB_DISPATCH_TOKEN="test-placeholder";
  const payload={task:"Improve Photon panel mobile readability without touching 3D",target_files:[
    "jarvis-intelligence-chamber/navigation-rail.css",
    "jarvis-intelligence-chamber/photon-windows.css"
  ],apply_changes:true,confirm_draft_pr:true};
  const x=rig(true,payload);
  const response=await x.call("POST","/n7/code",{origin:"https://pct-live.piratecartography.com"});
  assert.equal(response.status,202);
  assert.equal(response.payload.mode,"draft_pr");
  assert.equal(x.codingDispatches.length,1);
  assert.equal(x.codingDispatches[0].apply_changes,"true");
  assert.equal(x.codingDispatches[0].task,payload.task);
});
test("unconfirmed draft request and unsupported mode are rejected",async()=>{
  process.env.PCT_GITHUB_DISPATCH_TOKEN="test-placeholder";
  const ok={task:"Improve mobile panel readability",target_files:[
    "jarvis-intelligence-chamber/navigation-rail.css",
    "jarvis-intelligence-chamber/photon-windows.css"
  ]};
  const noConfirm=rig(true,{...ok,apply_changes:true,confirm_draft_pr:false});
  assert.equal((await noConfirm.call("POST","/n7/code")).status,400);
  assert.equal(noConfirm.codingDispatches.length,0);
  const wrongType=rig(true,{...ok,apply_changes:"true",confirm_draft_pr:true});
  assert.equal((await wrongType.call("POST","/n7/code")).status,400);
});

test("dedicated bot subdomain may dispatch only an authenticated bounded coding task",async()=>{
  process.env.PCT_GITHUB_DISPATCH_TOKEN="test-placeholder";
  const request={task:"Improve NABOU mobile panel spacing",target_files:[
    "jarvis-intelligence-chamber/navigation-rail.css",
    "jarvis-intelligence-chamber/photon-windows.css"
  ],apply_changes:false};
  const x=rig(true,request);
  const accepted=await x.call("POST","/n7/code",{origin:"https://bot.piratecartography.com"});
  assert.equal(accepted.status,202);
  assert.equal(x.codingDispatches.length,1);
  assert.equal(x.codingDispatches[0].apply_changes,"false");
  const blocked=rig(false,request);
  assert.equal((await blocked.call("POST","/n7/code",{origin:"https://bot.piratecartography.com"})).status,401);
});

test("GitHub signed session authorizes code tasks only from dedicated bot with CSRF header",async()=>{
  process.env.PCT_GITHUB_DISPATCH_TOKEN="test-placeholder";
  const body={task:"Improve mobile CSS accessibility",target_files:[
    "jarvis-intelligence-chamber/navigation-rail.css",
    "jarvis-intelligence-chamber/photon-windows.css"
  ],apply_changes:false};
  const replies=[],calls=[];
  const handle=createN7Gateway({
    json:(res,status,payload)=>replies.push({status,payload}),
    operatorAuthorized:()=>false,
    sessionAuthorized:()=>true,
    readBody:async()=>JSON.stringify(body),
    statusFor:async()=>({snapshot:null,run_id:"latest",transport:"no"}),
    githubCodingDispatch:async inputs=>calls.push(inputs),
    githubWorkflowDispatch:async()=>{}
  });
  async function call(origin,csrf){
    await handle({method:"POST",headers:{origin,...(csrf?{"x-nabou-agent-room":"1"}:{})}},{}, "/n7/code");
    return replies.at(-1).status;
  }
  assert.equal(await call("https://evil.example",true),401);
  assert.equal(await call("https://bot.piratecartography.com",false),401);
  assert.equal(await call("https://bot.piratecartography.com",true),202);
  assert.equal(calls.length,1);
});


test("authorized private N7 task dispatches only the selected reviewed skill",async()=>{
  process.env.PCT_GITHUB_DISPATCH_TOKEN="test-placeholder";
  const task="Επιμελήσου το απόσπασμα με σεβασμό στο αρχικό ύφος.\nΣυνέχισε με την επόμενη παράγραφο.";
  const x=rig(true,{task,skill:"greek-prose-editor"});
  const result=await x.call("POST","/n7/brain/task");
  assert.equal(result.status,202);
  assert.equal(result.payload.worker,"private-Qwen2.5-3B");
  assert.deepEqual(x.privateDispatches,[{task,skill:"greek-prose-editor"}]);
  assert.equal(x.codingDispatches.length,0);
  assert.equal(x.dispatches.length,0);
});
test("private skill dispatch rejects unknown skills, unauthenticated and cross-site requests",async()=>{
  process.env.PCT_GITHUB_DISPATCH_TOKEN="test-placeholder";
  const task="Έλεγξε τις πηγές για την ιστορία του 16ου αιώνα.";
  const denied=rig(false,{task,skill:"historical-source-audit"});
  assert.equal((await denied.call("POST","/n7/brain/task")).status,401);
  const invalid=rig(true,{task,skill:"execute-shell"});
  assert.equal((await invalid.call("POST","/n7/brain/task")).status,400);
  assert.equal(invalid.privateDispatches.length,0);
  const cross=rig(true,{task,skill:"greek-prose-editor"});
  assert.equal((await cross.call("POST","/n7/brain/task",{origin:"https://evil.example"})).status,403);
  assert.equal(cross.privateDispatches.length,0);
});
test("private N7 dispatch only accepts signed owner bot origin and CSRF header",async()=>{
  process.env.PCT_GITHUB_DISPATCH_TOKEN="test-placeholder";
  const calls=[],replies=[];
  const task="Διόρθωσε τη στίξη στο σύντομο ελληνικό απόσπασμα.";
  const handle=createN7Gateway({
    json:(res,status,payload)=>replies.push({status,payload}),
    operatorAuthorized:()=>false,
    sessionAuthorized:()=>true,
    readBody:async()=>JSON.stringify({task,skill:"greek-prose-editor"}),
    statusFor:async()=>({run_id:"latest"}),
    githubPrivateDispatch:async input=>calls.push(input)
  });
  async function request(origin,csrf){
    await handle({method:"POST",headers:{origin,...(csrf?{"x-nabou-agent-room":"1"}:{})}},{}, "/n7/brain/task");
    return replies.at(-1).status;
  }
  assert.equal(await request("https://evil.example",true),401);
  assert.equal(await request("https://bot.piratecartography.com",false),401);
  assert.equal(await request("https://bot.piratecartography.com",true),202);
  assert.equal(calls.length,1);
});

test("N7 library reads exact pages only for authenticated operators",async()=>{
  const replies=[],calls=[];
  let allow=false;
  const handle=createN7Gateway({
    json:(_res,status,payload)=>replies.push({status,payload}),
    operatorAuthorized:()=>allow,sessionAuthorized:()=>false,
    statusFor:async()=>({snapshot:null}),
    libraryRunner:async(cmd,args)=>{
      calls.push({cmd,args});
      return cmd==="search"?{matches:[{title:"Laskaris",scan_index:12,printed_page:"9",excerpt:"Λάντζας"}]}:
        {source_id:args[0],scan_index:Number(args[1]),printed_page:"9",ocr_text:"Λάντζας"};
    }
  });
  const request=async(url,p,headers={})=>{
    await handle({method:"GET",url,headers},{},p);
    return replies.at(-1);
  };
  const searchPath="/n7/library/search";
  const url="/pct-api/live/n7/library/search?q="+encodeURIComponent("Λάντζας");
  assert.equal((await request(url,searchPath)).status,401);
  allow=true;
  assert.equal((await request(url,searchPath,{origin:"https://evil.example"})).status,403);
  const search=await request(url,searchPath,{origin:"https://bot.piratecartography.com"});
  assert.equal(search.status,200);
  assert.equal(search.payload.result.matches[0].printed_page,"9");
  assert.equal(search.payload.historically_verified,false);
  const id="a".repeat(64);
  const page=await request("/n7/library/page?source_id="+id+"&scan_index=12","/n7/library/page");
  assert.equal(page.status,200);
  assert.equal(page.payload.result.ocr_text,"Λάντζας");
  assert.deepEqual(calls.map(x=>x.cmd),["search","page"]);
  assert.equal((await request("/n7/library/page?source_id=bad&scan_index=12","/n7/library/page")).status,400);
  assert.equal((await request("/n7/library/search?q=a","/n7/library/search")).status,400);
  assert.equal(calls.length,2);
});

test("private library PDF upload is OAuth and origin protected",async()=>{
  const replies=[],invoked=[];
  let allowed=false;
  const handle=createN7Gateway({
    json:(_res,status,payload)=>replies.push({status,payload}),
    operatorAuthorized:()=>false,
    sessionAuthorized:()=>allowed,
    statusFor:async()=>({run_id:"latest",snapshot:null}),
    libraryUploadRunner:async req=>{
      invoked.push(req.headers["content-type"]);
      return {status:"DATABASE_COMMITTED",imported_pages:2,
        source_id:"b".repeat(64),historically_verified:false};
    }
  });
  async function call(method,headers){
    await handle({method,headers},{}, "/n7/library/upload");
    return replies.at(-1);
  }
  const headers={origin:"https://bot.piratecartography.com",
    "x-nabou-agent-room":"1","content-type":"application/pdf"};
  assert.equal((await call("POST",headers)).status,401);
  allowed=true;
  assert.equal((await call("POST",{...headers,origin:"https://untrusted.example"})).status,403);
  assert.equal((await call("POST",{...headers,"x-nabou-agent-room":""})).status,403);
  assert.equal((await call("POST",{...headers,"content-type":"text/plain"})).status,415);
  assert.equal((await call("GET",headers)).status,405);
  const result=await call("POST",headers);
  assert.equal(result.status,201);
  assert.equal(result.payload.imported_pages,2);
  assert.equal(result.payload.historically_verified,false);
  assert.deepEqual(invoked,["application/pdf"]);
});


test("N7 chat POST search accepts query and returns flat matches while legacy GET remains intact",async()=>{
  const out=[],calls=[];
  const handle=createN7Gateway({
    json:(_r,status,payload)=>out.push({status,payload}),
    operatorAuthorized:()=>true,
    sessionAuthorized:()=>false,
    readBody:async()=>JSON.stringify({query:"Λάντζας"}),
    statusFor:async()=>({snapshot:null}),
    libraryRunner:async (command,args)=>{calls.push({command,args});return {matches:[{source_id:"a".repeat(64),title:"Λάσκαρις",scan_index:3,printed_page:"15",excerpt:"Λάντζας"}]};}
  });
  await handle({method:"POST",url:"/pct-api/live/n7/library/search",headers:{origin:"https://bot.piratecartography.com"}},{}, "/n7/library/search");
  assert.equal(out.at(-1).status,200);
  assert.equal(out.at(-1).payload.schema,"n7-library-read-v1");
  assert.equal(out.at(-1).payload.matches[0].printed_page,"15");
  assert.deepEqual(calls[0],{command:"search",args:["Λάντζας"]});
  await handle({method:"POST",url:"/pct-api/live/n7/library/page",headers:{}},{}, "/n7/library/page");
  assert.equal(out.at(-1).status,405);
  await handle({method:"GET",url:"/pct-api/live/n7/library/search?q=Lanza",headers:{}},{}, "/n7/library/search");
  assert.equal(out.at(-1).payload.schema,"n7-private-library-read-v1");
});


test("existing N7 login can delegate read-only search with verified server signature",async()=>{
  const replies=[],calls=[];
  let authorized=false;
  const handler=createN7Gateway({
    json:(_r,status,payload)=>replies.push({status,payload}),
    operatorAuthorized:()=>false,sessionAuthorized:()=>false,
    libraryBridgeVerifier:(req,raw)=>authorized && req.headers["x-n7-library-signature"]==="signed" && raw.includes("Λάντζας"),
    readBody:async()=>JSON.stringify({query:"Λάντζας"}),
    libraryRunner:async (command,args)=>{calls.push({command,args});return {matches:[{title:"Laskaris",scan_index:7,printed_page:"11",excerpt:"Λάντζας"}]};}
  });
  const req={method:"POST",url:"/pct-api/live/n7/library/search",headers:{"x-n7-library-signature":"signed"}};
  await handler(req,{},"/n7/library/search");
  assert.equal(replies.at(-1).status,401);
  authorized=true;
  await handler(req,{},"/n7/library/search");
  assert.equal(replies.at(-1).status,200);
  assert.equal(replies.at(-1).payload.matches[0].printed_page,"11");
  assert.deepEqual(calls,[{command:"search",args:["Λάντζας"]}]);
  await handler({...req,headers:{...req.headers,origin:"https://evil.test"}},{},"/n7/library/search");
  assert.equal(replies.at(-1).status,403);
});


test("signed public-domain import refuses anonymous requests and unlisted Gutenberg IDs",async()=>{
  const replies=[];
  let payload={gutenberg_id:"99999"};
  const handler=createN7Gateway({
    json:(_res,status,data)=>replies.push({status,data}),
    operatorAuthorized:()=>false,sessionAuthorized:()=>false,
    readBody:async()=>JSON.stringify(payload),
    statusFor:async()=>({snapshot:null})
  });
  await handler({method:"POST",headers:{},url:"/pct-api/live/n7/library/import-signed"},{}, "/n7/library/import-signed");
  assert.equal(replies.at(-1).status,401);
  await handler({method:"GET",headers:{},url:"/pct-api/live/n7/library/import-signed"},{}, "/n7/library/import-signed");
  assert.equal(replies.at(-1).status,405);
});
