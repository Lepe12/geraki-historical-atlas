'use strict';
// N7_SPLIT_MAP_V1 browser test: «Δείξε μου την Κέρκυρα» -> N7 rises into a strip, the real NABOU atlas
// (atlas checkout, real data.json, real MapLibre 4.7.1) opens below in an iframe and the camera flies to
// the data.json record. Real assembled N7 runtime with a loopback model fixture. No network is used:
// MapLibre is served from the npm package; base tiles are replaced by a local Natural Earth land layer
// (world-atlas), a TEST FIXTURE only — the live atlas keeps its own tiles.
// Env: N7_ATLAS_DIR (atlas checkout), N7_MAPLIBRE_DIR (node_modules with maplibre-gl@4.7.1, world-atlas,
// topojson-client), optional N7_SCREENSHOT_DIR, N7_RUNTIME_PATH.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..');
const runtime=path.resolve(process.env.N7_RUNTIME_PATH||path.join(ROOT,'.n7-runtime'));
const atlasDir=process.env.N7_ATLAS_DIR,libs=process.env.N7_MAPLIBRE_DIR,shots=process.env.N7_SCREENSHOT_DIR;
if(shots)fs.mkdirSync(shots,{recursive:true});
if(!atlasDir||!libs)throw Error('N7_ATLAS_DIR and N7_MAPLIBRE_DIR are required');
const BOT='https://bot.piratecartography.com',ATLAS='https://lepe12.github.io';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'};
const results=[];const record=(id,name,status,detail)=>{results.push({id,name,status,detail});console.log(status.padEnd(7),id,name,'—',detail);};
const data=JSON.parse(fs.readFileSync(path.join(atlasDir,'data.json'),'utf8'));
const corfu=data.places.find(p=>p.id==='rec1ocg1Hina4wpFp');

function fixtureStyle(){
 // Same structure the atlas restyles on the real base map: background = land, a "water" fill = sea.
 const topo=require(path.join(libs,'topojson-client'));
 const land=topo.feature(require(path.join(libs,'world-atlas/land-10m.json')),'land');
 const sea={type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[-30,20],[60,20],[60,60],[-30,60],[-30,20]]]}};
 return {version:8,name:'TEST FIXTURE — Natural Earth land 1:10m (world-atlas)',sources:{sea:{type:'geojson',data:sea},land:{type:'geojson',data:land}},
  layers:[{id:'background',type:'background',paint:{'background-color':'#c8aa70'}},
   {id:'water',type:'fill',source:'sea',paint:{'fill-color':'#4f7f88'}},
   {id:'landmass',type:'fill',source:'land',paint:{'fill-color':'#c8aa70','fill-outline-color':'#7b6140'}}]};
}
// Fonts, icons and Tailwind for the atlas page, from npm packages (test fixtures; production uses the CDNs).
function fixtureAsset(url){
 const nm=libs;
 if(url.host==='cdn.tailwindcss.com'){const css=fs.readFileSync(path.join(nm,'tw-atlas.css'),'utf8');
  return {contentType:'text/javascript',body:'(()=>{const s=document.createElement("style");s.textContent='+JSON.stringify(css)+';document.head.prepend(s);})();'};}
 if(url.host==='cdnjs.cloudflare.com'&&url.pathname.startsWith('/ajax/libs/font-awesome/6.4.0/')){
  const rel=url.pathname.slice('/ajax/libs/font-awesome/6.4.0/'.length),file=path.join(nm,'@fortawesome/fontawesome-free',rel);
  if(fs.existsSync(file))return {contentType:rel.endsWith('.css')?'text/css':'font/woff2',body:fs.readFileSync(file)};}
 if(url.host==='fonts.googleapis.com'){
  const face=(fam,pkg,file,w,st='normal')=>`@font-face{font-family:'${fam}';font-style:${st};font-weight:${w};src:url(https://fonts.gstatic.com/fixture/${pkg}/${file}) format('woff2')}`;
  return {contentType:'text/css',body:[face('Cinzel','cinzel','cinzel-latin-500-normal.woff2',500),face('Cinzel','cinzel','cinzel-latin-700-normal.woff2','700 900'),
   face('IM Fell English','im-fell-english','im-fell-english-latin-400-normal.woff2',400),face('IM Fell English','im-fell-english','im-fell-english-latin-400-italic.woff2',400,'italic'),
   face('Plus Jakarta Sans','plus-jakarta-sans','plus-jakarta-sans-latin-400-normal.woff2','300 700')].join('\n')};}
 if(url.host==='fonts.gstatic.com'&&url.pathname.startsWith('/fixture/')){const [,,pkg,file]=url.pathname.split('/');
  const f=path.join(nm,'@fontsource',pkg,'files',path.basename(file));if(fs.existsSync(f))return {contentType:'font/woff2',body:fs.readFileSync(f)};}
 return null;
}

