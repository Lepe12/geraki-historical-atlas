'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {parseAttachments,readGroqStream,makeHandler}=require('./stream-attachments');
const img=Buffer.from('89504e470d0a1a0a11223344','hex');
test('accepts image for Groq vision and text attachment',()=>{
 const list=parseAttachments([{name:'photo.png',base64:img.toString('base64')},
   {name:'passage.txt',base64:Buffer.from('Ελληνικό κείμενο').toString('base64')}]);
 assert.equal(list[0].type,'image/png');
 assert.equal(list[1].text,'Ελληνικό κείμενο');
});
test('rejects spoofed images and oversized file lists',()=>{
 assert.throws(()=>parseAttachments([{name:'fake.png',base64:Buffer.from('not an image').toString('base64')}]));
 assert.throws(()=>parseAttachments(Array(5).fill({name:'a.txt',base64:'eA=='})));
});
test('SSE stream emits individual model token fragments',async()=>{
 const r=new Response('data: {"choices":[{"delta":{"content":"Καλη"},"finish_reason":null}]}\n\n'+
 'data: {"choices":[{"delta":{"content":"μέρα"},"finish_reason":"stop"}]}\n\n'+'data: [DONE]\n\n');
 const parts=[];const done=await readGroqStream(r,t=>parts.push(t));
 assert.equal(done.text,'Καλημέρα');assert.equal(done.reason,'stop');
 assert.deepEqual(parts,['Καλη','μέρα']);
});
test('new chat route streams and preserves only private attachment metadata',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'n7-stream-test-'));
 try{
 const id='11111111-1111-4111-8111-111111111111';
 const db=[{id,title:'Νέα συνομιλία',messages:[],updated:''}];
 const {Readable}=require('node:stream');
 const req=Readable.from([Buffer.from(JSON.stringify({message:'Περιέγραψε την εικόνα',
   attachments:[{name:'photo.png',base64:img.toString('base64')}]}))]);
 let responseText='',status;
 const res={destroyed:false,writableEnded:false,writeHead(c){status=c;},write(x){responseText+=x;},
  end(){this.writableEnded=true;}};
 let payload;
 const handler=makeHandler({API_KEY:'test',MODEL:'qwen/qwen3.8-27b',
  BASE:'https://api.groq.com/openai/v1',DATA_DIR:dir,
  promptMessages:h=>[{role:'system',content:'date 2026-11-05'},...h],load:()=>db,save:()=>{},
  publicSearch:{researchMessages:async()=>({searched:false,items:[]}),contextForResearch:()=>'',sourceFooter:()=>''},
  fetcher:async(_,options)=>{
   payload=JSON.parse(options.body);
   return new Response('data: {"choices":[{"delta":{"content":"Βλέπω εικόνα."},"finish_reason":"stop"}]}\n\n'+'data: [DONE]\n\n');
  }
 });
 await handler(req,res,id);
 assert.equal(status,200);
 assert.match(responseText,/"type":"delta"/);
 assert.match(responseText,/"type":"done"/);
 assert.equal(db[0].messages[1].content,'Βλέπω εικόνα.');
 assert.equal(db[0].messages[0].attachments[0].name,'photo.png');
 assert.equal(payload.stream,true);
 assert.match(payload.messages.find(x=>x.role==='user').content[1].image_url.url,/^data:image\/png;base64,/);
 assert.match(payload.messages[0].content,/current user supplied 1 actual image/);
 assert.match(payload.messages[0].content,/Do not infer four camera shots/);
 assert.match(payload.messages.find(x=>x.role==='user').content[0].text,/ΑΚΡΙΒΩΣ ΜΙΑ ενιαία εικόνα/);
 assert.equal(payload.messages.find(x=>x.role==='user').content.filter(x=>x.type==='image_url').length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
