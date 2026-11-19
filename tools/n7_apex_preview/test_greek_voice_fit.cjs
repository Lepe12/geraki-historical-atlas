// N7_GREEK_PHONEME_FIT_V2 regression: the real Greek Niki Pocket worker (ONNX in browser) must synthesize sentences
// whose Greek chi is palatal (chi before i/e: "βροχής", "χιλιόμετρα", "χιλιάδες"). Before the fix the
// phonemizer's id 140 (combining cedilla) was outside the model's 130 symbols and the model refused them.
// Real model, real worker, real browser; no fixture audio.
const {chromium}=require('playwright-core'),assert=require('node:assert/strict');
const url=process.env.N7_VISUAL_URL||'http://127.0.0.1:4173/n7-apex/',base=new URL(url).pathname.replace(/\/?$/,'/');
const SENTENCES=['Ύψος.','Βροχής.','Η πιθανότητα βροχής είναι μικρή.','Ο άνεμος φτάνει δώδεκα χιλιόμετρα την ώρα.','Δύο χιλιάδες είκοσι έξι.','Πιθανότητα βροχής ογδόντα τοις εκατό.','Οι ειδήσεις της ημέρας: η διπλωματία συνεχίζεται.'];
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const p=await b.newPage();await p.goto(url,{waitUntil:'domcontentloaded'});
  await p.evaluate(workerUrl=>{window.__w=new Worker(workerUrl,{type:'module'});window.__res={};window.__w.onmessage=e=>{window.__res[e.data.id]=e.data;};window.__w.postMessage({id:0,warm:true});},base+'n7-niki-voice-worker-v1.js');
  await p.waitForFunction(()=>window.__res[0],null,{timeout:420000,polling:500});
  const results=[];
  for(const [index,text] of SENTENCES.entries()){
   const id=index+1;await p.evaluate(({id,text})=>window.__w.postMessage({id,text}),{id,text});
   const r=await p.waitForFunction(id=>{const r=window.__res[id];return r&&r.type!=='progress'?{type:r.type,bytes:r.buffer&&r.buffer.byteLength,frames:r.frames,message:r.message}:null;},id,{timeout:240000,polling:300}).then(h=>h.jsonValue());
   results.push({text,...r});
   assert.equal(r.type,'audio',text+' -> '+JSON.stringify(r));assert.ok(r.frames>8,'no speech frames for: '+text);
  }
  console.log(JSON.stringify(results,null,1));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
