"use strict";
const assert=require("node:assert/strict");
const test=require("node:test");
const {createN7Gateway}=require("./n7-gateway");
function rig(authorized=true, body={target:"Research Naxos piracy 1670"}) {
  const replies=[],dispatches=[],codingDispatches=[];
  const handle=createN7Gateway({
    json:(res,status,payload)=>replies.push({status,payload}),
    operatorAuthorized:()=>authorized,
    readBody:async()=>JSON.stringify(body),
    statusFor:async()=>({run_id:"123",transport:"WEBSOCKET_LIVE",snapshot:{mission:{status:"RUNNING"},generated_utc:"2026-11-03T00:00:00Z"}}),
    githubWorkflowDispatch:async inputs=>dispatches.push(inputs),
    githubCodingDispatch:async inputs=>codingDispatches.push(inputs)
  });
  const call=async(method,path,headers={})=>{
    const ok=await handle({method,headers},{},path);
    return {ok,...replies.at(-1),dispatches};
  };
  return {call,dispatches,codingDispatches,replies};
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
