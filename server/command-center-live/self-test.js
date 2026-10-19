"use strict";
const assert=require("assert");
process.env.PCT_COMMAND_CENTER_PREFIX="/pct-api/live";
const {normalizePath,frameText,safeEqual,allowedOrigin,trustedWebOrigin,upstreamWithinLimit,MAX_UPSTREAM_BYTES}=require("./app");
assert.strictEqual(normalizePath("/pct-api/live/health"),"/health");
assert.strictEqual(normalizePath("/health"),"/health");
const a=frameText("ok");assert.strictEqual(a[0],0x81);assert.strictEqual(a[1],2);assert.strictEqual(a.slice(2).toString(),"ok");
const long=frameText("x".repeat(200));assert.strictEqual(long[1],126);assert.strictEqual(long.readUInt16BE(2),200);
assert.strictEqual(safeEqual("abc","abc"),true);assert.strictEqual(safeEqual("abc","abd"),false);assert.strictEqual(safeEqual("",""),false);
assert.strictEqual(MAX_UPSTREAM_BYTES>=2_500_000,true);
assert.strictEqual(upstreamWithinLimit(2_481_546),true);
assert.strictEqual(upstreamWithinLimit(2_500_000),true);
assert.strictEqual(upstreamWithinLimit(MAX_UPSTREAM_BYTES+1),false);
assert.strictEqual(allowedOrigin({headers:{origin:"https://lepe12.github.io"}}),"https://lepe12.github.io");
assert.strictEqual(allowedOrigin({headers:{origin:"http://127.0.0.1:8787"}}),"http://127.0.0.1:8787");
assert.strictEqual(allowedOrigin({headers:{origin:"http://localhost"}}),"http://localhost");
assert.strictEqual(allowedOrigin({headers:{origin:"https://evil.example"}}),"");
assert.strictEqual(allowedOrigin({headers:{origin:"https://lepe12.github.io.evil.test"}}),"");
assert.strictEqual(trustedWebOrigin({headers:{origin:"http://localhost:4173",referer:""}}),true);
assert.strictEqual(trustedWebOrigin({headers:{origin:"",referer:"http://127.0.0.1:8787/jarvis-intelligence-chamber/"}}),true);
assert.strictEqual(trustedWebOrigin({headers:{origin:"https://not-lepe12.github.io",referer:""}}),false);
console.log("COMMAND CENTER LIVE SERVICE SELF-TEST PASS");

// Reproduce the audited latest-run failure in an isolated, non-listening server.
const fs=require('node:fs'),vm=require('node:vm');
const sandbox={require,module:{exports:{}},process:{env:{}},console,Buffer,URL,setInterval,setImmediate};
vm.runInNewContext(fs.readFileSync(require.resolve('./app'),'utf8')+'\nbaseline={schema:"pct-command-center-live-v1",run_id:"100",events:[]};baselineFetchedAt=Date.now();addEvent({schema:"pct-jarvis-event-v1",run_id:"200",event_id:"unit-1",agent_id:"greek",status:"RUNNING"});',sandbox);
sandbox.module.exports.statusFor('latest').then(s=>{assert.equal(s.run_id,'200');assert.equal(s.snapshot.run_id,'200');assert.equal(s.snapshot.claims.length,0);assert.equal(s.snapshot.agents[0].status,'RUNNING');assert.equal(s.snapshot.safety.automatic_verified,false);console.log('LATEST LIVE RUN ISOLATION PASS');}).catch(e=>{console.error(e);process.exitCode=1});
