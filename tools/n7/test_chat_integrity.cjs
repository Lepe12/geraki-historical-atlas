'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const {Readable}=require('node:stream');
const {appendExchange}=require('./conversation-store');
const {makeHandler}=require('./stream-attachments');
const {createOwnerChatMemory}=require('./owner-chat-memory');
const {createLibrary}=require('./source-library');
function temporary(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'n7-integrity-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('overlapping streamed requests retain both exchanges despite reverse completion',async t=>{
 const dir=temporary(t),id='11111111-1111-4111-8111-111111111111';let db=[{id,title:'Νέα συνομιλία',messages:[]}];
 const waiting=[];
 const handler=makeHandler({API_KEY:'fixture',MODEL:'fixture',BASE:'https://fixture.invalid',DATA_DIR:dir,
  promptMessages:h=>h,load:()=>structuredClone(db),save:rows=>{db=structuredClone(rows)},
  publicSearch:{researchMessages:async()=>({searched:false,items:[]}),contextForResearch:()=>'',sourceFooter:()=>''},
  fetcher:()=>new Promise(resolve=>waiting.push(resolve))});
 function run(message){const req=Readable.from([Buffer.from(JSON.stringify({message}))]);let output='';const res={destroyed:false,writableEnded:false,writeHead(){},write(x){output+=x},end(){this.writableEnded=true}};return handler(req,res,id).then(()=>assert.match(output,/"type":"done"/));}
 const first=run('πρώτο'),second=run('δεύτερο');
 for(let n=0;n<100&&waiting.length<2;n++)await new Promise(r=>setTimeout(r,5));assert.equal(waiting.length,2);
 const reply=x=>new Response('data: '+JSON.stringify({choices:[{delta:{content:x},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');
 waiting[1](reply('β'));await second;waiting[0](reply('α'));await first;
 assert.equal(db[0].messages.length,4);assert.deepEqual(db[0].messages.filter(m=>m.role==='user').map(m=>m.content).sort(),['δεύτερο','πρώτο'].sort());
});
test('separate processes append without overwriting each other and exchange retries are idempotent',async t=>{
 const dir=temporary(t),file=path.join(dir,'db.json');fs.writeFileSync(file,JSON.stringify([{id:'chat',title:'test',messages:[]}]));
 const code=`const fs=require('node:fs');const {appendExchange}=require(${JSON.stringify(require.resolve('./conversation-store'))});const dir=process.argv[1],prefix=process.argv[2],file=dir+'/db.json';for(let i=0;i<20;i++)appendExchange({dataDir:dir,load:()=>JSON.parse(fs.readFileSync(file)),save:r=>fs.writeFileSync(file,JSON.stringify(r)),id:'chat',exchangeId:prefix+i,user:{content:prefix+i},assistant:{content:'ok'}});`;
 function child(prefix){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,['-e',code,dir,prefix]);let err='';p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('exit',c=>c?reject(Error(err)):resolve());});}
 await Promise.all([child('a'),child('b')]);let rows=JSON.parse(fs.readFileSync(file));assert.equal(rows[0].messages.length,80);
 appendExchange({dataDir:dir,load:()=>rows,save:r=>{rows=r},id:'chat',exchangeId:'a0',user:{content:'duplicate'},assistant:{content:'duplicate'}});assert.equal(rows[0].messages.length,80);
});
test('Greek editing imperatives activate all approved rules and unrelated requests do not',t=>{
 const dir=temporary(t),skills=path.join(dir,'skills');fs.mkdirSync(path.join(skills,'greek-prose-editor'),{recursive:true});fs.writeFileSync(path.join(skills,'greek-prose-editor','SKILL.md'),'---\nname: greek-prose-editor\n---\nPreserve voice.');
 const memory=createOwnerChatMemory(path.join(dir,'data'),skills);for(let i=0;i<18;i++)memory.add('Κανόνας επιμέλειας αριθμός '+i+'.');
 for(const content of ['Επιμελήσου αυτό','Διόρθωσε αυτό','Ορθογραφικός έλεγχος']){const result=memory.context([{role:'user',content}]);assert.match(result,/αριθμός 0\./);assert.match(result,/αριθμός 17\./);}
 const previous=[{role:'user',content:'Διόρθωσε αυτό'}];assert.equal(memory.context([...previous,{role:'user',content:'Τι καιρό κάνει;'}]),'');assert.match(memory.context([...previous,{role:'user',content:'Συνέχισε'}]),/OWNER-APPROVED/);
});
test('retrieval aliases preserve literal evidence and PDF coverage identifies physical pages and OCR gaps',async t=>{
 const dir=temporary(t),library=createLibrary(dir,{background:false,extract:async()=>({totalPages:3,examinedPages:3,pages:[{page:1,text:'Ragusa: confiscation of a vessel.'},{page:3,text:'Venice records.'}],emptyPages:[2]})});t.after(()=>library.stop());
 await library.ingest(Buffer.from('%PDF-fixture'),'fixture.pdf');await library.tick();
 for(const query of ['Ραγούσα','Dubrovnik','κατάσχεση πλοίου']){const hits=await library.search(query);assert.equal(hits[0].text,'Ragusa: confiscation of a vessel.');assert.equal(hits[0].page,1);assert.equal(hits[0].totalPages,3);const footer=library.footer(hits);assert.match(footer,/φυσικές σ\. 1 \/ 3/);assert.match(footer,/OCR: 1/);assert.match(footer,/Δεν εξετάστηκε ολόκληρο/);}
});
test('attachment PDF coverage is stored and remains available on a follow-up',async t=>{
 const dir=temporary(t),id='11111111-1111-4111-8111-111111111111';let db=[{id,title:'fixture',messages:[]}];
 const {pdf}=require('./library-test-fixtures.cjs');
 const library=createLibrary(dir,{background:false});t.after(()=>library.stop());
 const handler=makeHandler({API_KEY:'fixture',MODEL:'fixture',BASE:'https://fixture.invalid',DATA_DIR:dir,library,
  promptMessages:h=>h,load:()=>structuredClone(db),save:rows=>{db=structuredClone(rows)},
  publicSearch:{researchMessages:async()=>({searched:false,items:[]}),contextForResearch:()=>'',sourceFooter:()=>''},
  fetcher:async()=>new Response('data: {"choices":[{"delta":{"content":"fixture"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n')});
 async function run(body){let output='';const res={destroyed:false,writableEnded:false,writeHead(){},write(x){output+=x},end(){this.writableEnded=true}};await handler(Readable.from([Buffer.from(JSON.stringify(body))]),res,id);assert.match(output,/"type":"done"/);return db[0].messages.at(-1).content;}
 const first=await run({message:'Διάβασε το PDF',attachments:[{name:'fixture.pdf',base64:pdf(['COVERAGE-PAGE','']).toString('base64')}]});
 assert.match(first,/Κάλυψη συνημμένων/);assert.match(first,/σελίδες 1 από 2/);assert.match(first,/Χωρίς αναγνώσιμο κείμενο: 2/);
 assert.match(await run({message:'Συνέχισε'}),/Χωρίς αναγνώσιμο κείμενο: 2/);
});
