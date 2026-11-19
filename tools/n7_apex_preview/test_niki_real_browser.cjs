// Real Chrome + real 116MB Greek ONNX models + verified Niki KV voice: no mock audio.
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const url=process.env.N7_NIKI_BROWSER_TEST_URL||'http://127.0.0.1:4219/';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage();
 const failed=[];const jsErrors=[];
 page.on('pageerror',e=>jsErrors.push(String(e)));
 page.on('requestfailed',request=>failed.push(request.url().split('?')[0]+' '+(request.failure()?.errorText||'')));
 try{
  const response=await page.goto(url,{waitUntil:'domcontentloaded'});
  assert(response&&response.ok());
  await page.evaluate(()=>{
   window.__niki={state:'pending',progress:0,events:[]};
   const base=new URL('.',window.location.href).pathname;
   const worker=new Worker(base+'n7-niki-voice-worker-v1.js',{type:'module'});
   worker.onmessage=e=>{
    const m=e.data;
    if(m.type==='progress'){window.__niki.progress=m.total?m.loaded/m.total:0;return;}
    if(m.type==='ready'){window.__niki.events.push('ready');return;}
    if(m.type==='error'){window.__niki.state='error';window.__niki.error=m.message;return;}
    if(m.type==='audio'){
     const bytes=new Uint8Array(m.buffer);
     let max=0;const view=new DataView(m.buffer);
     for(let i=44;i<bytes.length-1;i+=128)max=Math.max(max,Math.abs(view.getInt16(i,true)));
     window.__niki={state:'audio',sampleRate:m.sampleRate,frames:m.frames,bytes:bytes.length,header:String.fromCharCode(...bytes.slice(0,4)),max,events:window.__niki.events};
    }
   };
   worker.onerror=e=>{window.__niki.state='error';window.__niki.error=e.message;};
   worker.postMessage({id:1,text:'Καλημέρα. Είμαι η Νίκη, η ελληνική φωνή του Ν επτά.'});
  });
  await page.waitForFunction(()=>window.__niki.state!=='pending',null,{timeout:420000,polling:1000});
  const result=await page.evaluate(()=>window.__niki);
  assert.equal(result.state,'audio',JSON.stringify({result,failed:failed.slice(-6),jsErrors}));
  assert.equal(result.sampleRate,24000);
  assert(result.bytes>10000&&result.frames>10);
  assert.equal(result.header,'RIFF');
  assert(result.max>80);
  assert.deepEqual(jsErrors,[]);
  console.log('N7_NIKI_REAL_BROWSER_TTS_PASS '+JSON.stringify(result));
 }finally{await browser.close();}
})().catch(e=>{console.error('N7_NIKI_REAL_BROWSER_TTS_FAIL',e);process.exitCode=1});
