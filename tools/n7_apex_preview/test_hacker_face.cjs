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
  const metrics=await host.evaluate(host=>{
   const canvas=[...host.querySelectorAll('canvas')].find(c=>c.style.display!=='none');
   const ctx=canvas.getContext('2d',{willReadFrequently:true});
   if(!ctx)return {w:canvas.width,h:canvas.height,visible:-1};
   const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;let visible=0;
   for(let i=0;i<data.length;i+=4)if(data[i]+data[i+1]+data[i+2]>70)visible++;
   return {w:canvas.width,h:canvas.height,visible};
  });
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
  assert.deepEqual(errors,[]);
  console.log('N7_HACKER_REAL_ENGINE_VERIFIED=true',JSON.stringify(metrics));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
