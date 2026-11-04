'use strict';
// Secure N7 queued chat bridge. GitHub OIDC verifies a specific private workflow.
// User prompts and replies remain on the owner's TopHost, never in the public GitHub repo.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const https=require('node:https');
const {URL}=require('node:url');
const AUD='n7-private-qwen-queue';
const ISSUER='https://token.actions.githubusercontent.com';
const REPO='Lepe12/independent-ai-bot';
const WORKFLOW=REPO+'/.github/workflows/n7-private-queue.yml@refs/heads/main';
const LIMIT=90;
const MAX_PROMPT=12000;
const jwkCache={at:0,keys:[]};
function decode64u(v){return Buffer.from(v.replace(/-/g,'+').replace(/_/g,'/'),'base64');}
function downloadJson(url){return new Promise((resolve,reject)=>{
  const r=https.get(url,{timeout:10000,headers:{'User-Agent':'N7-private-queue/1'}},res=>{
    if(res.statusCode!==200){res.resume();return reject(Error('jwks_http_'+res.statusCode));}
    let data='';res.setEncoding('utf8');res.on('data',s=>{
      data+=s;if(data.length>100000)res.destroy(Error('jwks_too_large'));
    });res.on('end',()=>{try{resolve(JSON.parse(data));}catch(e){reject(e);}});
  });r.on('timeout',()=>r.destroy(Error('jwks_timeout')));r.on('error',reject);
});}
async function verifyOidc(token,fetchKeys=downloadJson){
  const parts=String(token||'').split('.');
  if(parts.length!==3)throw Error('oidc_format');
  const head=JSON.parse(decode64u(parts[0]).toString('utf8'));
  const body=JSON.parse(decode64u(parts[1]).toString('utf8'));
  const now=Math.floor(Date.now()/1000);
  if(head.alg!=='RS256'||typeof head.kid!=='string'||head.kid.length>128)throw Error('oidc_algorithm');
  if(body.iss!==ISSUER||!(body.aud===AUD||(Array.isArray(body.aud)&&body.aud.includes(AUD))))throw Error('oidc_audience');
  if(!Number.isSafeInteger(body.exp)||body.exp<now-30||!Number.isSafeInteger(body.iat)||body.iat>now+30||body.exp-body.iat>1200)throw Error('oidc_expired');
  if(body.nbf!==undefined&&body.nbf>now+30)throw Error('oidc_nbf');
  if(body.repository!==REPO||body.ref!=='refs/heads/main'||body.workflow_ref!==WORKFLOW||
      !/^[0-9]{1,20}$/.test(String(body.run_id||'')))throw Error('oidc_workflow');
  if(Date.now()-jwkCache.at>3600000||!jwkCache.keys.length){
    const d=await fetchKeys(ISSUER+'/.well-known/jwks');
    if(!Array.isArray(d.keys)||d.keys.length>100)throw Error('oidc_jwks');
    jwkCache.keys=d.keys;jwkCache.at=Date.now();
  }
  const jwk=jwkCache.keys.find(k=>k.kid===head.kid&&k.kty==='RSA');
  if(!jwk)throw Error('oidc_key');
  const pub=crypto.createPublicKey({key:jwk,format:'jwk'});
  if(!crypto.verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),pub,decode64u(parts[2])))throw Error('oidc_signature');
  return body;
}
function reply(res,status,data){
  const body=JSON.stringify(data);
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body),
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"});
  res.end(body);
}
function sanitize(jobs){
  if(!Array.isArray(jobs))throw Error('invalid_queue');
  return jobs.filter(j=>j&&typeof j==='object'&&typeof j.id==='string');
}

