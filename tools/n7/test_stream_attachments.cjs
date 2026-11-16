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
 assert.match(responseText,/"type":"status"/);
 assert.ok(responseText.indexOf('"type":"status"')<responseText.indexOf('"type":"delta"'));
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


test('Groq SSE CRLF frames are decoded as true incremental text',async()=>{
 const response=new Response('data: {"choices":[{"delta":{"content":"Γεια"},"finish_reason":null}]}\r\n\r\n'+
 'data: {"choices":[{"delta":{"content":" σου"},"finish_reason":"stop"}]}\r\n\r\n'+
 'data: [DONE]\r\n\r\n');
 const chunks=[];const result=await readGroqStream(response,t=>chunks.push(t));
 assert.equal(result.text,'Γεια σου');assert.deepEqual(chunks,['Γεια',' σου']);
});
test('a hung research provider times out and model answers without waiting forever',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'n7-stall-test-'));
 try{
  const id='11111111-1111-4111-8111-111111111111';
  const db=[{id,title:'Νέα συνομιλία',messages:[],updated:''}];
  const {Readable}=require('node:stream');
  const req=Readable.from([Buffer.from(JSON.stringify({message:'Τι ξέρεις για τον Λάντζα;'}))]);
  let output='';let ended=false;let modelBody;
  const res={destroyed:false,writableEnded:false,writeHead(){},write(x){output+=x;},end(){ended=true;this.writableEnded=true;}};
  const never=new Promise(()=>{});
  const handler=makeHandler({
   API_KEY:'mock',MODEL:'qwen/qwen3.8-27b',BASE:'https://api.groq.com/openai/v1',
   DATA_DIR:dir,promptMessages:h=>[{role:'system',content:'Be accurate.'},...h],
   load:()=>db,save:()=>{},researchDeadlineMs:15,articleDeadlineMs:15,
   publicSearch:{
    researchMessages:()=>never,
    enrichPublisherArticles:()=>never,
    cleanHistoryForTopic:x=>x,
    contextForResearch:e=>e.reason==='research_timeout'?'No sources verified':'',
    sourceFooter:()=>''
   },
   fetcher:async(_url,opts)=>{
    modelBody=JSON.parse(opts.body);
    return new Response('data: {"choices":[{"delta":{"content":"Δεν βρέθηκαν πηγές."},"finish_reason":"stop"}]}\n\n');
   }
  });
  await handler(req,res,id);
  assert.equal(ended,true);
  assert.ok(output.includes('"stage":"research_timeout"'),output);
  assert.ok(output.includes('"type":"done"'),output);
  assert.equal(modelBody.max_completion_tokens,2400);
  assert.equal(db[0].messages[1].content,'Δεν βρέθηκαν πηγές.');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});


