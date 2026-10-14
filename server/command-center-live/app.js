#!/usr/bin/env node
"use strict";

const http=require("http");
const https=require("https");
const crypto=require("crypto");
const {URL}=require("url");

const PORT=Number(process.env.PORT||process.env.PCT_COMMAND_CENTER_PORT||8787);
const PREFIX=(process.env.PCT_COMMAND_CENTER_PREFIX||"/pct-api/live").replace(/\/$/,"");
const REPO="Lepe12/geraki-historical-atlas";
const RAW_LATEST="https://raw.githubusercontent.com/"+REPO+"/main/command-center/live/latest.json";
const OIDC_ISSUER="https://token.actions.githubusercontent.com";
const OIDC_AUD="piratecartography-command-center";
const MAX_BODY=65536;
const RUN_EVENTS_LIMIT=1000;

let baseline=null;
let baselineFetchedAt=0;
const runEvents=new Map();
const sockets=new Map();
let jwksCache={at:0,keys:[]};

function json(res,status,obj,extra={}){
  const body=JSON.stringify(obj);
  res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"https://lepe12.github.io","x-content-type-options":"nosniff",...extra});
  res.end(body);
}
function normalizePath(pathname){
  if(pathname.startsWith(PREFIX)) pathname=pathname.slice(PREFIX.length)||"/";
  return pathname||"/";
}
function getJson(url){
  return new Promise((resolve,reject)=>{
    https.get(url,{headers:{"user-agent":"piratecartography-command-center-live/1"}},r=>{
      let b="";r.setEncoding("utf8");
      r.on("data",c=>{b+=c;if(b.length>2_000_000){r.destroy();reject(new Error("response_too_large"));}});
      r.on("end",()=>{if((r.statusCode||500)>=400)return reject(new Error("http_"+r.statusCode));try{resolve(JSON.parse(b))}catch(e){reject(e)}});
    }).on("error",reject);
  });
}
async function refreshBaseline(force=false){
  if(!force && Date.now()-baselineFetchedAt<15000 && baseline)return baseline;
  try{
    const d=await getJson(RAW_LATEST);
    if(d&&d.schema==="pct-command-center-live-v1"){baseline=d;baselineFetchedAt=Date.now();}
  }catch(_){}
  return baseline;
}
function b64url(s){return Buffer.from(s.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-s.length%4)%4),"base64")}
async function jwks(){
  if(Date.now()-jwksCache.at<3600_000&&jwksCache.keys.length)return jwksCache.keys;
  const d=await getJson(OIDC_ISSUER+"/.well-known/jwks");
  jwksCache={at:Date.now(),keys:Array.isArray(d.keys)?d.keys:[]};
  return jwksCache.keys;
}
async function verifyGithubOidc(token){
  const parts=String(token||"").split(".");
  if(parts.length!==3)throw new Error("invalid_token");
  const header=JSON.parse(b64url(parts[0]).toString("utf8"));
  const payload=JSON.parse(b64url(parts[1]).toString("utf8"));
  if(header.alg!=="RS256"||!header.kid)throw new Error("invalid_alg");
  const now=Math.floor(Date.now()/1000);
  const aud=payload.aud;
  if(payload.iss!==OIDC_ISSUER||!(aud===OIDC_AUD||(Array.isArray(aud)&&aud.includes(OIDC_AUD))))throw new Error("invalid_issuer_or_audience");
  if(Number(payload.exp||0)<now-30||Number(payload.nbf||0)>now+30)throw new Error("expired_or_not_yet_valid");
  if(payload.repository!==REPO)throw new Error("wrong_repository");
  if(payload.ref!=="refs/heads/main")throw new Error("wrong_ref");
  const key=(await jwks()).find(k=>k.kid===header.kid);
  if(!key)throw new Error("unknown_kid");
  const pub=crypto.createPublicKey({key,format:"jwk"});
  const ok=crypto.verify("RSA-SHA256",Buffer.from(parts[0]+"."+parts[1]),pub,b64url(parts[2]));
  if(!ok)throw new Error("bad_signature");
  return payload;
}
function readBody(req){
  return new Promise((resolve,reject)=>{
    let b="";req.setEncoding("utf8");
    req.on("data",c=>{b+=c;if(Buffer.byteLength(b)>MAX_BODY){reject(new Error("body_too_large"));req.destroy();}});
    req.on("end",()=>resolve(b));req.on("error",reject);
  });
}
function addEvent(e){
  const run=String(e.run_id||"");
  if(!/^[A-Za-z0-9_.:-]+$/.test(run))throw new Error("invalid_run");
  const arr=runEvents.get(run)||[];arr.push(e);if(arr.length>RUN_EVENTS_LIMIT)arr.splice(0,arr.length-RUN_EVENTS_LIMIT);runEvents.set(run,arr);
  broadcast(run,e);
}
function frameText(text){
  const payload=Buffer.from(String(text));
  let head;
  if(payload.length<126){head=Buffer.from([0x81,payload.length]);}
  else if(payload.length<=65535){head=Buffer.alloc(4);head[0]=0x81;head[1]=126;head.writeUInt16BE(payload.length,2);}
  else{head=Buffer.alloc(10);head[0]=0x81;head[1]=127;head.writeBigUInt64BE(BigInt(payload.length),2);}
  return Buffer.concat([head,payload]);
}
function broadcast(run,e){
  const msg=frameText(JSON.stringify(e));
  for(const key of [run,"latest"]){
    const set=sockets.get(key);if(!set)continue;
    for(const s of [...set]){
      if(s.destroyed){set.delete(s);continue;}
      try{s.write(msg)}catch(_){set.delete(s);try{s.destroy()}catch(_){}}
    }
  }
}
async function statusFor(run){
  const base=await refreshBaseline();
  const actual=run==="latest"?(base?.run_id||"latest"):run;
  const live=runEvents.get(actual)||[];
  if(!base)return {project:"piratecartography",run_id:actual,snapshot:null,events:live,transport:"WEBSOCKET_LIVE_NO_BASELINE"};
  const chosen=(run==="latest"||String(base.run_id)===String(actual))?base:null;
  return {project:"piratecartography",run_id:actual,snapshot:chosen,events:[...(chosen?.events||[]),...live].slice(-1000),transport:"WEBSOCKET_LIVE"};
}
const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,"http://localhost");const p=normalizePath(u.pathname);
    if(req.method==="OPTIONS"){res.writeHead(204,{"access-control-allow-origin":"https://lepe12.github.io","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"authorization,content-type"});return res.end();}
    if(req.method==="GET"&&p==="/health"){const b=await refreshBaseline();return json(res,200,{status:"PASS",service:"piratecartography-command-center-live",websocket:true,baseline_run_id:b?.run_id||null});}
    const sm=p.match(/^\/status\/([^/]+)\/([^/]+)$/);
    if(req.method==="GET"&&sm){if(sm[1]!=="piratecartography")return json(res,404,{error:"project"});return json(res,200,await statusFor(sm[2]));}
    if(req.method==="POST"&&p==="/events"){
      const auth=String(req.headers.authorization||"");if(!auth.startsWith("Bearer "))return json(res,401,{error:"missing_oidc"});
      await verifyGithubOidc(auth.slice(7));
      const e=JSON.parse(await readBody(req));
      if(e.project!=="piratecartography"||e.schema!=="pct-jarvis-event-v1")return json(res,400,{error:"invalid_event"});
      addEvent(e);return json(res,202,{status:"ACCEPTED",event_id:e.event_id,run_id:e.run_id});
    }
    return json(res,404,{error:"not_found"});
  }catch(e){return json(res,400,{error:String(e.message||"request_failed")});}
});
server.on("upgrade",(req,socket)=>{
  try{
    const u=new URL(req.url,"http://localhost");const p=normalizePath(u.pathname);const m=p.match(/^\/ws\/([^/]+)\/([^/]+)$/);
    if(!m||m[1]!=="piratecartography")return socket.destroy();
    const key=req.headers["sec-websocket-key"];if(!key)return socket.destroy();
    const accept=crypto.createHash("sha1").update(key+"258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: "+accept+"\r\n\r\n");
    const run=m[2];if(!sockets.has(run))sockets.set(run,new Set());sockets.get(run).add(socket);
    socket.on("close",()=>sockets.get(run)?.delete(socket));socket.on("error",()=>sockets.get(run)?.delete(socket));
    // Consume masked client frames and complete RFC 6455 control exchanges.
    let incoming=Buffer.alloc(0);
    socket.on("data",chunk=>{
      incoming=Buffer.concat([incoming,chunk]);
      if(incoming.length>65536)return socket.destroy();
      while(incoming.length>=2){
        const opcode=incoming[0]&15,masked=Boolean(incoming[1]&128);
        let size=incoming[1]&127,offset=2;
        if(!masked)return socket.destroy();
        if(size===126){if(incoming.length<4)return;size=incoming.readUInt16BE(2);offset=4;}
        else if(size===127)return socket.destroy();
        if(opcode>=8&&(size>125||!(incoming[0]&128)))return socket.destroy();
        if(incoming.length<offset+4+size)return;
        const mask=incoming.subarray(offset,offset+4);offset+=4;
        const payload=Buffer.from(incoming.subarray(offset,offset+size));
        for(let i=0;i<payload.length;i++)payload[i]^=mask[i%4];
        incoming=incoming.subarray(offset+size);
        if(opcode===8){sockets.get(run)?.delete(socket);return socket.end(Buffer.concat([Buffer.from([0x88,size]),payload]));}
        if(opcode===9)socket.write(Buffer.concat([Buffer.from([0x8a,size]),payload]));
      }
    });
    statusFor(run).then(s=>socket.write(frameText(JSON.stringify({schema:"pct-command-center-bootstrap-v1",...s})))).catch(()=>{});
  }catch(_){socket.destroy();}
});
if(require.main===module || typeof PhusionPassenger !== "undefined"){
  server.listen(PORT,"127.0.0.1",()=>console.log("PCT Command Center live service listening",PORT,PREFIX));
  setInterval(()=>refreshBaseline(true),15000).unref();
  if(typeof PhusionPassenger !== "undefined"){
    const loopback=require("net").createServer(socket=>server.emit("connection",socket));
    loopback.on("error",e=>console.error("PCT loopback listener",e.code));
    loopback.listen(PORT,"127.0.0.1");
  }
}
module.exports={normalizePath,frameText,statusFor,verifyGithubOidc,server};
