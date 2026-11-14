// Real browser, real WebGL pixels. Verifies the jointed neck/skull rig:
// smooth non-overshooting return, state postures, still Idle head, no features added.
const {chromium}=require('playwright-core');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const url=process.env.N7_VISUAL_URL||'http://127.0.0.1:4173/n7-apex-step5/';
const out=process.env.N7_JOINTS_OUT||'/tmp/n7-head-joints';fs.mkdirSync(out,{recursive:true});
const LABEL='[aria-label="N7 guide artwork-tile humanoid"]';
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/chromium',
  ...(process.env.N7_BROWSER_PROXY?{proxy:{server:process.env.N7_BROWSER_PROXY}}:{}),
  args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const p=await b.newPage({viewport:{width:1440,height:900},deviceScaleFactor:Number(process.env.N7_JOINTS_SCALE||1)}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  p.on('console',m=>{if(m.type()==='error'&&m.text().includes('THREE.WebGLProgram'))errors.push(m.text());});
  await p.goto(url,{waitUntil:'networkidle'});
  const host=p.getByLabel('N7 guide artwork-tile humanoid',{exact:true});
  await host.locator('canvas:visible').waitFor();
  await p.waitForFunction(l=>document.querySelector(l)?.dataset.rig==='n7-neck-skull-joints-v3',LABEL);
  const skip=p.getByRole('button',{name:'Skip',exact:true});if(await skip.isVisible())await skip.click();
  const r=await host.boundingBox(),cx=r.x+r.width/2,cy=r.y+r.height/2;
  const clip={x:r.x,y:r.y,width:r.width,height:r.height*.62};
  const shot=name=>p.screenshot({path:path.join(out,name+'.png'),clip});
  const data=()=>host.evaluate(h=>({turn:+h.dataset.currentTurn,pitch:+h.dataset.currentPitch,yaw:+h.dataset.poseYaw,nod:+h.dataset.posePitch,roll:+h.dataset.poseRoll,breath:+h.dataset.breath}));
  const result={url,poses:{},states:{},errors};

  // Idle is guide-exact: chest breathing only, head joints at rest.
  await p.mouse.move(cx,cy);await p.waitForTimeout(2600);
  const idle=await data();
  assert.deepEqual([idle.yaw,idle.nod,idle.roll],[0,0,0],'Idle head is not at rest: '+JSON.stringify(idle));
  assert.notEqual(idle.breath,0,'Breathing is not running in Idle');
  result.idle=idle;await shot('front');

  // Pointer poses, each from the front view.
  for(const [name,tx,ty] of [['right',1,0],['left',-1,0],['up',0,1],['down',0,-1],['up-right',1,1],['down-left',-1,-1]]){
   await p.mouse.move(cx+tx*r.width*.42,cy-ty*r.height*.42,{steps:4});
   await p.waitForFunction(({l,tx,ty})=>{const h=document.querySelector(l);return Math.abs(+h.dataset.currentTurn-tx)<.003&&Math.abs(+h.dataset.currentPitch-ty)<.003;},{l:LABEL,tx,ty});
   result.poses[name]=await data();await shot(name);
  }

  // Smooth return: sampled every frame, the joint eases home without overshoot.
  await p.mouse.move(cx+r.width*.42,cy,{steps:4});
  await p.waitForFunction(l=>Math.abs(+document.querySelector(l).dataset.currentTurn-1)<.003,LABEL);
  const back=await host.evaluate(async h=>{
   const r=h.getBoundingClientRect(),rows=[];
   window.dispatchEvent(new PointerEvent('pointermove',{clientX:r.left+r.width/2,clientY:r.top+r.height/2}));
   const start=performance.now();
   while(performance.now()-start<2500){await new Promise(requestAnimationFrame);rows.push({t:performance.now()-start,turn:+h.dataset.currentTurn});if(rows.at(-1).turn===0)break;}
   return rows;
  });
  assert.equal(back.at(-1).turn,0,'Head did not return to its exact rest pose');
  assert(back.every(f=>f.turn>=0),'Return overshot past the rest pose');
  assert(back.every((f,i)=>!i||f.turn<=back[i-1].turn+1e-6),'Return was not monotonic');
  assert(back.length>=8,'Return snapped instead of easing: '+back.length+' frames');
  const half=back.find(f=>f.turn<=.5);
  assert(half&&half.t>60&&half.t<900,'Return timing is not natural: '+JSON.stringify(half));
  result.return={frames:back.length,halfwayMs:half.t,settledMs:back.at(-1).t,overshoot:false,monotonic:true};

  // State postures use the same joints. No pointer steering during them.
  await p.mouse.move(cx,cy);
  for(const mood of ['Listening','Thinking','Speaking']){
   await p.getByRole('button',{name:mood,exact:true}).click();
   await p.getByText('MOOD · '+mood.toUpperCase(),{exact:false}).waitFor();
   await p.waitForTimeout(3200);
   const d=await data();result.states[mood.toLowerCase()]=d;await shot('state-'+mood.toLowerCase());
   assert(Math.abs(d.yaw)+Math.abs(d.nod)+Math.abs(d.roll)>.02,mood+' has no head posture: '+JSON.stringify(d));
   assert.equal(d.turn,0,mood+' moved the pointer-following value');
  }
  assert(result.states.listening.roll>.3,'Listening does not tilt the head');
  assert(result.states.thinking.yaw>.15&&result.states.thinking.nod>.15,'Thinking does not look up and aside');
  await p.getByRole('button',{name:'Idle',exact:true}).click();
  await p.waitForFunction(l=>{const h=document.querySelector(l);return +h.dataset.poseYaw===0&&+h.dataset.posePitch===0&&+h.dataset.poseRoll===0;},LABEL,{timeout:4000});
  result.states.idleReturn=await data();

  // The gestures switch is independent of Breathing and restores a still head.
  await p.getByRole('button',{name:'Technical details',exact:true}).click();
  await p.getByLabel('Head gestures',{exact:true}).uncheck();
  await p.getByRole('button',{name:'Thinking',exact:true}).click();await p.waitForTimeout(1500);
  const off=await data();assert.deepEqual([off.yaw,off.nod,off.roll],[0,0,0],'Head gestures Off still moves the head');
  result.gesturesOff=off;
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
