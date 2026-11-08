"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {createN7Gateway}=require("./n7-gateway");

function rig(payload={target:"Naxos",purpose:"Research Naxos piracy in 1600-1700"}){
  const out=[],dispatches=[],lookups=[];
  const handle=createN7Gateway({
    json:(_res,status,value)=>out.push({status,value}),
    readBody:async()=>JSON.stringify(payload),
    operatorAuthorized:()=>false,
    sessionAuthorized:()=>false,
    statusFor:async()=>({snapshot:null,run_id:"none"}),
    missionBridgeVerifier:(req,raw)=>req.headers["x-test-hmac"]==="valid"&&
      !req.headers.origin&&raw===JSON.stringify(payload),
    githubResearchDispatch:async input=>dispatches.push(input),
    githubResearchStatus:async requestId=>{
      lookups.push(requestId);
      return {status:"PIPELINE_IN_PROGRESS",research_run_id:12345,
        research_url:"https://github.com/Lepe12/geraki-historical-atlas/actions/runs/12345"};
    }
  });
  const call=async(method,path,headers={})=>{
    await handle({method,headers},{},path);
    return out.at(-1);
  };
  return {call,dispatches,lookups};
}

test("N7 signed mission refuses unauthenticated and cross-origin submissions",async()=>{
  const x=rig();
  const endpoint="/n7/mission/dispatch-signed";
  assert.equal((await x.call("POST",endpoint)).status,401);
  assert.equal((await x.call("POST",endpoint,{"x-test-hmac":"valid",origin:"https://evil.test"})).status,401);
  assert.equal((await x.call("GET",endpoint,{"x-test-hmac":"valid"})).status,405);
  assert.equal(x.dispatches.length,0);
});

test("N7 signed mission emits fixed, bounded workflow inputs",async()=>{
  const prev=process.env.PCT_GITHUB_DISPATCH_TOKEN;
  process.env.PCT_GITHUB_DISPATCH_TOKEN="local-fixture-only";
  try{
    const x=rig();
    const start=await x.call("POST","/n7/mission/dispatch-signed",{"x-test-hmac":"valid"});
    assert.equal(start.status,202);
    assert.match(start.value.request_id,/^n7mission-[a-f0-9]{24}$/);
    assert.equal(start.value.workflow,"n7-research-orchestrate.yml");
    assert.equal(start.value.historically_verified,false);
    assert.equal(start.value.publication_allowed,false);
    assert.deepEqual(Object.keys(x.dispatches[0]).sort(),["aliases","date_range","purpose","request_id","target"]);
    assert.equal(x.dispatches[0].target,"Naxos");
    assert.equal((await x.call("POST","/n7/mission/dispatch-signed",{"x-test-hmac":"valid"})).status,429);
  }finally{
    if(prev===undefined)delete process.env.PCT_GITHUB_DISPATCH_TOKEN;
    else process.env.PCT_GITHUB_DISPATCH_TOKEN=prev;
  }
});

test("N7 signed mission rejects unsafe and unbounded requests",async()=>{
  const cases=[
    {target:"x",purpose:"Investigate Naxos piracy"},
    {target:"Naxos",purpose:"short"},
    {target:"Naxos\nunsafe",purpose:"Investigate Naxos piracy"},
    {target:"Naxos",purpose:"Investigate Naxos piracy",aliases:"a".repeat(221)}
  ];
  for(const payload of cases){
    const x=rig(payload);
    assert.equal((await x.call("POST","/n7/mission/dispatch-signed",{"x-test-hmac":"valid"})).status,400);
    assert.equal(x.dispatches.length,0);
  }
});

test("N7 signed status checks strict mission IDs and never claims verified",async()=>{
  const wrong=rig({request_id:"../unsafe"});
  assert.equal((await wrong.call("POST","/n7/mission/status-signed",{"x-test-hmac":"valid"})).status,400);
  const x=rig({request_id:"n7mission-"+"a".repeat(24)});
  const status=await x.call("POST","/n7/mission/status-signed",{"x-test-hmac":"valid"});
  assert.equal(status.status,200);
  assert.equal(status.value.status,"PIPELINE_IN_PROGRESS");
  assert.equal(status.value.historically_verified,false);
  assert.equal(status.value.publication_allowed,false);
  assert.equal(x.lookups.length,1);
});
