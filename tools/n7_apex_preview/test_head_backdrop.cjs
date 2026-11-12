// Real, unmocked browser pixels. Run against a built isolated preview or live URL.
const {chromium}=require('playwright-core');
const {PNG}=require('pngjs');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const url=process.env.N7_VISUAL_URL||'http://127.0.0.1:4173/n7-apex-step5/';
const out=process.env.N7_VISUAL_OUT||'/tmp/n7-apex-visual';fs.mkdirSync(out,{recursive:true});
function save(name,data){fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(data.split(',')[1],'base64'));}
function difference(a,b){let count=0,max=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);count+=d>0;max=Math.max(max,d);}return {count,max};}
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/chromium',
  ...(process.env.N7_BROWSER_PROXY?{proxy:{server:process.env.N7_BROWSER_PROXY}}:{}),
  args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const p=await b.newPage({viewport:{width:1440,height:900}}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  p.on('console',m=>{if(m.type()==='error'&&m.text().includes('THREE.WebGLProgram'))errors.push(m.text());});
  await p.goto(url,{waitUntil:'networkidle'});
  const host=p.getByLabel('N7 guide artwork-tile humanoid',{exact:true}),canvas=host.locator('canvas:visible');
  await canvas.waitFor();
  await p.waitForFunction(()=>document.querySelector('[aria-label="N7 guide artwork-tile humanoid"]')?.dataset.renderer==='shared-edge-texture-mesh');
  const skip=p.getByRole('button',{name:'Skip',exact:true});if(await skip.isVisible())await skip.click();
  await p.getByRole('button',{name:'Technical details',exact:true}).click();
  await p.getByLabel('Breathing',{exact:true}).uncheck();
  const bounds=await host.boundingBox();
  const move=async turn=>{
   await p.mouse.move(bounds.x+bounds.width/2+bounds.width*.42*turn,bounds.y+bounds.height/2);
   await p.waitForFunction(t=>{const h=document.querySelector('[aria-label="N7 guide artwork-tile humanoid"]'),n=Number(h.dataset.currentTurn);return t===0?n===0&&h.querySelector('canvas').style.display==='block'&&Number(h.dataset.headTarget)===0:Math.abs(n-t)<.003;},turn);
   // Wait for presentation as well as the numeric target; direct WebGL and
   // native reference surfaces change on the next compositor frame.
   await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  };
  const decodedReference=await p.evaluate(async()=>{const img=new Image();img.src=document.querySelector('[aria-label="N7 guide artwork-tile humanoid"]').dataset.referenceUrl;await img.decode();const c=document.createElement('canvas');c.width=320;c.height=480;const x=c.getContext('2d');x.drawImage(img,0,0);return Array.from(x.getImageData(0,0,320,480).data);});
  async function pixels(){
   // Read the same encoded raster saved as evidence, after selecting the visible
   // surface atomically. This also avoids cross-context GPU readback races.
   const read=await host.evaluate(h=>{const c=[...h.querySelectorAll('canvas')].find(c=>c.style.display!=="none");return {png:c.toDataURL(),state:{...h.dataset},styles:[...h.querySelectorAll('canvas')].map(c=>c.style.display)};});
   return PNG.sync.read(Buffer.from(read.png.split(',')[1],'base64')).data;
  }

  const reference=Array.from(await host.evaluate(h=>Array.from(h.querySelector("canvas").getContext("2d").getImageData(0,0,320,480).data)));
  assert(difference(reference,decodedReference).max<=2,"Frozen source differs beyond browser WebP rounding");
  const brightHead=px=>{let n=0;for(let i=0;i<205*320*4;i+=4)n+=px[i]+px[i+1]+px[i+2]>45;return n;};
  fs.writeFileSync(path.join(out,"reference-pixels.png"),PNG.sync.write({width:320,height:480,data:Buffer.from(reference)}));
  const referenceHead=brightHead(reference);
  const results={url,poses:[],motion:{},background:{},errors};
  await move(0);
  assert.deepEqual(difference(await pixels(),reference),{count:0,max:0},'Neutral source pixels changed');
  console.log('Neutral artwork: exact. Auditing 96 consecutive frames...');
  // Consecutive frames during reversals, not only the settled endpoints.
  const motion=await host.evaluate(async h=>{
   const r=h.getBoundingClientRect();const rows=[];
   for(let frame=0;frame<96;frame++){
    const t=frame<32?-1:frame<64?1:0;
    window.dispatchEvent(new PointerEvent('pointermove',{clientX:r.left+r.width/2+r.width*.42*t,clientY:r.top+r.height/2}));
    await new Promise(requestAnimationFrame);
    const c=[...h.querySelectorAll('canvas')].find(c=>c.style.display!=='none');
    const ctx=c.getContext('2d');let px;
    if(ctx)px=ctx.getImageData(0,0,320,480).data;
    else{const gl=c.getContext('webgl2')||c.getContext('webgl');px=new Uint8Array(320*480*4);gl.readPixels(0,0,320,480,gl.RGBA,gl.UNSIGNED_BYTE,px);}
    let gaps=0;
    for(let i=3;i<px.length;i+=4)if(px[i]!==255)gaps++;
    rows.push({turn:Number(h.dataset.currentTurn),gaps,renderMs:Number(h.dataset.renderMs)});
   }return rows;
  });
  assert(motion.every(f=>f.gaps===0),'Missing coverage during motion');
  results.motion.coverageFrames=motion.length;results.motion.maxGaps=Math.max(...motion.map(f=>f.gaps));
  console.log('Motion coverage: PASS. Profiling 120 frames...');
  // Performance sampled separately: no pixel readback or screenshots in this run.
  results.motion.profile=await host.evaluate(async h=>{
   const r=h.getBoundingClientRect(),times=[],render=[];let prev=0;
   for(let f=0;f<121;f++){
    window.dispatchEvent(new PointerEvent('pointermove',{clientX:r.left+r.width/2+Math.sin(f/18)*r.width*.42,clientY:r.top+r.height/2}));
    const now=await new Promise(requestAnimationFrame);
    if(prev){times.push(now-prev);render.push(Number(h.dataset.renderMs));}prev=now;
   }
   const stats=a=>{const s=[...a].sort((a,b)=>a-b);return {mean:a.reduce((s,v)=>s+v,0)/a.length,p50:s[Math.floor(s.length*.5)],p95:s[Math.floor(s.length*.95)],max:s.at(-1)};};
   return {frames:times.length,frameMs:stats(times),renderMs:stats(render),intervalsOver25ms:times.filter(t=>t>25).length,estimatedMissed60HzFrames:times.reduce((n,t)=>n+Math.max(0,Math.round(t/(1000/60))-1),0)};
  });
  console.log('Profile complete:',JSON.stringify(results.motion.profile));
  console.log('Capturing eight poses...');
  for(const [name,t]of [['neutral',0],['left25',-.25],['left50',-.5],['left100',-1],['right25',.25],['right50',.5],['right100',1],['return',0]]){
   await move(t);const px=await pixels();let gaps=0;for(let i=3;i<px.length;i+=4)gaps+=px[i]!==255;
   assert.equal(gaps,0,name+' coverage');
   assert(brightHead(px)>referenceHead*.92,name+' head disappeared/darkened excessively');
   const body=difference(px.slice(208*320*4),reference.slice(208*320*4));
   if(body.max>2)save(name+'-body-failure',await canvas.evaluate(c=>c.toDataURL()));
   assert(body.max<=2,name+' moved/repainted fixed neck/body: '+JSON.stringify(body));
   if(t===0&&difference(px,reference).count){save(name+'-neutral-failure',await canvas.evaluate(c=>c.toDataURL()));console.log('NEUTRAL FAILURE',await host.evaluate(h=>({ds:{...h.dataset},styles:[...h.querySelectorAll('canvas')].map(c=>c.style.display)})));}
   if(t===0) assert.equal(difference(px,reference).count,0,name+' reference equality');
   save(name,await canvas.evaluate(c=>c.toDataURL()));await p.screenshot({path:path.join(out,name+'-scene.png')});
   results.poses.push({name,turn:Number(await host.getAttribute('data-current-turn')),gaps,bodyMaxDifference:body.max});
  }
  console.log('Eight poses: PASS. Auditing vertical head pitch...');
   const movePitch=async pitch=>{
     await p.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2-bounds.height*.42*pitch);
     await p.waitForFunction(t=>{const h=document.querySelector('[aria-label="N7 guide artwork-tile humanoid"]');return Math.abs(Number(h.dataset.currentPitch)-t)<.003;},pitch);
     await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   };
   // Deploy candidate: test requires visible movement, not just shader uniform updates.
   // Numeric pitch alone is insufficient. Measure visible vertical movement
   // of the source artwork in a fixed upper-head region.
   const headCenterY=px=>{
     let sum=0,n=0;
     for(let y=18;y<174;y++) for(let x=88;x<232;x++){
       const i=(y*320+x)*4,r=px[i],g=px[i+1],b=px[i+2];
       if(r+g+b>92){sum+=y;n++;}
     }
     return n?sum/n:NaN;
   };
   const centerY=headCenterY(reference);
   // A rigid nod can reshape which bright pixels enter the clipped forehead
   // ROI without translating that ROI's centroid. Track the artwork's amber
   // face core instead for signed up/down motion; retain silhouette/size/jaw
   // checks independently below.
   const faceCoreY=px=>{
     let ysum=0,n=0;
     for(let y=85;y<205;y++)for(let x=105;x<215;x++){
       const i=(y*320+x)*4,r=px[i],g=px[i+1],b=px[i+2];
       if(r>90&&r>g*1.12&&g>b*1.15){ysum+=y;n++;}
     }
     assert(n>100,'Amber face feature disappeared');return ysum/n;
   };
   const neutralFaceY=faceCoreY(reference);
   // A vertical nod must not expand the head: compare the vertically sampled
   // distribution of bright face features, not just whether pitch state changed.
   const headSpread=px=>{
     let sum=0,sumSq=0,n=0;
     for(let y=18;y<174;y++)for(let x=88;x<232;x++){
       const i=(y*320+x)*4;
       if(px[i]+px[i+1]+px[i+2]>92){sum+=y;sumSq+=y*y;n++;}
     }
     return n?Math.sqrt(Math.max(0,sumSq/n-(sum/n)**2)):NaN;
   };
   const neutralSpread=headSpread(reference);
   // Isolated jaw-and-skull validation release candidate.
   // The approved figure's lower face/chin must participate in the pitch.
   // Checking only the forehead previously allowed a frozen jaw to pass.
   const jawChange=px=>{
     let changed=0;
     for(let y=155;y<197;y++)for(let x=110;x<211;x++){
       const i=(y*320+x)*4;
       if(Math.abs(px[i]-reference[i])+Math.abs(px[i+1]-reference[i+1])+Math.abs(px[i+2]-reference[i+2])>24)changed++;
     }
     return changed;
   };
   results.pitch=[];
   for(const [name,angle] of [['up50',.5],['up100',1],['down50',-.5],['down100',-1],['pitch-neutral',0]]){
     await movePitch(angle);
     const px=await pixels();let gaps=0;
     for(let i=3;i<px.length;i+=4) gaps+=px[i]!==255;
     assert.equal(gaps,0,name+' vertical motion coverage');
     const body=difference(px.slice(208*320*4),reference.slice(208*320*4));
     assert(body.max<=2,name+' fixed torso/neck changed');
     if(angle===0)assert.equal(difference(px,reference).count,0,'Pitch return neutral differs from approved artwork');
     save(name,await canvas.evaluate(c=>c.toDataURL()));
     const visibleY=headCenterY(px),dy=visibleY-centerY,faceDelta=faceCoreY(px)-neutralFaceY;
     const spread=headSpread(px),scaleRatio=spread/neutralSpread;
     const jawChangedPixels=jawChange(px);
     if(Math.abs(angle)===1)assert(jawChangedPixels>140,name+' lower jaw is visually frozen: '+jawChangedPixels+' changed pixels');
     assert(scaleRatio<1.05&&scaleRatio>.95,name+' head stretched or collapsed: '+scaleRatio.toFixed(3));
     if(angle===1)assert(faceDelta<-2.5,'Upward face-core motion is too small: '+faceDelta.toFixed(2)+' px');
     if(angle===-1)assert(faceDelta>2.5,'Downward face-core motion is too small: '+faceDelta.toFixed(2)+' px');
     results.pitch.push({name,pitch:Number(await host.getAttribute('data-current-pitch')),visibleCentroidY:visibleY,verticalDeltaPx:dy,faceCoreDeltaPx:faceDelta,headScaleRatio:scaleRatio,jawChangedPixels,gaps,bodyMaxDifference:body.max});
   }
   results.diagonal=[];
   for(const [name,yaw,nod]of [['upper-left',-1,1],['upper-right',1,1],['lower-left',-1,-1],['lower-right',1,-1]]){
     await p.mouse.move(bounds.x+bounds.width/2+bounds.width*.42*yaw,bounds.y+bounds.height/2-bounds.height*.42*nod);
     await p.waitForFunction(({yaw,nod})=>{const h=document.querySelector('[aria-label="N7 guide artwork-tile humanoid"]');return Math.abs(Number(h.dataset.currentTurn)-yaw)<.003&&Math.abs(Number(h.dataset.currentPitch)-nod)<.003;},{yaw,nod});
     await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
     const px=await pixels(),scaleRatio=headSpread(px)/neutralSpread,body=difference(px.slice(208*320*4),reference.slice(208*320*4));
     assert(scaleRatio>.95&&scaleRatio<1.05,name+' diagonal collapsed/stretched head: '+scaleRatio.toFixed(3));
     assert(body.max<=2,name+' moved fixed neck/body');
     assert(brightHead(px)>referenceHead*.92,name+' lost head coverage');
     save(name,await canvas.evaluate(c=>c.toDataURL()));results.diagonal.push({name,headScaleRatio:scaleRatio,bodyMaxDifference:body.max});
   }
   await movePitch(0);await move(0);
   console.log('Vertical pitch: PASS. Observing backdrop for 10 seconds...');
  await p.getByRole('button',{name:'Technical details',exact:true}).click();
  const bg=p.getByLabel('N7 Step 6 living backdrop',{exact:true}),lights=bg.locator('[data-ridge-layer]');
  await p.waitForFunction(()=>Number(document.querySelector('[aria-label="N7 Step 6 living backdrop"]')?.dataset.highlightCount)>0);
  const figure=host.locator('..');await figure.evaluate(e=>e.style.visibility='hidden');
  await p.getByRole('button',{name:'Effects On',exact:true}).click();
  assert.equal(await lights.isVisible(),false,'Effects Off overlay visible');
  const offShot=await bg.screenshot({path:path.join(out,'background-off.png')});
  const baseShot=await bg.locator('img').screenshot();
  assert.equal(difference(PNG.sync.read(offShot).data,PNG.sync.read(baseShot).data).count,0,'Effects Off differs from original image');
  await p.getByRole('button',{name:'Effects Off',exact:true}).click();
  const samples=[];
  for(let i=0;i<3;i++){
   if(i)await p.waitForTimeout(5000);
   const shot=await bg.screenshot({path:path.join(out,'background-on-'+i*5+'s.png')});
   samples.push(PNG.sync.read(shot).data);
  }
  const d5=difference(samples[0],samples[1]),d10=difference(samples[1],samples[2]);
  assert(d5.count>20&&d10.count>20,'Highlights are not visibly alive');
  assert.equal(await bg.getAttribute('data-analysis-count'),'1','Backdrop reanalysed');
  results.background={highlights:Number(await bg.getAttribute('data-highlight-count')),analysisCount:1,effectsOffExact:true,changedChannelsAt5s:d5.count,changedChannelsAt10s:d10.count};
  await figure.evaluate(e=>e.style.visibility='');
  for(const mood of ['Listening','Thinking','Speaking','Idle']){await p.getByRole('button',{name:mood,exact:true}).click();await p.getByText('MOOD · '+mood.toUpperCase(),{exact:false}).waitFor();}
  await p.getByRole('button',{name:'Assembly',exact:true}).click();await p.getByRole('button',{name:'Skip',exact:true}).click();await host.waitFor();
  await p.getByRole('button',{name:'Assembly',exact:true}).click();await p.getByText('ASSEMBLY · COMPLETE',{exact:true}).waitFor({timeout:20000});
  await p.getByRole('button',{name:'Replay Assembly',exact:true}).click();await p.getByRole('button',{name:'Skip',exact:true}).click();
  const reduced=await b.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await reduced.goto(url,{waitUntil:'networkidle'});const rh=reduced.getByLabel('N7 guide artwork-tile humanoid',{exact:true});await rh.locator('canvas:visible').waitFor();
  await reduced.mouse.move(1100,200);await reduced.waitForTimeout(500);
  assert.equal(Number(await rh.getAttribute('data-current-turn')),0,'Reduced-motion head animated');
  assert.equal(await reduced.getByLabel('N7 Step 6 living backdrop',{exact:true}).getAttribute('data-effects'),'off');
  results.reducedMotion=true;
  // Actual same-origin API auth outcome is recorded, never confused with a chat success.
  const status=await p.request.get(new URL('/api/status',url).href);results.chatAccess={http:status.status(),body:(await status.text()).slice(0,500)};
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
