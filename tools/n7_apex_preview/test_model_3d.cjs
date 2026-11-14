// Real browser, real WebGL. The /model-3d/ page: the owner's 3D model adapted
// to the approved N7 (fitted outline, approved picture on the front), whole-head
// turn and nod through the added neck/skull rig, the approved mood pictures,
// the raw model for comparison, the N7 workspace, and an untouched Humanoid.
const {chromium}=require('playwright-core');const {PNG}=require('pngjs');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const base=(process.env.N7_VISUAL_URL||'http://127.0.0.1:4173/n7-apex-step5-visual/').replace(/\/$/,'');
const out=process.env.N7_MODEL_OUT||'/tmp/n7-model-3d';fs.mkdirSync(out,{recursive:true});
const FIT='[aria-label="N7 3D προσαρμοσμένο"]',RAW='[aria-label="N7 μοντέλο 3D (δοκιμή)"]';
(async()=>{const b=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/chromium',...(process.env.N7_BROWSER_PROXY?{proxy:{server:process.env.N7_BROWSER_PROXY}}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{const p=await b.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  p.on('console',m=>{if(m.type()==='error'&&/WebGL|THREE|shader/i.test(m.text()))errors.push(m.text());});
  const t0=Date.now();await p.goto(base+'/model-3d/',{waitUntil:'domcontentloaded'});
  await p.waitForFunction(s=>document.querySelector(s)?.dataset.ready==='true',FIT,{timeout:120000});
  const v=p.locator(FIT),ds=await v.evaluate(e=>({...e.dataset}));const result={url:base+'/model-3d/',readyMs:Date.now()-t0,model:ds,errors};
  assert.equal(ds.rig,'added-chest-neck-skull');assert.equal(ds.style,'approved-front-profile-back');
  const grab=async()=>PNG.sync.read(Buffer.from((await v.evaluate(h=>h.querySelector('canvas').toDataURL())).split(',')[1],'base64'));
  const frac=(a,z,y0,y1)=>{let d=0,n=0;for(let y=Math.floor(a.height*y0);y<Math.floor(a.height*y1);y++)for(let x=0;x<a.width;x++){const i=(y*a.width+x)*4;n++;if(Math.abs(a.data[i]-z.data[i])+Math.abs(a.data[i+1]-z.data[i+1])+Math.abs(a.data[i+2]-z.data[i+2])>30)d++;}return d/n;};
  const box=await v.boundingBox();
  const aim=async(tx,ty)=>{await p.mouse.move(box.x+box.width/2+tx*box.width*.4,box.y+box.height*.30-ty*box.height*.3,{steps:4});await p.waitForTimeout(2600);return {yaw:+(await v.getAttribute('data-head-yaw')),pitch:+(await v.getAttribute('data-head-pitch'))};};
  await aim(0,0);const rest=await grab();
  const right=await aim(1,0);const turned=await grab();const down=await aim(0,-1);const up=await aim(0,1);await aim(0,0);
  assert(right.yaw>.4,'Head did not turn: '+JSON.stringify(right));assert(down.pitch>.15&&up.pitch<-.15,'Head did not nod: '+JSON.stringify({down,up}));
  const head=frac(rest,turned,.03,.42),shoulders=frac(rest,turned,.75,.92);
  assert(head>.05,'Turn not visible in head region: '+head);assert(shoulders<head*.2,'Shoulders moved with the head: '+JSON.stringify({head,shoulders}));
  result.head={right,down,up,changedHeadBand:+head.toFixed(4),changedShoulderBand:+shoulders.toFixed(4)};
  // Front view matches the approved picture's colour: gold chest light present, cyan lines present.
  const colour=png=>{let cyan=0,gold=0;for(let i=0;i<png.data.length;i+=4){const r=png.data[i],g=png.data[i+1],bl=png.data[i+2];if(bl>120&&g>90&&bl>r*1.4)cyan++;if(r>150&&g>80&&r>bl*1.6)gold++;}return {cyan,gold};};
  result.front=colour(rest);assert(result.front.cyan>2000&&result.front.gold>50,'Front does not show the N7 cyan/gold artwork: '+JSON.stringify(result.front));
  await p.screenshot({path:path.join(out,'front.png')});
  for(const [label,name] of [['3/4','three-quarter'],['Προφίλ 90°','profile'],['Πίσω 180°','back'],['Μπροστά','front-again']]){await p.getByRole('button',{name:label,exact:true}).click();await p.waitForTimeout(3000);await p.screenshot({path:path.join(out,'view-'+name+'.png')});}
  result.moods={};
  for(const m of ['Listening','Thinking','Speaking','Idle']){await p.getByRole('button',{name:m,exact:true}).click();await p.waitForTimeout(1500);assert.equal(await v.getAttribute('data-mood'),m.toLowerCase());result.moods[m]=colour(await grab());await p.screenshot({path:path.join(out,'mood-'+m.toLowerCase()+'.png')});}
  assert(result.moods.Thinking.gold>result.moods.Idle.gold*1.5,'Thinking picture not shown');
  await p.getByRole('button',{name:'Αρχικό μοντέλο',exact:true}).click();await p.waitForFunction(s=>document.querySelector(s)?.dataset.ready==='true',RAW,{timeout:120000});await p.waitForTimeout(1500);await p.screenshot({path:path.join(out,'raw.png')});
  await p.getByRole('button',{name:'N7 σε 3D',exact:true}).click();await p.waitForFunction(s=>document.querySelector(s)?.dataset.ready==='true',FIT,{timeout:120000});
  await p.getByRole('button',{name:'Σύγκριση με σημερινό N7',exact:true}).click();await p.getByRole('img',{name:'Σημερινό εγκεκριμένο N7'}).waitFor();await p.waitForTimeout(1500);await p.screenshot({path:path.join(out,'compare.png')});
  await p.locator('[aria-controls="n7-workspace"]').click();await p.getByLabel('N7 workspace',{exact:true}).waitFor();result.workspace=true;
  const h=await b.newPage({viewport:{width:1440,height:900}});const requested=[];h.on('request',r=>{if(r.url().includes('n7-model-'))requested.push(r.url());});
  await h.goto(base+'/',{waitUntil:'networkidle'});await h.waitForFunction(()=>document.querySelector('[aria-label="N7 guide artwork-tile humanoid"]')?.dataset.rig==='n7-neck-skull-joints-v3');
  assert.deepEqual(requested,[],'Humanoid page loaded a test model');result.humanoidUntouched=true;
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
