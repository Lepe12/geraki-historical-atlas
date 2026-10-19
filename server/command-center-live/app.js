#!/usr/bin/env node
"use strict";

const http=require("http");
const https=require("https");
const crypto=require("crypto");
const fs=require("fs");
const path=require("path");
const {URL}=require("url");

const PORT=Number(process.env.PORT||process.env.PCT_COMMAND_CENTER_PORT||8787);
const PREFIX=(process.env.PCT_COMMAND_CENTER_PREFIX||"/pct-api/live").replace(/\/$/,"");
const REPO="Lepe12/geraki-historical-atlas";
const RAW_LATEST="https://raw.githubusercontent.com/"+REPO+"/main/command-center/live/latest.json";
const OIDC_ISSUER="https://token.actions.githubusercontent.com";
const OIDC_AUD="piratecartography-command-center";
const MAX_BODY=65536;
const MAX_UPSTREAM_BYTES=8_000_000;
const RUN_EVENTS_LIMIT=1000;
const OPERATOR_TOKEN=String(process.env.PCT_OPERATOR_TOKEN||"");
const GITHUB_DISPATCH_TOKEN=String(process.env.PCT_GITHUB_DISPATCH_TOKEN||"");
const CONTROLLED_WORKFLOW="jarvis-controlled-dispatch.yml";
const SESSION_COOKIE="naboux_session";
const SESSION_MAX_AGE=30*24*60*60;
const KNOWLEDGE_DIR=process.env.PCT_KNOWLEDGE_DIR||path.join(typeof __dirname==="string"?__dirname:".","knowledge-data");
const KNOWLEDGE_UPLOAD_DIR=path.join(KNOWLEDGE_DIR,"uploads");
const KNOWLEDGE_INDEX=path.join(KNOWLEDGE_DIR,"index.json");
const MAX_PDF_BYTES=25*1024*1024;
fs.mkdirSync(KNOWLEDGE_UPLOAD_DIR,{recursive:true});
let lastDispatchAt=0;
let latestLiveRun="";

let baseline=null;
let baselineFetchedAt=0;
let baselineError=null;
const runEvents=new Map();
const sockets=new Map();
let jwksCache={at:0,keys:[]};

