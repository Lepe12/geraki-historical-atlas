"use strict";
const assert=require("node:assert/strict");
const test=require("node:test");
const {createN7Gateway}=require("./n7-gateway");
function rig(authorized=true, body={target:"Research Naxos piracy 1670"}) {
  const replies=[],dispatches=[];
  const handle=createN7Gateway({
    json:(res,status,payload)=>replies.push({status,payload}),
    operatorAuthorized:()=>authorized,
    readBody:async()=>JSON.stringify(body),
    statusFor:async()=>({run_id:"123",transport:"WEBSOCKET_LIVE",snapshot:{mission:{status:"RUNNING"},generated_utc:"2026-11-03T00:00:00Z"}}),
    githubWorkflowDispatch:async inputs=>dispatches.push(inputs)
  });
  const call=async(method,path,headers={})=>{
    const ok=await handle({method,headers},{},path);
    return {ok,...replies.at(-1),dispatches};
  };
  return {call,dispatches,replies};
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
