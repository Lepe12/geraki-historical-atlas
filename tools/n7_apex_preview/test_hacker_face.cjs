const { chromium }=require('playwright-core');
const assert=require('node:assert/strict');
const BASE=process.env.N7_VISUAL_URL || 'http://127.0.0.1:4173/n7-apex-step5-hacker/';
const LABEL='[aria-label="N7 guide artwork-tile humanoid"]';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(BASE+'?face=hacker&controls=1',{waitUntil:'networkidle'});
  await page.waitForFunction(s=>{const e=document.querySelector(s);return e&&e.dataset.referenceReady==='true'&&e.dataset.face==='hacker'&&e.dataset.referenceUrl.endsWith('/n7-hacker-v1.webp');},LABEL,{timeout:30000});
  const host=page.locator(LABEL);
  assert.equal(await page.getByRole('button',{name:'Εμφάνιση Hacker N7'}).getAttribute('aria-pressed'),'true');
  const skip=page.getByRole('button',{name:'Skip',exact:true});
  if(await skip.isVisible())await skip.click();
  await host.locator('canvas:visible').waitFor({state:'visible',timeout:30000});
  const {PNG}=require('pngjs');
  const shot=await host.locator('canvas:visible').first().evaluate(c=>c.toDataURL('image/png'));
  const png=PNG.sync.read(Buffer.from(shot.split(',')[1],'base64'));
  const metrics={w:png.width,h:png.height,visible:0};
  for(let i=0;i<png.data.length;i+=4)if(png.data[i]+png.data[i+1]+png.data[i+2]>70)metrics.visible++;
  assert.deepEqual([metrics.w,metrics.h],[320,480]);
  assert(metrics.visible>800,'Hacker raster invisible in real canvas: '+JSON.stringify(metrics));
  await page.getByRole('button',{name:'Original',exact:true}).click();
  const img=page.getByRole('img',{name:'Approved N7 idle reference'});
  await img.waitFor();
  assert((await img.getAttribute('src')).endsWith('/n7-hacker-v1.webp'));
  await page.getByRole('button',{name:'Particles',exact:true}).click();
  for(const label of ['Listening','Thinking','Speaking','Idle']){
    await page.getByRole('button',{name:label,exact:true}).click();
    await page.getByText(new RegExp('MOOD \\u00b7 '+label.toUpperCase())).waitFor({timeout:12000});
  }
  await page.getByRole('button',{name:'Πρόσωπο N7'}).click();
  await page.waitForFunction(s=>document.querySelector(s)?.dataset.face==='n7',LABEL);
  await page.getByRole('button',{name:'Εμφάνιση Hacker N7'}).click();
  await page.waitForFunction(s=>document.querySelector(s)?.dataset.face==='hacker',LABEL);
  // Voice model binaries are not installed in the isolated CI static fixture.
  // The dedicated hacker test validates the actual WebGL figure, not offline TTS.
  const visualErrors=errors.filter(e=>!e.includes('/n7-apex-voice/rapunzelina-v1/ort.wasm.min.js'));
  assert.deepEqual(visualErrors,[]);
  console.log('N7_HACKER_REAL_ENGINE_VERIFIED=true',JSON.stringify(metrics));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
