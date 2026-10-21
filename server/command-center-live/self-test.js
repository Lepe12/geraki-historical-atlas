"use strict";
const assert=require("assert");
process.env.PCT_COMMAND_CENTER_PREFIX="/pct-api/live";
const {normalizePath,frameText,safeEqual}=require("./app");
assert.strictEqual(normalizePath("/pct-api/live/health"),"/health");
assert.strictEqual(normalizePath("/health"),"/health");
const a=frameText("ok");assert.strictEqual(a[0],0x81);assert.strictEqual(a[1],2);assert.strictEqual(a.slice(2).toString(),"ok");
const long=frameText("x".repeat(200));assert.strictEqual(long[1],126);assert.strictEqual(long.readUInt16BE(2),200);
assert.strictEqual(safeEqual("abc","abc"),true);assert.strictEqual(safeEqual("abc","abd"),false);assert.strictEqual(safeEqual("",""),false);
console.log("COMMAND CENTER LIVE SERVICE SELF-TEST PASS");

// Reproduce the audited latest-run failure in an isolated, non-listening server.
const fs=require('node:fs'),vm=require('node:vm');
const sandbox={require,module:{exports:{}},process:{env:{}},console,Buffer,URL,setInterval,setImmediate};
vm.runInNewContext(fs.readFileSync(require.resolve('./app'),'utf8')+'\nbaseline={schema:"pct-command-center-live-v1",run_id:"100",events:[]};baselineFetchedAt=Date.now();addEvent({schema:"pct-jarvis-event-v1",run_id:"200",event_id:"unit-1",agent_id:"greek",status:"RUNNING"});',sandbox);
sandbox.module.exports.statusFor('latest').then(s=>{assert.equal(s.run_id,'200');assert.equal(s.snapshot.run_id,'200');assert.equal(s.snapshot.claims.length,0);assert.equal(s.snapshot.agents[0].status,'RUNNING');assert.equal(s.snapshot.safety.automatic_verified,false);console.log('LATEST LIVE RUN ISOLATION PASS');}).catch(e=>{console.error(e);process.exitCode=1});

// A large UTF-8 baseline must be measured once per incoming chunk; concurrent
// health/status calls share the same refresh instead of multiplying downloads.
const {EventEmitter}=require('node:events');
let downloads=0,maxMeasuredChunk=0;
const fixture=JSON.stringify({schema:'pct-command-center-live-v1',run_id:'999',events:[],text:'Ελληνικά '.repeat(200000)});
const upstream={get(url,options,callback){
  downloads++;
  const request=new EventEmitter();request.setTimeout=()=>request;request.destroy=()=>{};
  process.nextTick(()=>{
    const response=new EventEmitter();response.statusCode=200;response.setEncoding=()=>{};
    let destroyed=false;response.destroy=()=>{destroyed=true;};callback(response);
    for(let i=0;i<fixture.length&&!destroyed;i+=4096)response.emit('data',fixture.slice(i,i+4096));
    if(!destroyed)response.emit('end');
  });
  return request;
}};
const measuredBuffer=new Proxy(Buffer,{get(target,key){
  if(key==='byteLength')return value=>{maxMeasuredChunk=Math.max(maxMeasuredChunk,value.length);return Buffer.byteLength(value);};
  return target[key];
}});
const largeSandbox={require:name=>name==='https'?upstream:require(name),module:{exports:{}},process:{env:{}},console,Buffer:measuredBuffer,URL,setInterval,setImmediate};
vm.runInNewContext(fs.readFileSync(require.resolve('./app'),'utf8')+'\nmodule.exports.testGetJson=getJson;',largeSandbox);
(async()=>{
  const api=largeSandbox.module.exports;
  const [a,b]=await Promise.all([api.statusFor('latest'),api.statusFor('latest')]);
  assert.equal(downloads,1);assert.equal(a.run_id,'999');assert.equal(b.run_id,'999');
  assert(maxMeasuredChunk<=4096,'reader remeasured accumulated snapshot');
  await assert.rejects(api.testGetJson('https://example.org/oversized',100),/response_too_large/);
  console.log('LARGE UTF8 BASELINE SINGLE REFRESH PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