// Trigger only the hard-coded private Qwen queue workflow, never user-provided paths.
// The request body contains no prompt, conversation ID or other private content.
const DISPATCH_TOKEN=String(process.env.N7_GITHUB_DISPATCH_TOKEN||'').trim();
function dispatchQwenWorkflow(){
  if(!DISPATCH_TOKEN)return Promise.resolve(false);
  return new Promise(resolve=>{
    const payload=JSON.stringify({ref:'main'});
    const req=https.request({
      hostname:'api.github.com',
      path:'/repos/Lepe12/independent-ai-bot/actions/workflows/n7-private-queue.yml/dispatches',
      method:'POST',timeout:12000,
      headers:{
        'Authorization':'Bearer '+DISPATCH_TOKEN,
        'Accept':'application/vnd.github+json',
        'X-GitHub-Api-Version':'2022-11-28',
        'User-Agent':'N7-owner-queue-dispatch/1',
        'Content-Type':'application/json',
        'Content-Length':Buffer.byteLength(payload)
      }
    },res=>{
      res.resume();
      res.on('end',()=>{
        if(res.statusCode!==204)console.error('N7 dispatch failed HTTP '+res.statusCode);
        resolve(res.statusCode===204);
      });
    });
    req.on('timeout',()=>req.destroy(new Error('dispatch_timeout')));
    req.on('error',err=>{
      console.error('N7 dispatch transport '+String(err.code||'request_failed'));
      resolve(false);
    });
    req.end(payload);
  });
}