function allowedOrigin(req){
  const origin=String(req?.headers?.origin||"");
  if(origin==="https://lepe12.github.io")return origin;
  if(/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))return origin;
  return "";
}
function upstreamWithinLimit(byteLength){return Number(byteLength)<=MAX_UPSTREAM_BYTES;}
function json(res,status,obj,extra={}){
  const body=JSON.stringify(obj);
  const origin=extra.origin||"https://lepe12.github.io";
  const headers={...extra};
  delete headers.origin;
  res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":origin,"access-control-allow-credentials":"true","vary":"Origin","x-content-type-options":"nosniff",...headers});
  res.end(body);
}
function normalizePath(pathname){
  if(pathname.startsWith(PREFIX)) pathname=pathname.slice(PREFIX.length)||"/";
  return pathname||"/";
}
function getJson(url){
  return new Promise((resolve,reject)=>{
    const request=https.get(url,{headers:{"user-agent":"piratecartography-command-center-live/1"}},r=>{
      let b="";r.setEncoding("utf8");
      r.on("data",c=>{b+=c;if(!upstreamWithinLimit(Buffer.byteLength(b))){r.destroy();reject(new Error("response_too_large"));}});
      r.on("end",()=>{if((r.statusCode||500)>=400)return reject(new Error("http_"+r.statusCode));try{resolve(JSON.parse(b))}catch(e){reject(e)}});
    }).on("error",reject);
    request.setTimeout(10000,()=>request.destroy(new Error("upstream_timeout")));
  });
}
function safeEqual(a,b){
  const x=Buffer.from(String(a||"")),y=Buffer.from(String(b||""));
  return x.length===y.length&&x.length>0&&crypto.timingSafeEqual(x,y);
}
function githubWorkflowDispatch(inputs){
  return new Promise((resolve,reject)=>{
    if(!GITHUB_DISPATCH_TOKEN)return reject(new Error("github_dispatch_not_configured"));
    const body=JSON.stringify({ref:"main",inputs});
    const req=https.request({
      hostname:"api.github.com",
      path:"/repos/"+REPO+"/actions/workflows/"+CONTROLLED_WORKFLOW+"/dispatches",
      method:"POST",
      headers:{
        "user-agent":"piratecartography-command-center-live/1",
        "accept":"application/vnd.github+json",
        "authorization":"Bearer "+GITHUB_DISPATCH_TOKEN,
        "x-github-api-version":"2022-11-28",
        "content-type":"application/json",
        "content-length":Buffer.byteLength(body)
      }
    },r=>{
      let b="";r.setEncoding("utf8");r.on("data",c=>b+=c);
      r.on("end",()=>{if(r.statusCode===204)return resolve();reject(new Error("github_dispatch_http_"+r.statusCode+(b?":"+b.slice(0,300):"")));});
    });
    req.setTimeout(10000,()=>req.destroy(new Error("dispatch_timeout")));
    req.on("error",reject);req.end(body);
  });
}
async function refreshBaseline(force=false){
  if(!force && Date.now()-baselineFetchedAt<15000 && baseline)return baseline;
  try{
    const d=await getJson(RAW_LATEST);
    if(d&&d.schema==="pct-command-center-live-v1"){const changed=JSON.stringify(d)!==JSON.stringify(baseline);baseline=d;baselineFetchedAt=Date.now();baselineError=null;if(changed)setImmediate(publishSnapshots);}
    else baselineError="invalid_schema";
  }catch(e){baselineError=String(e&&e.message||"baseline_failed");}
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
function readBody(req,maxBytes=MAX_BODY){
  return new Promise((resolve,reject)=>{
    let b="";req.setEncoding("utf8");
    req.on("data",c=>{b+=c;if(Buffer.byteLength(b)>maxBytes){reject(new Error("body_too_large"));req.destroy();}});
    req.on("end",()=>resolve(b));req.on("error",reject);
  });
}
function readRawBody(req,maxBytes=MAX_PDF_BYTES){
  return new Promise((resolve,reject)=>{
    const chunks=[];let total=0;
    req.on("data",chunk=>{total+=chunk.length;if(total>maxBytes){reject(new Error("body_too_large"));req.destroy();return;}chunks.push(chunk);});
    req.on("end",()=>resolve(Buffer.concat(chunks)));req.on("error",reject);
  });
}
function operatorAuthorized(req){
  const auth=String(req.headers.authorization||"");
  return Boolean(OPERATOR_TOKEN&&auth.startsWith("Bearer ")&&safeEqual(auth.slice(7),OPERATOR_TOKEN));
}
function isTrustedWeb(value){
  if(!value)return false;
  try{
    const u=new URL(value);
    if(u.origin==="https://lepe12.github.io")return true;
    return u.protocol==="http:"&&(u.hostname==="localhost"||u.hostname==="127.0.0.1");
  }catch(_){return false;}
}
function trustedWebOrigin(req){
  return isTrustedWeb(String(req.headers.origin||""))||isTrustedWeb(String(req.headers.referer||""));
}
function sessionSignature(exp){
  return crypto.createHmac("sha256",OPERATOR_TOKEN).update("naboux-session|"+exp).digest("base64url");
}
function issueSessionCookie(){
  const exp=Math.floor(Date.now()/1000)+SESSION_MAX_AGE;
  const value=exp+"."+sessionSignature(exp);
  return SESSION_COOKIE+"="+value+"; Max-Age="+SESSION_MAX_AGE+"; Path="+PREFIX+"; HttpOnly; Secure; SameSite=None; Partitioned";
}
function sessionAuthorized(req){
  if(!OPERATOR_TOKEN)return false;
  const raw=String(req.headers.cookie||"");
  const part=raw.split(/;\s*/).find(x=>x.startsWith(SESSION_COOKIE+"="));
  if(!part)return false;
  const value=part.slice(SESSION_COOKIE.length+1),dot=value.indexOf(".");
  if(dot<1)return false;
  const exp=Number(value.slice(0,dot)),sig=value.slice(dot+1);
  if(!Number.isFinite(exp)||exp<Math.floor(Date.now()/1000))return false;
  return safeEqual(sig,sessionSignature(exp));
}
function readKnowledgeIndex(){
  try{const v=JSON.parse(fs.readFileSync(KNOWLEDGE_INDEX,"utf8"));return Array.isArray(v)?v:[];}catch(_){return [];}
}
function writeKnowledgeIndex(index){
  fs.writeFileSync(KNOWLEDGE_INDEX,JSON.stringify(index,null,2));
}
function safeFileName(name){
  return String(name||"source.pdf").replace(/[^A-Za-z0-9._() -]+/g,"_").slice(0,180)||"source.pdf";
}
function knowledgeRecordPath(id){return path.join(KNOWLEDGE_DIR,id+".json");}
function addEvent(e){
  const run=String(e.run_id||"");
  if(!/^[A-Za-z0-9_.:-]+$/.test(run))throw new Error("invalid_run");
  latestLiveRun=newerRun(latestLiveRun,run);
  const arr=runEvents.get(run)||[];arr.push(e);if(arr.length>RUN_EVENTS_LIMIT)arr.splice(0,arr.length-RUN_EVENTS_LIMIT);runEvents.set(run,arr);
  while(runEvents.size>100)runEvents.delete(runEvents.keys().next().value);
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
function newerRun(a,b){
  if(!a)return String(b||"");if(!b)return String(a);
  if(/^\d+$/.test(a)&&/^\d+$/.test(b))return BigInt(a)>BigInt(b)?String(a):String(b);
  return String(b);
}
function eventSnapshot(run,events){
  const agents=new Map();
  for(const e of events)if(e.agent_id)agents.set(e.agent_id,{...(agents.get(e.agent_id)||{id:e.agent_id}),status:e.status||e.event_type,phase:e.phase,percent:e.percent});
  return {schema:"pct-command-center-live-v1",project:"piratecartography",run_id:run,generated_utc:events.at(-1)?.created_utc||null,source:"AUTHENTICATED_LIVE_EVENTS",mission:{status:"RUNNING"},agents:[...agents.values()],claims:[],blockers:[],contradictions:{records:[]},events,safety:{automatic_verified:false,human_review_required:true}};
}
async function statusFor(run){
  const base=await refreshBaseline();
  const actual=run==="latest"?newerRun(base?.run_id,latestLiveRun):String(run);
  const live=runEvents.get(actual)||[];
  const chosen=base&&String(base.run_id)===actual?base:(live.length?eventSnapshot(actual,live):null);
  const events=[...(chosen?.events||[]),...live].filter((e,i,a)=>!e.event_id||a.findIndex(x=>x.event_id===e.event_id)===i).slice(-1000);
  return {project:"piratecartography",run_id:actual||"latest",snapshot:chosen,events,transport:chosen?"WEBSOCKET_LIVE":"WEBSOCKET_LIVE_NO_BASELINE"};
}
async function publishSnapshots(){
  for(const [run,clients] of sockets){if(!clients.size)continue;try{const state=await statusFor(run),frame=frameText(JSON.stringify({schema:"pct-command-center-bootstrap-v1",...state}));for(const socket of clients)if(!socket.destroyed)socket.write(frame);}catch(_){}}
}
const server=http.createServer(async(req,res)=>{
  const reply=(status,obj,extra={})=>json(res,status,obj,{...extra,origin:allowedOrigin(req)||"https://lepe12.github.io"});
  try{
    const u=new URL(req.url,"http://localhost");const p=normalizePath(u.pathname);
    if(req.method==="OPTIONS"){res.writeHead(204,{"access-control-allow-origin":allowedOrigin(req)||"https://lepe12.github.io","access-control-allow-credentials":"true","vary":"Origin","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"authorization,content-type,x-file-name"});return res.end();}
    if(req.method==="GET"&&p==="/health"){const b=await refreshBaseline();return reply(200,{status:"PASS",service:"piratecartography-command-center-live",websocket:true,dispatch_configured:Boolean(GITHUB_DISPATCH_TOKEN),knowledge_memory:true,session_auth:true,revision:"baseline-cap-v2",baseline_run_id:b?.run_id||null,baseline_error:b?null:baselineError});}
    if(req.method==="GET"&&p==="/session"){return reply(200,{authenticated:sessionAuthorized(req)});}
    if(req.method==="POST"&&p==="/session"){
      if(!operatorAuthorized(req))return reply(401,{error:"invalid_operator_key"});
      return reply(200,{status:"SESSION_READY"},{"set-cookie":issueSessionCookie()});
    }
    const sm=p.match(/^\/status\/([^/]+)\/([^/]+)$/);
    if(req.method==="GET"&&sm){if(sm[1]!=="piratecartography")return reply(404,{error:"project"});return reply(200,await statusFor(sm[2]));}
    if(req.method==="POST"&&p==="/knowledge/upload"){
      const type=String(req.headers["content-type"]||"").toLowerCase();
      if(!type.includes("application/pdf"))return reply(415,{error:"pdf_required"});
      const raw=await readRawBody(req);
      if(raw.length<5||raw.subarray(0,5).toString("ascii")!=="%PDF-")return reply(400,{error:"invalid_pdf"});
      const sourceId="src-"+Date.now().toString(36)+"-"+crypto.randomBytes(4).toString("hex");
      const original=safeFileName(decodeURIComponent(String(req.headers["x-file-name"]||"source.pdf")));
      const stored=sourceId+".pdf";
      fs.writeFileSync(path.join(KNOWLEDGE_UPLOAD_DIR,stored),raw,{flag:"wx"});
      const index=readKnowledgeIndex();
      index.unshift({source_id:sourceId,original_name:original,size:raw.length,state:"PENDING_REVIEW",uploaded_at:new Date().toISOString(),accepted_items:0});
      writeKnowledgeIndex(index.slice(0,500));
      return reply(201,{status:"UPLOADED",source_id:sourceId,original_name:original,size:raw.length});
    }
    if(req.method==="POST"&&p==="/knowledge/review"){
      const body=JSON.parse(await readBody(req,8*1024*1024));
      const sourceId=String(body?.source_id||"");
      if(!/^src-[A-Za-z0-9-]+$/.test(sourceId))return reply(400,{error:"invalid_source_id"});
      const index=readKnowledgeIndex(),meta=index.find(x=>x.source_id===sourceId);
      if(!meta)return reply(404,{error:"source_not_found"});
      const pages=Array.isArray(body.pages)?body.pages.slice(0,2000).map(p=>({page:Number(p.page)||0,text:String(p.text||"").slice(0,30000)})):[];
      const items=Array.isArray(body.items)?body.items.slice(0,5000).filter(x=>x&&x.status==="accepted").map((x,i)=>({id:String(x.id||("item-"+i)),type:String(x.type||"claim"),text:String(x.text||"").slice(0,4000),page:Number(x.page)||null,confidence:Number(x.confidence)||0.5,source_id:sourceId,status:"accepted",verification_status:"OPERATOR_ACCEPTED_NOT_VERIFIED"})):[];
      const record={schema:"naboux-knowledge-source-v1",source_id:sourceId,original_name:meta.original_name,reviewed_at:new Date().toISOString(),pages,items};
      fs.writeFileSync(knowledgeRecordPath(sourceId),JSON.stringify(record,null,2));
      meta.state="LEARNED";meta.reviewed_at=record.reviewed_at;meta.accepted_items=items.length;writeKnowledgeIndex(index);
      return reply(200,{status:"LEARNED",source_id:sourceId,accepted_items:items.length,pages:pages.length});
    }
    if(req.method==="GET"&&p==="/knowledge/sources"){
      return reply(200,{schema:"naboux-knowledge-index-v1",sources:readKnowledgeIndex()});
    }
    if(req.method==="GET"&&p==="/knowledge/search"){
      const q=String(u.searchParams.get("q")||"").trim().toLowerCase();
      if(q.length<2)return reply(400,{error:"query_too_short"});
      const results=[];
      for(const meta of readKnowledgeIndex().filter(x=>x.state==="LEARNED").slice(0,500)){
        try{
          const rec=JSON.parse(fs.readFileSync(knowledgeRecordPath(meta.source_id),"utf8"));
          for(const item of rec.items||[])if(String(item.text||"").toLowerCase().includes(q))results.push({...item,original_name:meta.original_name});
          for(const pg of rec.pages||[])if(String(pg.text||"").toLowerCase().includes(q))results.push({type:"page_match",text:String(pg.text).slice(0,1200),page:pg.page,source_id:meta.source_id,original_name:meta.original_name});
        }catch(_){}
        if(results.length>=100)break;
      }
      return reply(200,{schema:"naboux-knowledge-search-v1",query:q,results:results.slice(0,100)});
    }
    if(req.method==="POST"&&p==="/dispatch"){
      if(!GITHUB_DISPATCH_TOKEN)return reply(503,{error:"dispatch_not_configured"});
      if(!trustedWebOrigin(req))return reply(403,{error:"origin_not_allowed"});
      if(Date.now()-lastDispatchAt<8000)return reply(429,{error:"dispatch_rate_limited"});
      const body=JSON.parse(await readBody(req));
      const query=String(body?.query||"").trim();
      if(query.length<3||query.length>500)return reply(400,{error:"invalid_query"});
      const requestId="ui-"+Date.now().toString(36)+"-"+crypto.randomBytes(4).toString("hex");
      lastDispatchAt=Date.now();
      await githubWorkflowDispatch({
        request_id:requestId,
        target:query,
        aliases:"",
        date_range:"",
        purpose:query,
        selected_agents:""
      });
      lastDispatchAt=Date.now();
      return reply(202,{status:"ACCEPTED",request_id:requestId,workflow:CONTROLLED_WORKFLOW});
    }
    if(req.method==="POST"&&p==="/events"){
      const auth=String(req.headers.authorization||"");if(!auth.startsWith("Bearer "))return reply(401,{error:"missing_oidc"});
      await verifyGithubOidc(auth.slice(7));
      const e=JSON.parse(await readBody(req));
      if(e.project!=="piratecartography"||e.schema!=="pct-jarvis-event-v1")return reply(400,{error:"invalid_event"});
      addEvent(e);return reply(202,{status:"ACCEPTED",event_id:e.event_id,run_id:e.run_id});
    }
    return reply(404,{error:"not_found"});
  }catch(e){return reply(400,{error:String(e.message||"request_failed")});}
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
module.exports={normalizePath,frameText,statusFor,verifyGithubOidc,safeEqual,newerRun,eventSnapshot,server,allowedOrigin,trustedWebOrigin,upstreamWithinLimit,MAX_UPSTREAM_BYTES};

