// Real browser, real WebGL pixels. Visual trial only: H01 second face option,
// complete restyled menu that never covers the figure, and the v2 environment.
const {chromium}=require('playwright-core');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const url=process.env.N7_VISUAL_URL||'http://127.0.0.1:4173/n7-apex-step5-visual/';
const out=process.env.N7_FACE_OUT||'/tmp/n7-face-menu';fs.mkdirSync(out,{recursive:true});
const LABEL='[aria-label="N7 guide artwork-tile humanoid"]';
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/chromium',
  ...(process.env.N7_BROWSER_PROXY?{proxy:{server:process.env.N7_BROWSER_PROXY}}:{}),
  args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const p=await b.newPage({viewport:{width:1440,height:900},deviceScaleFactor:Number(process.env.N7_FACE_SCALE||1)}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  p.on('console',m=>{if(m.type()==='error'&&m.text().includes('THREE.WebGLProgram'))errors.push(m.text());});
  await p.goto(url,{waitUntil:'networkidle'});
  const d=p.getByRole('dialog',{name:'N7 Humanoid preview'}),host=p.getByLabel('N7 guide artwork-tile humanoid',{exact:true});
  await host.locator('canvas:visible').waitFor();
  const skip=d.getByRole('button',{name:'Skip',exact:true});if(await skip.isVisible())await skip.click();
  const result={url,errors};
  const surface=()=>host.evaluate(h=>{const c=[...h.querySelectorAll('canvas')].find(c=>c.style.display!=='none');return {face:h.dataset.face,width:c.width,height:c.height,url:h.dataset.referenceUrl,turn:+h.dataset.currentTurn,referenceVisible:h.dataset.referenceVisible};});
  const hash=()=>host.evaluate(h=>{const c=[...h.querySelectorAll('canvas')].find(c=>c.style.display!=='none');return c.toDataURL();});

  // The approved eyeless N7 face stays the default and keeps its native raster.
  await p.waitForFunction(l=>document.querySelector(l)?.dataset.referenceReady==='true',LABEL);
  const first=await surface();
  assert.equal(first.face,'n7','Approved N7 face is not the default');
  assert.deepEqual([first.width,first.height],[320,480]);
  assert(first.url.endsWith('/n7-humanoid-face-v4.webp'),'Default face is not the approved v4 artwork');
  assert.equal(await d.getByRole('button',{name:'Πρόσωπο N7',exact:true}).getAttribute('aria-pressed'),'true');

  // Every existing option is still present, by its unchanged accessible name.
  for(const name of ['Idle','Listening','Thinking','Speaking','Original','Particles','Compare','Assembly','Effects On','Technical details','Συνομιλία','Exit','Φωνητική συνομιλία','Πρόσωπο N7','Πρόσωπο H01'])
   assert.equal(await d.getByRole('button',{name,exact:true}).count(),1,'Menu option missing: '+name);
  assert.equal(await d.getByRole('link',{name:'Πραγματικό 3D',exact:true}).count(),1,'3D avatar link missing');
  await d.getByRole('button',{name:'Assembly',exact:true}).click();
  await d.getByRole('button',{name:'Replay Assembly',exact:true}).waitFor();
  await d.getByRole('button',{name:'Skip',exact:true}).click();

  // The menu and the voice panel never cover the figure, closed or open.
  const overlap=async()=>p.evaluate(()=>{const f=document.querySelector('.n7-guide-figure').getBoundingClientRect();const box=e=>e.getBoundingClientRect();
   // Overlap depth in CSS pixels; under one pixel is sub-pixel layout rounding.
   const hit=r=>{const w=Math.min(f.right,r.right)-Math.max(f.left,r.left),h=Math.min(f.bottom,r.bottom)-Math.max(f.top,r.top);return w>0&&h>=1?Math.round(h):0;};
   return {figure:[f.width,f.height],dock:hit(box(document.querySelector('.n7-guide-controls'))),voice:hit(box(document.querySelector('#n7-guide-voice'))),header:hit(box(document.querySelector('.n7-guide-header')))};});
  const closed=await overlap();
  assert.deepEqual([closed.dock,closed.voice,closed.header],[0,0,0],'Menu covers the figure: '+JSON.stringify(closed));
  assert(closed.figure[1]>520,'Figure is too small beside the menu: '+closed.figure);
  const dock=await p.locator('.n7-guide-controls').boundingBox();
  assert(dock.height<64,'Desktop menu is not one compact row: '+dock.height);
  await p.screenshot({path:path.join(out,'n7-face.png')});

  // Environment: the v2 raster is the one shown, and it still has living highlights.
  const bg=p.getByLabel('N7 Step 6 living backdrop',{exact:true});
  assert((await bg.locator('img').getAttribute('src')).endsWith('/n7-environment-v3.webp'),'New environment is not in use');
  await p.waitForFunction(()=>Number(document.querySelector('[aria-label="N7 Step 6 living backdrop"]')?.dataset.highlightCount)>0);
  result.backdrop={highlights:Number(await bg.getAttribute('data-highlight-count'))};

  // H01: same scene and joints, higher-resolution raster of the composed figure.
  await d.getByRole('button',{name:'Πρόσωπο H01',exact:true}).click();
  await p.waitForFunction(l=>{const h=document.querySelector(l);return h?.dataset.face==='h01'&&h.dataset.referenceReady==='true'&&h.dataset.rig==='n7-neck-skull-joints-v3';},LABEL);
  const h01=await surface();
  assert.deepEqual([h01.width,h01.height],[800,1200]);
  assert(h01.url.endsWith('/n7-humanoid-h01-v2.webp'));
  await d.getByRole('button',{name:'Technical details',exact:true}).click();
  await d.getByLabel('Breathing',{exact:true}).uncheck();
  await d.getByRole('button',{name:'Technical details',exact:true}).click();
  const r=await host.boundingBox(),cx=r.x+r.width/2,cy=r.y+r.height/2;
  await p.mouse.move(cx,cy);
  await p.waitForFunction(l=>document.querySelector(l).dataset.referenceVisible==='true',LABEL);
  const rest=await hash();
  const clip={x:r.x,y:r.y,width:r.width,height:r.height*.62};
  await p.screenshot({path:path.join(out,'h01-front.png'),clip});
  result.h01={poses:{}};
  for(const [name,tx,ty] of [['right',1,0],['left',-1,0],['up',0,1],['down',0,-1]]){
   await p.mouse.move(cx+tx*r.width*.42,cy-ty*r.height*.42,{steps:4});
   await p.waitForFunction(({l,tx,ty})=>{const h=document.querySelector(l);return Math.abs(+h.dataset.currentTurn-tx)<.003&&Math.abs(+h.dataset.currentPitch-ty)<.003;},{l:LABEL,tx,ty});
   await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const moved=await host.evaluate(h=>{const c=[...h.querySelectorAll('canvas')].find(c=>c.style.display!=='none');const gl=c.getContext('webgl2')||c.getContext('webgl');const px=new Uint8Array(c.width*c.height*4);gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,px);let gaps=0;for(let i=3;i<px.length;i+=4)if(px[i]!==255)gaps++;return {gaps,width:c.width};});
   assert.equal(moved.gaps,0,'H01 '+name+' has coverage gaps');
   assert.notEqual(await hash(),rest,'H01 head did not move: '+name);
   result.h01.poses[name]=moved;await p.screenshot({path:path.join(out,'h01-'+name+'.png'),clip});
  }
  await p.mouse.move(cx,cy);
  await p.waitForFunction(l=>{const h=document.querySelector(l);return +h.dataset.currentTurn===0&&+h.dataset.currentPitch===0&&h.dataset.referenceVisible==='true';},LABEL);
  await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await hash(),rest,'H01 did not return to its exact rest image');
  result.h01.exactReturn=true;

  // Moods, voice panel and persistence keep working with H01 selected.
  for(const mood of ['Listening','Thinking','Speaking','Idle']){await d.getByRole('button',{name:mood,exact:true}).click();await d.getByText('MOOD · '+mood.toUpperCase(),{exact:false}).waitFor();}
  await d.getByRole('button',{name:'Συνομιλία',exact:true}).click();
  await d.getByLabel('Φωνητικό μήνυμα',{exact:true}).waitFor();
  // The figure is refitted by a ResizeObserver; measure after it has settled.
  await p.waitForFunction(()=>{const f=document.querySelector('.n7-guide-figure').getBoundingClientRect(),s=document.querySelector('.n7-guide-figure-slot').getBoundingClientRect();return f.height<=s.height+1;});
  await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const open=await overlap();
  assert.deepEqual([open.dock,open.voice],[0,0],'Open conversation covers the figure: '+JSON.stringify(open));
  await p.screenshot({path:path.join(out,'h01-conversation.png')});
  await p.reload({waitUntil:'networkidle'});
  await p.waitForFunction(l=>document.querySelector(l)?.dataset.face==='h01',LABEL);
  result.h01.persistsAcrossReload=true;
  await p.getByRole('dialog',{name:'N7 Humanoid preview'}).getByRole('button',{name:'Πρόσωπο N7',exact:true}).click();
  await p.waitForFunction(l=>{const h=document.querySelector(l);return h?.dataset.face==='n7'&&h.dataset.referenceReady==='true';},LABEL);
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