function createN7Relay({dataDir,authenticated,originOK,readBody,loadConversations,saveConversations,modelConfigured,
  verifyToken=verifyOidc, dispatch=dispatchQwenWorkflow, dispatchConfigured=()=>Boolean(DISPATCH_TOKEN)}){
  if(!path.isAbsolute(dataDir))throw Error('N7_DATA_DIR_MUST_BE_ABSOLUTE');
  const storage=path.join(dataDir,'n7-private-queue.json');
  const lock=storage+'.lock';
  let serialized=Promise.resolve();
  function withLock(fn){
    const run=serialized.then(async()=>{
      fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
      let fd;
      for(let n=0;n<20;n++){
        try{fd=fs.openSync(lock,'wx',0o600);break;}catch(e){
          if(e.code!=='EEXIST')throw e;
          try{if(Date.now()-fs.statSync(lock).mtimeMs>90000)fs.unlinkSync(lock);}catch(x){if(x.code!=='ENOENT')throw x;}
          await new Promise(r=>setTimeout(r,100));
        }
      }
      if(fd===undefined)throw Error('queue_busy');
      try{
        let jobs=[];
        try{jobs=sanitize(JSON.parse(fs.readFileSync(storage,'utf8')));}catch(e){if(e.code!=='ENOENT')throw e;}
        jobs=jobs.filter(j=>Date.now()-(j.created||0)<7*86400000).slice(-LIMIT);
        const out=await fn(jobs);
        const tmp=storage+'.'+crypto.randomUUID()+'.tmp';
        fs.writeFileSync(tmp,JSON.stringify(jobs),{mode:0o600});
        fs.renameSync(tmp,storage);
        return out;
      }finally{fs.closeSync(fd);try{fs.unlinkSync(lock);}catch(_){}}
    });
    serialized=run.catch(()=>{});
    return run;
  }
  function validUser(req,res){
    if(!authenticated(req)){reply(res,401,{error:'Authentication required'});return false;}
    if(!originOK(req)){reply(res,403,{error:'Invalid origin'});return false;}
    return true;
  }
  async function handle(req,res){
    const url=new URL(req.url,'http://localhost'),p=url.pathname;
    if(p==='/api/status'&&req.method==='GET'){
      reply(res,200,{authenticated:!!authenticated(req),modelConfigured:!!modelConfigured(),
        queueModelAvailable:true,queueDispatchConfigured:Boolean(dispatchConfigured()),
        queueModel:dispatchConfigured()?'Qwen2.5-3B GitHub Actions (immediate trigger)':'Qwen2.5-3B GitHub Actions (scheduled fallback)'});
      return true;
    }
    const chat=p.match(/^\/api\/conversations\/([a-f0-9-]+)\/chat$/);
    if(chat&&req.method==='POST'&&!modelConfigured()){
      if(!validUser(req,res))return true;
      let b;try{b=await readBody(req);}catch(e){reply(res,400,{error:'Invalid request'});return true;}
      const prompt=typeof b?.message==='string'?b.message.trim():'';
      if(!prompt||prompt.length>MAX_PROMPT){reply(res,400,{error:'Message must contain 1–12000 characters'});return true;}
      const id=chat[1];
      const result=await withLock(jobs=>{
        const all=loadConversations(),c=all.find(x=>x.id===id);
        if(!c)return {status:404,error:'Conversation not found'};
        if(jobs.some(j=>j.conversationId===id&&['queued','processing'].includes(j.status)))
          return {status:409,error:'Wait for the previous Qwen response'};
        const job={id:crypto.randomUUID(),conversationId:id,prompt,
          created:Date.now(),status:'queued',runId:null,lease:0};
        jobs.push(job);
        c.messages=[...c.messages,{role:'user',content:prompt}].slice(-100);
        c.updated=new Date().toISOString();
        if(c.title==='Νέα συνομιλία')c.title=prompt.slice(0,52);
        saveConversations(all);
        return {status:202,job_id:job.id,pending:true};
      });
      if(result.status===202){
        // Job is safely persisted before attempting dispatch. If GitHub is
        // unavailable or credentials are absent, the existing schedule remains.
        let triggered=false;
        try{triggered=Boolean(await dispatch());}
        catch(e){console.error('N7 immediate trigger unavailable '+String(e.code||'dispatch_failed'));}
        result.dispatch=triggered?'immediate':'scheduled_fallback';
      }
      reply(res,result.status,result.status!==202?{error:result.error}:result);
      return true;
    }
    const resultPath=p.match(/^\/api\/n7\/job\/([a-f0-9-]+)$/);
    if(resultPath&&req.method==='GET'){
      if(!validUser(req,res))return true;
      const data=await withLock(jobs=>{
        const job=jobs.find(j=>j.id===resultPath[1]);
        return job?{status:job.status,job_id:job.id,conversation_id:job.conversationId,
          error:job.status==='failed'?'Qwen worker failed; retry with a new message.':undefined}:null;
      });
      reply(res,data?200:404,data||{error:'Job not found'});return true;
    }
    if(p==='/api/n7/worker/claim'&&req.method==='POST'){
      let claims;try{
        const h=String(req.headers.authorization||'');
        if(!h.startsWith('Bearer '))throw Error('missing_oidc');
        claims=await verifyToken(h.slice(7));
      }catch(_){reply(res,401,{error:'Unauthorized worker'});return true;}
      const job=await withLock(jobs=>{
        const now=Date.now();
        for(const j of jobs)if(j.status==='processing'&&j.lease<now-70*60000){j.status='queued';j.runId=null;}
        const first=jobs.find(j=>j.status==='queued');if(!first)return null;
        first.status='processing';first.lease=now;first.runId=String(claims.run_id);
        return {id:first.id,prompt:first.prompt,conversation_id:first.conversationId};
      });
      if(!job){res.writeHead(204,{'Cache-Control':'no-store'});res.end();return true;}
      reply(res,200,{job});return true;
    }
    if(p==='/api/n7/worker/complete'&&req.method==='POST'){
      let claims;try{
        const h=String(req.headers.authorization||'');
        if(!h.startsWith('Bearer '))throw Error('missing_oidc');
        claims=await verifyToken(h.slice(7));
      }catch(_){reply(res,401,{error:'Unauthorized worker'});return true;}
      let b;try{b=await readBody(req);}catch(_){reply(res,400,{error:'Bad result'});return true;}
      const answer=typeof b?.answer==='string'?b.answer.trim():'';
      if(!/^[a-f0-9-]{36}$/.test(String(b?.id||''))||
        (b?.status!=='done'&&b?.status!=='failed')||
        (b.status==='done'&&(!answer||answer.length>20000))) {
        reply(res,400,{error:'Invalid worker result'});return true;
      }
      const result=await withLock(jobs=>{
        const j=jobs.find(x=>x.id===b.id);
        if(!j)return {status:404,error:'Unknown job'};
        if(j.status==='done'&&j.runId===String(claims.run_id))return {status:200,ok:true,repeat:true};
        if(j.status!=='processing'||j.runId!==String(claims.run_id))return {status:409,error:'Invalid job lease'};
        if(b.status==='done'){
          const all=loadConversations();const c=all.find(x=>x.id===j.conversationId);
          if(!c)return {status:404,error:'Conversation removed'};
          c.messages=[...c.messages,{role:'assistant',content:answer}].slice(-100);
          c.updated=new Date().toISOString();saveConversations(all);
        }
        j.status=b.status;j.completed=Date.now();j.prompt='';
        return {status:200,ok:true};
      });
      reply(res,result.status,result.status===200?{ok:true}: {error:result.error});return true;
    }
    return false;
  }
  return {handle,withLock,storage};
}
module.exports={createN7Relay,verifyOidc};