(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'n7-split-'));let child,logs='';
 const prompts=[];
 const provider=http.createServer(async(req,res)=>{let t='';for await(const c of req)t+=c;const r=JSON.parse(t);
  const all=JSON.stringify(r.messages||[]);prompts.push(all);
  const m=all.match(/Πλαίσιο από τον χάρτη NABOU[^{]*(\{[^}]*\})/);
  let answer='Γεια σου. Είμαι ο N7 (απάντηση δοκιμαστικού μοντέλου).';
  if(m){const c=JSON.parse(JSON.parse('"'+m[1]+'"'));answer='[Δοκιμαστικό μοντέλο] '+c.place+' ('+c.historicalNames+'): το σημείο στον χάρτη είναι '+c.coordinateStatus+'. Πηγή: εγγραφή NABOU (data.json).';}
  if(r.stream){res.writeHead(200,{'Content-Type':'text/event-stream'});return res.end('data: '+JSON.stringify({choices:[{delta:{content:answer},finish_reason:null}]})+'\n\ndata: [DONE]\n\n');}
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:answer},finish_reason:'stop'}]}));});
 await new Promise(r=>provider.listen(0,'127.0.0.1',r));
 const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const env={...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:tmp,COOKIE_SECURE:'0',BOT_PASSWORD:'local-split-test',
  SESSION_SECRET:'test-only-session-secret-'.repeat(3),LLM_BASE_URL:'http://127.0.0.1:'+provider.address().port+'/v1',LLM_API_KEY:'fixture-not-a-key',LLM_MODEL:'fixture'};
 delete env.HTTPS_PROXY;delete env.https_proxy;delete env.NODE_USE_ENV_PROXY;
 child=spawn(process.execPath,[path.join(runtime,'server.js')],{cwd:runtime,env});
 child.stdout.on('data',b=>logs=(logs+b).slice(-6000));child.stderr.on('data',b=>logs=(logs+b).slice(-6000));
 const base='http://127.0.0.1:'+port;
 for(let i=0;i<120;i++){try{if((await fetch(base+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
 const style=JSON.stringify(fixtureStyle());
 const viaRuntime=(req,url)=>new Promise((resolve,reject)=>{
  const r=http.request({host:'127.0.0.1',port,method:req.method(),path:url.pathname+url.search,headers:{...req.headers(),host:'bot.piratecartography.com'}},x=>{const ch=[];x.on('data',c=>ch.push(c));
   x.on('end',()=>{const h={};for(const [k,v] of Object.entries(x.headers))h[k]=Array.isArray(v)?v.join('\n'):String(v);resolve({status:x.statusCode,headers:h,body:Buffer.concat(ch)});});});
  r.on('error',reject);const b=req.postDataBuffer();if(b)r.write(b);r.end();});
 const browser=await chromium.launch();
 const external=new Set();
 async function newContext(viewport){
  const context=await browser.newContext({viewport,locale:'el-GR'});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin===BOT)return route.fulfill(await viaRuntime(req,url));
   if(url.origin===ATLAS&&url.pathname.startsWith('/geraki-historical-atlas/')){
    let rel=decodeURIComponent(url.pathname.slice('/geraki-historical-atlas/'.length));if(!rel||rel.endsWith('/'))rel+='index.html';
    // tools/n7 in the atlas is the generated distribution of this repository: serve the canonical files.
    const file=rel.startsWith('tools/n7/')&&fs.existsSync(path.join(ROOT,rel))?path.join(ROOT,rel):path.join(atlasDir,rel);
    if(!fs.existsSync(file)||fs.statSync(file).isDirectory())return route.fulfill({status:404,body:'not found'});
    return route.fulfill({status:200,contentType:MIME[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
   }
   if(url.host==='unpkg.com'&&url.pathname.startsWith('/maplibre-gl@4.7.1/dist/')){
    const file=path.join(libs,'maplibre-gl/dist',path.basename(url.pathname));
    return route.fulfill({status:200,contentType:MIME[path.extname(file)]||'text/plain',body:fs.readFileSync(file)});
   }
   if(url.host==='tiles.openfreemap.org'&&url.pathname==='/styles/liberty')return route.fulfill({status:200,contentType:'application/json',body:style});
   const fx=fixtureAsset(url);if(fx)return route.fulfill({status:200,...fx});
   external.add(url.host);return route.abort(); // hermetic: no other host is reached
  });
  return context;
 }
 const context=await newContext({width:1440,height:900});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const shot=async(name,p=page)=>{if(shots){fs.mkdirSync(shots,{recursive:true});await p.screenshot({path:path.join(shots,name)});}};
 const frame=()=>page.frames().find(f=>f.url().startsWith(ATLAS));
 const camera=async()=>frame().evaluate(()=>window.NABOU_MAP.camera());
 const runCmd=async(text)=>{await page.fill('#n7StageInput',text);await page.click('#n7StageSend');
  await page.waitForFunction(()=>!document.getElementById('n7StageSend').disabled,null,{timeout:60000});return (await page.textContent('#n7StageReply')).trim();};
 try{
  await page.goto(BOT+'/');await page.waitForSelector('#login:not(.hidden) #loginform input[name=password]');
  await page.fill('#loginform input[name=password]','local-split-test');await page.press('#loginform input[name=password]','Enter');
  await page.waitForSelector('#n7Stage:not([hidden])',{timeout:15000});
  await page.waitForSelector('#n7StageFigure .n7-live-presence canvas');
  // Step 1: N7 full screen with the quick actions on the right.
  const quick=await page.$$eval('.n7-quick-item',b=>b.map(x=>({t:x.querySelector('.n7-quick-label').textContent.trim(),v:x.getBoundingClientRect().width>0})));
  assert.deepEqual(quick.map(q=>q.t),['Αναζήτηση','Ιστορική Έρευνα','Τόποι & Μνημεία','Χάρτες NABOU']);
  assert.ok(quick.every(q=>q.v));
  assert.equal(await page.$eval('#n7Stage',e=>e.dataset.split||'0'),'0');
  await page.waitForTimeout(400);await shot('split-1-n7-full.png');
  record('S1','N7 σε πλήρη οθόνη, μπάρα εντολής, κουμπιά δεξιά','PASS',quick.map(q=>q.t).join(' · '));

  // Step 2-3: «Δείξε μου την Κέρκυρα»
  await page.fill('#n7StageInput','Δείξε μου την Κέρκυρα');await page.click('#n7StageSend');
  await page.waitForSelector('#n7Stage[data-split="1"] #n7MapFrame',{timeout:10000});
  await page.waitForTimeout(350);await shot('split-2-transition.png');
  await page.waitForFunction(()=>!document.getElementById('n7StageSend').disabled,null,{timeout:60000});
  const reply=(await page.textContent('#n7StageReply')).trim();
  const cam=await camera();
  const st=await page.evaluate(()=>JSON.parse(localStorage.getItem('n7-shared-state-v1')).place);
  assert.equal(st.record,corfu.id);
  assert.ok(Math.abs(cam.lng-corfu.lon)<0.01&&Math.abs(cam.lat-corfu.lat)<0.01&&cam.zoom>=7,'camera '+JSON.stringify(cam));
  const title=await page.textContent('#n7MapDockTitle');
  assert.match(title,/κατά προσέγγιση/);
  assert.match(reply,/Corfu/);
  const sent=prompts.at(-1);assert.ok(sent.includes('Corfù / Κέρκυρα')&&!/39\.62|19\.92/.test(sent),'the model gets names and status, never coordinates');
  const layout=await page.evaluate(()=>{const r=id=>document.getElementById(id).getBoundingClientRect();return {fig:r('n7StageFigure'),dock:r('n7MapDock'),reply:r('n7StageReply'),vh:innerHeight};});
  assert.ok(layout.fig.bottom<=layout.dock.top&&layout.dock.height>layout.vh*0.4,'N7 strip above, map below '+JSON.stringify(layout));
  await page.waitForTimeout(600);await shot('split-3-final.png');
  record('S2','«Δείξε μου την Κέρκυρα» → split, zoom στην Κέρκυρα','PASS',`εγγραφή ${corfu.id} (${corfu.coordinateStatus}); κάμερα ${cam.lng.toFixed(4)},${cam.lat.toFixed(4)} z${cam.zoom.toFixed(2)} ≈ data.json ${corfu.lon},${corfu.lat}; καρτέλα «${title}»; απάντηση: «${reply.slice(0,90)}»`);

  // Unknown place: said, not placed; the camera does not move.
  const before=await camera();
  const rm=await runCmd('Δείξε μου τη Μύκονο');
  const after=await camera();
  assert.match(rm,/Δεν βρήκα/);assert.deepEqual(after,before);
  record('S3','Τόπος εκτός data.json δεν τοποθετείται','PASS',rm.slice(0,120));

  // A forged map_focus (wrong nonce) from the N7 page is ignored by the map.
  await page.evaluate(()=>document.getElementById('n7MapFrame').contentWindow.postMessage({schema:'n7-map/v1',nonce:'0'.repeat(32),type:'map_focus',id:crypto.randomUUID(),placeId:'recrEJpLyjJShsKST'},'https://lepe12.github.io'));
  await page.waitForTimeout(1500);
  assert.deepEqual(await camera(),after);
  // The map hook exists only inside the N7 frame: an ordinary visit loads no N7 script.
  const plain=await context.newPage();await plain.goto(ATLAS+'/geraki-historical-atlas/');await plain.waitForTimeout(1500);
  const plainN7=await plain.evaluate(()=>({link:!!window.N7MapProtocol,embed:document.documentElement.classList.contains('n7-embed')}));
  assert.deepEqual(plainN7,{link:false,embed:false});await plain.close();
  record('S4','Ασφάλεια πρωτοκόλλου','PASS','map_focus με λάθος nonce αγνοήθηκε· κανονική επίσκεψη στον άτλαντα χωρίς N7 scripts');

  // Side bar tabs: every value is an existing data.json field; missing fields stay empty.
  const fr=frame();
  const tabText=async id=>{await fr.click('.n7e-tab[data-tab="'+id+'"]');return (await fr.textContent('#n7eBody')).replace(/\s+/g,' ').trim();};
  const tMap=await tabText('map');assert.ok(tMap.includes('Σημείο κατά προσέγγιση')&&tMap.includes(corfu.notes.slice(0,30)),tMap);
  const tHist=await tabText('history');assert.ok(tHist.includes('Δεν υπάρχει καταχωρημένο ιστορικό πλαίσιο')&&tHist.includes(corfu.trilogyRole.slice(0,30)),tHist);
  const tTime=await tabText('timeline');assert.ok(tTime.includes(corfu.period)&&tTime.includes('Book III'),tTime);
  const tSrc=await tabText('sources');assert.match(tSrc,/Δεν υπάρχουν καταχωρημένες πηγές/);
  const tMon=await tabText('monuments');
  const expected=data.places.filter(p=>p.id!==corfu.id&&String(p.modernName).split(',').slice(1).some(x=>x.trim().replace(/\s*\(.*$/,'').toLowerCase()==='corfu')).map(p=>p.place);
  for(const n of expected)assert.ok(tMon.includes(n),n);
  for(const fake of ['Αγγελόκαστρο','Angelokastro','Παλαιό Φρούριο','Old Fortress'])assert.ok(!tMon.includes(fake));
  await shot('split-5-monuments.png');
  const badgeOn=await fr.isVisible('#n7eBadge');assert.ok(badgeOn);
  record('S7','Πλαϊνή μπάρα από πεδία του data.json','PASS',`Χάρτης: ${corfu.coordinateStatus}+notes · Ιστορία: κενό historicalContext δηλώνεται κενό · Χρονολόγιο: «${corfu.period}» · Πηγές: κενό → «Δεν υπάρχουν καταχωρημένες πηγές» · Μνημεία: ${expected.join(', ')||'κανένα'} (καμία προσθήκη) · «Αποτελέσματα από το N7» ορατό`);

  // Close the map; the strip returns to the full N7 view.
  await page.click('#n7MapDockClose');
  assert.equal(await page.$eval('#n7Stage',e=>e.dataset.split),'0');
  record('S5','Κλείσιμο χάρτη','PASS','data-split=0, N7 σε πλήρη οθόνη');

  // Mobile
  const mctx=await newContext({width:390,height:844});const mp=await mctx.newPage();
  await mp.goto(BOT+'/');await mp.waitForSelector('#n7Stage:not([hidden])',{timeout:15000}).catch(async()=>{
   await mp.fill('#loginform input[name=password]','local-split-test');await mp.press('#loginform input[name=password]','Enter');await mp.waitForSelector('#n7Stage:not([hidden])',{timeout:15000});});
  await mp.fill('#n7StageInput','Δείξε μου την Κέρκυρα');await mp.click('#n7StageSend');
  await mp.waitForFunction(()=>!document.getElementById('n7StageSend').disabled,null,{timeout:60000});
  const mob=await mp.evaluate(()=>({sx:document.documentElement.scrollWidth<=innerWidth,dock:document.getElementById('n7MapDock').getBoundingClientRect().height,vh:innerHeight}));
  assert.ok(mob.sx&&mob.dock>mob.vh*0.35,JSON.stringify(mob));
  await mp.waitForTimeout(500);await shot('split-4-mobile.png',mp);await mctx.close();
  record('S6','Κινητό 390×844','PASS',`χάρτης ${Math.round(mob.dock)}px, χωρίς οριζόντια κύλιση`);
  assert.deepEqual(errors.filter(e=>!/Failed to fetch|NetworkError|AJAXError|terrarium/i.test(e)),[]);
 }catch(e){record('SPLIT','Σφάλμα δοκιμής','FAIL',String(e.message).slice(0,600)+' | '+e.stack?.split('\n').slice(1,3).join(' | ')+' | server: '+logs.slice(-300));process.exitCode=1;}
 finally{
  console.log('blocked external hosts:',[...external].sort().join(', ')||'none');
  if(shots)fs.writeFileSync(path.join(shots,'split-results.json'),JSON.stringify(results,null,1));
  await browser.close();child?.kill();provider.close();fs.rmSync(tmp,{recursive:true,force:true});
 }
})();
