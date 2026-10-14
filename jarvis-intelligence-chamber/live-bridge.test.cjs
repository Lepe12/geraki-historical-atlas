"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const script=fs.readFileSync(path.join(__dirname,"live-bridge.js"),"utf8").replace("export function connectResearchFeed","function connectResearchFeed")+"\nthis.connectResearchFeed=connectResearchFeed;";
function harness(fetchJson){
 const state=[],snapshots=[],events=[],timers=[];
 const sockets=[];
 class FakeWebSocket{constructor(url){this.url=url;sockets.push(this)}close(){this.onclose?.()}}
 const context={globalThis:{},URL,Set,Map,JSON,String,Array,Error,console,
  setTimeout(fn){timers.push(fn);return timers.length},clearTimeout(){},};
 vm.runInNewContext(script,context);
 const stop=context.connectResearchFeed({
   fetchImpl:async()=>({ok:true,json:async()=>fetchJson}),
   WebSocketImpl:FakeWebSocket,
   onState:(...a)=>state.push(a),onSnapshot:(...a)=>snapshots.push(a),onEvent:e=>events.push(e)
 });
 return {state,snapshots,events,timers,sockets,stop};
}
const snapshot={schema:"pct-command-center-live-v1",run_id:"100",agents:[],claims:[],blockers:[],safety:{automatic_verified:false}};
test("snapshot fallback plus websocket bootstrap and event transport",async()=>{
 const h=harness(snapshot);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.snapshots[0][0].run_id,"100");
 assert.equal(h.state[0][0],"SNAPSHOT");
 assert.equal(h.sockets.length,1);
 assert.match(h.sockets[0].url,/^wss:\/\/pct-live\.piratecartography\.com\/pct-api\/live\/ws\/piratecartography\/latest$/);
 h.sockets[0].onopen();
 assert.equal(h.state.at(-1)[0],"LIVE");
 h.sockets[0].onmessage({data:JSON.stringify({schema:"pct-command-center-bootstrap-v1",snapshot,events:[]})});
 assert.equal(h.snapshots.at(-1)[1],"LIVE");
 h.sockets[0].onmessage({data:JSON.stringify({schema:"pct-jarvis-event-v1",run_id:"200",event_type:"agent_started",agent_id:"venetian"})});
 assert.equal(h.events.length,1);
 h.sockets[0].onclose();
 assert.equal(h.state.at(-1)[0],"RECONNECTING");
 h.stop();
});
test("invalid snapshot never becomes research evidence",async()=>{
 const h=harness({...snapshot,safety:{automatic_verified:true}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.snapshots.length,0);
 assert.equal(h.state[0][0],"OFFLINE");
 h.stop();
});
