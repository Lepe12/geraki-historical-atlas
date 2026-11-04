'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createN7Relay}=require('./n7-queue-bridge');
function sandbox(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'n7-queue-test-'));
 let conversations=[{id:'a1b2c3d4-1111-4222-a333-c55555555555',title:'Νέα συνομιλία',updated:'',messages:[]}];
 const bridge=createN7Relay({dataDir:dir,authenticated:r=>r.cookie==='owner',originOK:r=>r.origin!=='bad',
    readBody:async r=>r.body,loadConversations:()=>JSON.parse(JSON.stringify(conversations)),
    saveConversations:x=>{conversations=x;},modelConfigured:()=>false,
    verifyToken:async token=>{if(token!=='private-jwt')throw Error('bad');return {run_id:'12345'};}});
 function req(method,url,{cookie,origin,body,authorization}={}){return {method,url,cookie,origin,body,headers:{authorization:authorization||''}};}
 async function call(request){const res={status:0,value:null,writeHead(c){this.status=c;},end(b){this.value=b?JSON.parse(b):null;}};
 const handled=await bridge.handle(request,res);return {handled,code:res.status,value:res.value};}
 return {dir,call,req,conversations:()=>conversations};
}
test('Qwen queue is private, authenticated, and completes with signed worker',async()=>{
 const s=sandbox(),c='a1b2c3d4-1111-4222-a333-c55555555555';
 try{
  const endpoint='/api/conversations/'+c+'/chat';
  assert.equal((await s.call(s.req('POST',endpoint,{body:{message:'Γράψε σωστά ελληνικά.'}}))).code,401);
  assert.equal((await s.call(s.req('POST',endpoint,{cookie:'owner',origin:'bad',body:{message:'Γράψε σωστά ελληνικά.'}}))).code,403);
  const r=await s.call(s.req('POST',endpoint,{cookie:'owner',body:{message:'Γράψε σωστά ελληνικά.'}}));
  assert.equal(r.code,202);assert.match(r.value.job_id,/^[a-f0-9-]{36}$/);
  assert.equal(s.conversations()[0].messages[0].content,'Γράψε σωστά ελληνικά.');
  assert.equal((await s.call(s.req('GET','/api/n7/job/'+r.value.job_id))).code,401);
  assert.equal((await s.call(s.req('GET','/api/n7/job/'+r.value.job_id,{cookie:'owner'}))).value.status,'queued');
  assert.equal((await s.call(s.req('POST','/api/n7/worker/claim',{authorization:'Bearer wrong'}))).code,401);
  const claim=await s.call(s.req('POST','/api/n7/worker/claim',{authorization:'Bearer private-jwt'}));
  assert.equal(claim.code,200);assert.equal(claim.value.job.prompt,'Γράψε σωστά ελληνικά.');
  assert.equal((await s.call(s.req('POST','/api/n7/worker/complete',{authorization:'Bearer private-jwt',body:{id:r.value.job_id,status:'done',answer:'Επιμελημένη απάντηση.'}}))).code,200);
  assert.equal(s.conversations()[0].messages[1].content,'Επιμελημένη απάντηση.');
  assert.equal((await s.call(s.req('GET','/api/n7/job/'+r.value.job_id,{cookie:'owner'}))).value.status,'done');
  assert.equal((await s.call(s.req('POST','/api/n7/worker/claim',{authorization:'Bearer private-jwt'}))).code,204);
  const disk=fs.readFileSync(path.join(s.dir,'n7-private-queue.json'),'utf8');
  assert.ok(!disk.includes('Επιμελημένη απάντηση.')&&!disk.includes('Γράψε σωστά ελληνικά.'));
 }finally{fs.rmSync(s.dir,{recursive:true,force:true});}
});
test('Qwen queue rejects bad inputs and provides transparent asynchronous status',async()=>{
 const s=sandbox();try{
  assert.equal((await s.call(s.req('POST','/api/n7/worker/complete',{body:{id:'123',status:'done',answer:'hello'}}))).code,401);
  assert.equal((await s.call(s.req('POST','/api/conversations/a1b2c3d4-1111-4222-a333-c55555555555/chat',{cookie:'owner',body:{message:''}}))).code,400);
  const state=await s.call(s.req('GET','/api/status'));
  assert.equal(state.code,200);assert.equal(state.value.queueModelAvailable,true);assert.equal(state.value.modelConfigured,false);
 }finally{fs.rmSync(s.dir,{recursive:true,force:true});}
});