test('when continuation Groq fails, save partial text and return a completed stream instead of losing answer',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'n7-partial-history-'));
 try{
  const id='11111111-1111-4111-8111-111111111111';
  const db=[{id,title:'Νέα συνομιλία',messages:[],updated:''}];
  const {Readable}=require('node:stream');
  const req=Readable.from([Buffer.from(JSON.stringify({message:'Τεκμηρίωσε τον Πέτρο Λάντζα και τη βιβλιογραφία του.'}))]);
  let data='',calls=0;
  const res={destroyed:false,writableEnded:false,writeHead(){},write(x){data+=x;},end(){this.writableEnded=true;}};
  const handler=makeHandler({
   API_KEY:'mock',MODEL:'qwen/qwen3.8-27b',BASE:'https://api.groq.com/openai/v1',DATA_DIR:dir,
   promptMessages:h=>[{role:'system',content:'history'},...h],load:()=>db,save:()=>{},
   publicSearch:{researchMessages:async()=>({searched:false,items:[]}),contextForResearch:()=>'',sourceFooter:()=>''},
   fetcher:async()=>{
    calls++;
    if(calls===2)throw Error('429 rate limit on continuation');
    return new Response('data: {"choices":[{"delta":{"content":"Ο Λάντζας ήταν Κερκυραίος κουρσάρος."},"finish_reason":"length"}]}\n\n'+'data: [DONE]\n\n');
   }
  });
  await handler(req,res,id);
  assert.equal(calls,2);
  assert.match(data,/"type":"done"/);
  assert.doesNotMatch(data,/"type":"error"/);
  assert.match(db[0].messages[1].content,/Γράψε «συνέχισε»/);
  assert.match(db[0].messages[1].content,/Ο Λάντζας/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('long answer prioritizes bibliography in system context before first model request',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'n7-bibliography-'));
 try{
  const id='11111111-1111-4111-8111-111111111111';
  const db=[{id,title:'Νέα συνομιλία',messages:[],updated:''}];
  const {Readable}=require('node:stream');
  const req=Readable.from([Buffer.from(JSON.stringify({message:'Πέτρος Λάντζας: πηγές, βιβλιογραφία, χρονολογία'}))]);
  const res={destroyed:false,writableEnded:false,writeHead(){},write(){},end(){this.writableEnded=true;}};
  let payload;
  const handler=makeHandler({
   API_KEY:'mock',MODEL:'qwen/qwen3.8-27b',BASE:'https://api.groq.com/openai/v1',DATA_DIR:dir,
   promptMessages:h=>[{role:'system',content:'history'},...h],load:()=>db,save:()=>{},
   publicSearch:{
    researchMessages:async()=>({searched:true,kind:'historical',items:[{title:'author article',url:'https://www.piratecartography.com/archives/114'}]}),
    enrichPublisherArticles:async d=>(d.items[0].articleRead=true,d.items[0].articleText='α'.repeat(19000),d),
    cleanHistoryForTopic:h=>h,
    contextForResearch:()=>('BIBLIOGRAPHY VERIFIED FROM ARTICLE: Laskaris; Ioannou; '+('λ'.repeat(19000))),
    sourceFooter:()=>''},
   fetcher:async(_,opts)=>{
    payload=JSON.parse(opts.body);
    return new Response('data: {"choices":[{"delta":{"content":"Βιβλιογραφία: Λάσκαρις."},"finish_reason":"stop"}]}\n\n');
   }
  });
  await handler(req,res,id);
  assert.match(payload.messages[0].content,/Laskaris; Ioannou/);
  assert.ok(payload.messages[0].content.length<15000);
  assert.match(db[0].messages[1].content,/Βιβλιογραφία/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
// N7_SPECIALIST_AGENTS_V1: the web page sends every message to this streaming route (modern-ui.js turns
// /chat into /stream), so the specialist agents must answer here, in the same conversation.
test('stream route: a recognised request is answered by its agent; everything else keeps the normal path',async()=>{
 const {Readable}=require('node:stream');
 const id='22222222-2222-4222-8222-222222222222';
 async function run({message,agents,projectId,attachments}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'n7-stream-agent-'));
  try{
   const db=[{id,title:'Νέα συνομιλία',messages:[],updated:'',...(projectId?{projectId}:{})}];
   let modelCalls=0,text='';
   const res={destroyed:false,writableEnded:false,writeHead(){},write(x){text+=x;},end(){this.writableEnded=true;}};
   const handler=makeHandler({API_KEY:'test',MODEL:'local-model',BASE:'https://api.groq.com/openai/v1',DATA_DIR:dir,
    promptMessages:h=>[{role:'system',content:'date 2026-11-16'},...h],load:()=>db,save:()=>{},agents,
    publicSearch:{researchMessages:async()=>({searched:false,items:[]}),contextForResearch:()=>'',sourceFooter:()=>''},
    fetcher:async()=>{modelCalls++;return new Response('data: {"choices":[{"delta":{"content":"Κανονική απάντηση"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');}});
   await handler(Readable.from([Buffer.from(JSON.stringify({message,...(attachments?{attachments}:{})}))]),res,id);
   const events=text.trim().split('\n').map(JSON.parse);
   return {events,db,modelCalls,reply:events.filter(e=>e.type==='delta').map(e=>e.text).join('')};
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
 }
 const seen=[];let dispatched=0;
 const agents={detect:(content,{previousAssistant})=>{seen.push({content,previousAssistant});return /καιρ|ειδήσ/u.test(content);},
  dispatch:async(history,options)=>{dispatched++;
   assert.equal(options.model,'local-model');assert.equal(typeof options.modelFetcher,'function');
   return {agent:{id:'weather',label:'Weather',greek:'Καιρός'},status:'ok',reply:'[Weather Agent]\nΑπάντηση δοκιμής για '+history.at(-1).content};}};
 // 1. recognised: answered by the agent, stored in the conversation, no model call
 const hit=await run({message:'Τι καιρό κάνει στην Αθήνα;',agents});
 assert.ok(hit.events.some(e=>e.type==='status'&&e.stage==='agent'));
 assert.equal(hit.reply,'[Weather Agent]\nΑπάντηση δοκιμής για Τι καιρό κάνει στην Αθήνα;');
 const done=hit.events.find(e=>e.type==='done');assert.equal(done.agent.id,'weather');assert.equal(hit.events.at(-1).type,'done');
 assert.equal(hit.modelCalls,0);
 assert.deepEqual(hit.db[0].messages.map(m=>m.role),['user','assistant']);
 assert.equal(hit.db[0].messages[1].content,hit.reply);assert.equal(hit.db[0].messages[1].agent.id,'weather');
 // 2. not recognised: the normal path
 const miss=await run({message:'Γράψε ένα δίστιχο',agents});
 assert.equal(miss.reply,'Κανονική απάντηση','miss reply: '+JSON.stringify(miss.events));assert.equal(miss.modelCalls,1,'miss modelCalls');assert.equal(miss.db[0].messages[1].agent,undefined);
 // 3. an agent that throws never loses the message: the normal path answers
 const broken=await run({message:'Τι καιρό κάνει;',agents:{detect:()=>true,dispatch:async()=>{throw Error('boom');}}});
 assert.equal(broken.reply,'Κανονική απάντηση','broken reply');assert.equal(broken.modelCalls,1,'broken modelCalls');
 // 4. project conversations and messages with attachments are never diverted
 const project=await run({message:'Τι καιρό κάνει;',agents,projectId:'project-1'});
 const before=dispatched;
 assert.equal(project.events.some(e=>e.stage==='agent'),false,'a project conversation is never diverted');assert.equal(dispatched,before);assert.equal(project.db[0].messages.some(m=>m.agent),false);
 const attached=await run({message:'Τι καιρό κάνει; Περιέγραψε την εικόνα',agents,attachments:[{name:'photo.png',base64:img.toString('base64')}]});
 assert.equal(attached.events.some(e=>e.stage==='agent'),false,'a message with an attachment is never diverted');assert.equal(dispatched,before);
 // 5. without the agents module nothing changes
 const none=await run({message:'Τι καιρό κάνει;',agents:null});
 assert.equal(none.modelCalls,1,'none modelCalls');
});
