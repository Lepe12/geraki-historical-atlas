"use strict";
const assert=require("node:assert/strict");
const BASE="https://pct-live.piratecartography.com/pct-api/live";
const WS="wss://pct-live.piratecartography.com/pct-api/live/ws/piratecartography/latest";
const timeout=AbortSignal.timeout(15000);
(async()=>{
 const health=await fetch(BASE+"/health",{signal:timeout,headers:{"accept":"application/json"}});
 assert.equal(health.status,200,"Production health must return 200");
 const h=await health.json();
 assert.equal(h.status,"PASS","Backend health not PASS");
 assert.equal(h.websocket,true,"WebSocket backend not advertised");
 const status=await fetch(BASE+"/status/piratecartography/latest",{signal:AbortSignal.timeout(15000)});
 assert.equal(status.status,200,"Latest status endpoint must return 200");
 const body=await status.json();
 assert.equal(body.project,"piratecartography");
 assert.equal(body.snapshot?.safety?.automatic_verified,false,"Scientific safety gate missing");
 assert.ok(body.snapshot?.run_id,"Durable baseline run missing");
 if(typeof WebSocket!=="function")throw Error("Node 22 WebSocket API missing");
 const event=await new Promise((resolve,reject)=>{
   const ws=new WebSocket(WS);
   const timer=setTimeout(()=>{ws.close();reject(Error("WebSocket bootstrap timeout"))},15000);
   ws.onopen=()=>{};
   ws.onerror=()=>{clearTimeout(timer);reject(Error("WebSocket failed to connect"))};
   ws.onmessage=m=>{
    try{const data=JSON.parse(m.data);assert.equal(data.schema,"pct-command-center-bootstrap-v1");assert.equal(data.project,"piratecartography");clearTimeout(timer);ws.close();resolve(data)}
    catch(e){clearTimeout(timer);ws.close();reject(e)}
   };
   ws.onclose=()=>{};
 });
 console.log(JSON.stringify({result:"LIVE_TRANSPORT_PASS",baseline:body.snapshot.run_id,websocketRun:event.run_id,receivedBootstrap:true}));
})().catch(e=>{console.error("LIVE_TRANSPORT_FAIL",e.message);process.exitCode=1});
