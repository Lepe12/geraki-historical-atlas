'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createLibrary,hash,normalize,RPC_ID}=require('./source-library'),{pdf}=require('./library-test-fixtures.cjs');
const temporary=()=>fs.mkdtempSync(path.join(os.tmpdir(),'n7-library-'));
async function imported(l,buffer,name='source.pdf',metadata={}){const m=await l.init({name,size:buffer.length,expectedHash:hash(buffer),...metadata});await l.chunk({id:m.id,offset:0,base64:buffer.toString('base64')});await l.finalize({id:m.id});return m.id;}
test('resumable upload verifies digests and replay bytes; malformed IDs cannot escape private library',async()=>{
 const dir=temporary(),l=createLibrary(dir,{background:false});try{const b=pdf(['original']),m=await l.init({name:'book.pdf',size:b.length,expectedHash:hash(b)});
 const split=100;await l.chunk({id:m.id,offset:0,base64:b.subarray(0,split).toString('base64')});const recovered=createLibrary(dir,{background:false});assert.equal(recovered.all()[0].received,split);
 assert.equal((await recovered.chunk({id:m.id,offset:0,base64:b.subarray(0,split).toString('base64')})).received,split);
 await assert.rejects(recovered.chunk({id:m.id,offset:0,base64:Buffer.from('changed').toString('base64')}),/chunk_conflict/);
 await assert.rejects(recovered.finalize({id:m.id}),/upload_incomplete/);
 await recovered.chunk({id:m.id,offset:split,base64:b.subarray(split).toString('base64')});const done=await recovered.finalize({id:m.id});assert.equal(done.sourceHash,hash(b));assert.equal(fs.statSync(path.join(l.root,m.id,'original')).mode&0o777,0o600);
 await assert.rejects(l.rpc({op:'status',id:'../../etc/passwd'}),/invalid_document_id/);
 await assert.rejects(l.init({name:'big.pdf',size:101*1024*1024}),/100_MB/);
 const bad=await l.init({name:'wrong.pdf',size:b.length,expectedHash:'0'.repeat(64)});await l.chunk({id:bad.id,offset:0,base64:b.toString('base64')});await assert.rejects(l.finalize({id:bad.id}),/digest/);
 }finally{l.stop();fs.rmSync(dir,{recursive:true,force:true})}
});
test('batch extraction resumes after a fresh instance and reaches physical page 120 beyond old cap',async()=>{
 const dir=temporary(),l=createLibrary(dir,{background:false});try{const id=await imported(l,pdf(Array.from({length:120},(_,i)=>'Archive physical page '+(i+1)+' '+(i===118?'NAPLES-UNIQUE-7294':'historical record'))),'long-book.pdf',{title:'Historical Book',author:'Lascaris',pageOffset:-8});
 await l.tick();assert.equal(l.all()[0].nextPage,9);const restarted=createLibrary(dir,{background:false});for(let n=0;n<14;n++)await restarted.tick();
 const m=restarted.all()[0];assert.equal(m.status,'ready');assert.equal(m.nextPage,121);assert.equal(m.totalPages,120);const hits=await restarted.search('NAPLES-UNIQUE-7294');assert.equal(hits[0].page,119);assert.equal(hits[0].printedPage,111);assert.match(hits[0].text,/NAPLES-UNIQUE-7294/);assert.equal(hits[0].sourceHash,m.sourceHash);
 }finally{l.stop();fs.rmSync(dir,{recursive:true,force:true})}
});
test('permanent retrieval works across conversations and spelling variants; review keeps prior versions',async()=>{
 const dir=temporary(),l=createLibrary(dir,{background:false});try{
 const id=await imported(l,Buffer.from('Ο Πέτρος Λάντζας έδρασε στην Πάργα το 1573.\fΟ Mario Lanza ήταν τραγουδιστής.'),'source.txt',{title:'Ιστορική μελέτη',author:'Λάσκαρις',pageOffset:null});await l.tick();
 const recovered=createLibrary(dir,{background:false});for(const name of ['Pietro Lanza','Petros Lantzas','Pedro Lanza','Πέτρος Λάντζας']){const hits=await recovered.search('Τι γράφει ο Lascaris για '+name);assert.equal(hits.length,1,name);assert.equal(hits[0].page,1);assert.equal(hits[0].printedPage,null);}
 await recovered.rpc({op:'review',id,page:1,text:'Ο Πέτρος Λάντζας έδρασε στην Κέρκυρα το 1574.'});assert.ok(fs.readdirSync(path.join(l.root,id,'revisions')).length);const hit=(await recovered.search('Petros Lantzas Κέρκυρα'))[0];assert.match(hit.text,/1574/);assert.equal(hit.method,'manual');assert.doesNotMatch(hit.text,/1573/);
 assert.equal(normalize('Πέτρος Λάντζας'),normalize('Petros Lantzas'));
 }finally{l.stop();fs.rmSync(dir,{recursive:true,force:true})}
});
test('OCR batches preserve progress and drafts when a provider stops; remaining pages resume',async()=>{
 const dir=temporary();let fail=true;const l=createLibrary(dir,{background:false,ocr:async images=>{if(fail)throw Error('ocr_rate_limited');return images.map(x=>({page:x.page,text:'EXACT PAGE '+x.page,uncertain:''}))}});try{const id=await imported(l,pdf(['','','','','']),'scanned.pdf');await l.tick();const image=Buffer.from([255,216,255,0]).toString('base64');
 assert.deepEqual((await l.rpc({op:'status',id})).ocrPages,[1,2,3,4,5]);await assert.rejects(l.rpc({op:'ocr',id,images:[{page:1,base64:image}]}),/rate_limited/);assert.equal((await l.rpc({op:'status',id})).ocrPages.length,5);
 fail=false;await l.rpc({op:'ocr',id,images:[1,2,3].map(page=>({page,base64:image}))});const restarted=createLibrary(dir,{background:false,ocr:async images=>images.map(x=>({page:x.page,text:'RESUMED PAGE '+x.page}))});assert.deepEqual((await restarted.rpc({op:'status',id})).ocrPages,[4,5]);await restarted.rpc({op:'ocr',id,images:[4,5].map(page=>({page,base64:image}))});assert.equal(restarted.all()[0].status,'needs_review');assert.equal(restarted.all()[0].reviewRemaining,5);assert.match(restarted.page(id,5).text,/RESUMED PAGE 5/);await restarted.rpc({op:'review',id,page:5,text:'Ελεγμένη μεταγραφή'});assert.equal(restarted.all()[0].reviewRemaining,4);
 }finally{l.stop();fs.rmSync(dir,{recursive:true,force:true})}
});
test('unsupported references and changed quotations are flagged; conflicting dates remain unresolved',()=>{
 const dir=temporary(),l=createLibrary(dir,{background:false});try{const hits=[{ref:'L1',text:'Ο Πέτρος Λάντζας γεννήθηκε το 1530.',sourceHash:'a',title:'A',page:1,printedPage:null,method:'pdf_text'},{ref:'L2',text:'Ο Πέτρος Λάντζας γεννήθηκε το 1535.',sourceHash:'b',title:'B',page:3,printedPage:null,method:'pdf_text'}];const result=l.audit('«Ο Pietro Lanza γεννήθηκε το 1530.» [L99]',hits);assert.deepEqual(result.invalidRefs,['L99']);assert.equal(result.unmatchedQuotes.length,1);assert.equal(result.possibleConflicts.length,1);assert.match(l.evidenceContext(hits,'Petros Lantzas'),/POSSIBLE DATE CONFLICTS/);
 }finally{l.stop();fs.rmSync(dir,{recursive:true,force:true})}
});
test('new research identities filter clear namesakes without claiming ambiguous metadata identifies the corsair',async()=>{
 const {searchLanza}=require('./research-identities');let calls=0;const result=await searchLanza(async()=>{calls++;return {configured:true,queried:true,reason:'ok',items:[{url:'a',title:'Mario Lanza'},{url:'b',title:'Pietro Lanza di Trabia'},{url:'c',title:'Pietro Lanza',excerpt:'Corfu corsair Parga'},{url:'d',title:'Lanza manuscript'}]}});assert.equal(calls,2);assert.equal(result.rejectedDifferentPeople,2);assert.equal(result.items[0].identityStatus,'context_match');assert.equal(result.items[1].identityStatus,'identity_unverified');
});
test('library RPC and automatic PDF ingestion are available through existing guarded chat handler',async()=>{
 const {makeHandler}=require('./stream-attachments'),{Readable}=require('node:stream');const dir=temporary();try{const handler=makeHandler({API_KEY:'test',MODEL:'test',BASE:'https://example.org',DATA_DIR:dir,load:()=>[],save:()=>{},publicSearch:{}});let data,status;const res={writeHead:s=>status=s,end:t=>data=JSON.parse(t)};await handler(Readable.from([Buffer.from('{"op":"list"}')]),res,RPC_ID);assert.equal(status,200);assert.deepEqual(data.documents,[]);}finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('a fresh chat retrieves an older library page, sends actual excerpt to model and records provenance',async()=>{
 const {makeHandler}=require('./stream-attachments'),{Readable}=require('node:stream');const dir=temporary(),l=createLibrary(dir,{background:false});try{
  const source=await imported(l,Buffer.from('Ο Πέτρος Λάντζας έδρασε στην Πάργα το 1573. Κωδικός αρχείου CORFU-9137.'),'study.txt',{title:'Μελέτη για τον Λάντζα',author:'Λάσκαρις'});await l.tick();
  const id='11111111-1111-4111-8111-111111111111',db=[{id,title:'Νέα συνομιλία',messages:[]}];let payload,wire='';
  const handler=makeHandler({API_KEY:'test',MODEL:'test',BASE:'https://example.org',DATA_DIR:dir,promptMessages:h=>[{role:'system',content:'N7'},...h],load:()=>db,save:()=>{},publicSearch:{researchMessages:async()=>({searched:false,items:[]}),contextForResearch:()=>'',sourceFooter:()=>''},fetcher:async(_u,o)=>{payload=JSON.parse(o.body);return new Response('data: {"choices":[{"delta":{"content":"Ο Λάσκαρις αναφέρει την Πάργα το 1573 [L1]."},"finish_reason":"stop"}]}\n\n')}});
  const req=Readable.from([Buffer.from(JSON.stringify({message:'Τι γράφει ο Lascaris για τον Petros Lantzas;'}))]);const res={writeHead:()=>{},write:t=>{wire+=t},end(){this.writableEnded=true}};await handler(req,res,id);
  assert.match(payload.messages[0].content,/CORFU-9137/);assert.match(payload.messages[0].content,/N7 PRIVATE LIBRARY EVIDENCE/);assert.match(wire,/Τεκμήρια μόνιμης βιβλιοθήκης/);assert.equal(db[0].messages[1].evidenceAudit.library[0].id,source);assert.equal(db[0].messages[1].evidenceAudit.library[0].page,1);assert.deepEqual(db[0].messages[1].evidenceAudit.invalidRefs,[]);
 }finally{l.stop();fs.rmSync(dir,{recursive:true,force:true})}
});
test('author metadata alone never substitutes for missing content; explicit page requests select the requested source page',async()=>{
 const dir=temporary(),l=createLibrary(dir,{background:false});try{const id=await imported(l,Buffer.from('First source section\fSecond section with unique code QZ-7391.'),'article.txt',{title:'LibraryQA',author:'TestWriter'});await l.tick();assert.equal((await l.search('TestWriter Astypalaia')).length,0);const h=await l.search('Στο LibraryQA τι αναγράφεται στη σελίδα 2;');assert.equal(h.length,1);assert.equal(h[0].page,2);assert.match(h[0].text,/QZ-7391/);assert.equal(h[0].kind,'text');}finally{l.stop();fs.rmSync(dir,{recursive:true,force:true})}
});
test('resource-limited PDF extraction automatically retries a smaller persisted batch without advancing cursor',async()=>{
 const dir=temporary();let calls=0;const l=createLibrary(dir,{background:false,extract:async(_f,start,count)=>{calls++;if(count===8)throw Error('pdf_batch_timeout');assert.equal(start,1);assert.equal(count,4);return {totalPages:1,examinedPages:1,pages:[{page:1,text:'Recovered evidence'}],emptyPages:[]}}});try{await imported(l,pdf(['test']));await l.tick();let m=l.all()[0];assert.equal(m.status,'queued');assert.equal(m.nextPage,1);assert.equal(m.batchSize,4);await l.tick();m=l.all()[0];assert.equal(m.status,'ready');assert.equal(m.nextPage,2);assert.equal(calls,2);}finally{l.stop();fs.rmSync(dir,{recursive:true,force:true})}
});
