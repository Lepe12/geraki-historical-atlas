'use strict';
// N7_APEX_HOME_V1, end to end in a real browser. The assembled N7 runtime (loopback model) answers /api/*; a thin
// front server plays the part Passenger/Apache plays in production: it serves the built /n7-apex/ files from the
// public folder and passes everything else to the N7 server, so the Humanoid and the page share ONE origin.
// Checks: login lands on the APEX Humanoid (no old Humanoid), one greeting per login (button where audio is
// blocked), Humanoid <-> Chat <-> NABOU by button and by command, ONE conversation across the moves (no new one is
// created), the safe entrance when the Humanoid is unavailable, desktop and phone layouts.
// Env: N7_APEX_BUILD (the exported /n7-apex site), N7_RUNTIME_PATH (assembled runtime), CHROME_BIN, N7_SCREENSHOT_DIR.
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
let chromium;try{({chromium}=require('playwright-core'));}catch{({chromium}=require('playwright'));}
const ROOT=path.resolve(__dirname,'../..');
const runtime=path.resolve(process.env.N7_RUNTIME_PATH||path.join(ROOT,'.n7-runtime'));
const build=process.env.N7_APEX_BUILD;if(!build)throw Error('N7_APEX_BUILD (exported /n7-apex site) is required');
const shots=process.env.N7_SCREENSHOT_DIR;
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary','.txt':'text/plain','.woff2':'font/woff2','.map':'application/json'};
const PASSWORD='local-apex-home';
(async()=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'n7-apex-home-'));let child,logs='',browser;
 const model=http.createServer(async(req,res)=>{let t='';for await(const c of req)t+=c;const r=JSON.parse(t);const answer='Γεια σου. Είμαι ο N7 (απάντηση δοκιμαστικού μοντέλου).';
  if(r.stream){res.writeHead(200,{'Content-Type':'text/event-stream'});return res.end('data: '+JSON.stringify({choices:[{delta:{content:answer},finish_reason:null}]})+'\n\ndata: [DONE]\n\n');}
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:answer},finish_reason:'stop'}]}));});
 await new Promise(r=>model.listen(0,'127.0.0.1',r));
 const free=async()=>{const s=http.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;};
 const backendPort=await free();let apexAvailable=true;
 async function startBackend(){
  child=spawn(process.execPath,[path.join(runtime,'server.js')],{cwd:runtime,env:{...process.env,HOST:'127.0.0.1',PORT:String(backendPort),DATA_DIR:data,COOKIE_SECURE:'0',BOT_PASSWORD:PASSWORD,
   SESSION_SECRET:'test-only-session-secret-'.repeat(3),LLM_BASE_URL:'http://127.0.0.1:'+model.address().port+'/v1',LLM_API_KEY:'fixture-not-a-key',LLM_MODEL:'fixture'}});
  child.stdout.on('data',b=>logs=(logs+b).slice(-3000));child.stderr.on('data',b=>logs=(logs+b).slice(-3000));
  for(let i=0;i<120;i++){try{if((await fetch('http://127.0.0.1:'+backendPort+'/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}
  throw Error('server did not start: '+logs);
 }
 // Front server: /n7-apex/* from the exported files (like Passenger's public folder), the rest to the N7 server.
 const front=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://x');
  if(url.pathname.startsWith('/n7-apex/')||url.pathname==='/n7-apex'){
    if(!apexAvailable){res.writeHead(404);return res.end('not found');}
    let rel=decodeURIComponent(url.pathname.slice('/n7-apex/'.length));if(!rel||rel.endsWith('/'))rel+='index.html';
    const file=path.join(build,rel);
    if(!file.startsWith(build)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);return res.end('not found');}
    res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});return fs.createReadStream(file).pipe(res);
  }
  const up=http.request({host:'127.0.0.1',port:backendPort,path:req.url,method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
  up.on('error',()=>{res.writeHead(502);res.end();});req.pipe(up);
 });
 await new Promise(r=>front.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+front.address().port;
 // release marker, as the production deployer writes it
 if(!fs.existsSync(path.join(build,'.n7-apex-release.json')))fs.writeFileSync(path.join(build,'.n7-apex-release.json'),JSON.stringify({product:'N7-APEX-PREVIEW',release:'test',upstream:'test'}));
 const checks=[];const ok=(name,detail)=>{checks.push(name);console.log('PASS',name,detail?('— '+detail):'');};
 const api=async(page,p)=>page.evaluate(async u=>{const r=await fetch(u,{credentials:'same-origin'});return r.json();},p);
 const conversations=async page=>(await api(page,'/api/conversations')).conversations||[];
 const ctxOptions=(extra={})=>({viewport:{width:1366,height:820},...extra});
 // Browser stand-ins: every text sent to the Greek voice worker is recorded (the Piper model is verified in the atlas voice tests).
 // A browser that blocks automatic audio: the AudioContext stays suspended until the visitor clicks.
 const lockAudio=()=>{const Native=window.AudioContext;window.__gesture=false;addEventListener('pointerdown',()=>{window.__gesture=true;},true);
  window.AudioContext=class extends Native{get state(){return window.__gesture?super.state:'suspended';}resume(){return window.__gesture?super.resume():new Promise(()=>{});}};};
 const spy=()=>{window.__voice=[];const Native=window.Worker;window.Worker=class extends Native{constructor(u,o){super(u,o);const p=this.postMessage.bind(this);this.postMessage=(m,t)=>{if(m&&typeof m.text==='string')window.__voice.push(m.text);return p(m,t);};}};};
 async function login(page){
  await page.goto(base+'/');await page.waitForSelector('#login:not(.hidden) #loginform input[name=password]');
  await page.fill('#loginform input[name=password]',PASSWORD);await page.press('#loginform input[name=password]','Enter');
 }
 async function openVoicePanel(page){const toggle=page.getByRole('button',{name:'Φωνητική συνομιλία'});if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();}
 async function sendInHumanoid(page,text){await openVoicePanel(page);await page.fill('textarea[aria-label="Φωνητικό μήνυμα"]',text);await page.getByRole('button',{name:'Αποστολή στη φιγούρα'}).click();}
 try{
  await startBackend();
  browser=await chromium.launch({executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']});

  /* 1. Login lands on the APEX Humanoid; the old Humanoid never appears. */
  const ctx=await browser.newContext(ctxOptions());const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(spy);await page.addInitScript(lockAudio);
  let sawOldStage=false;await page.exposeFunction('__oldStage',()=>{sawOldStage=true;});
  await page.addInitScript(()=>{new MutationObserver(()=>{const s=document.getElementById('n7Stage');if(s&&!s.hidden)window.__oldStage();}).observe(document,{subtree:true,childList:true,attributes:true});});
  await login(page);
  await page.waitForURL(/\/n7-apex\/$/,{timeout:30000});
  await page.waitForSelector('.n7-guide-view',{timeout:30000});
  assert.equal(sawOldStage,false,'the old stage must never be shown on the way to the Humanoid');
  assert.equal(await page.locator('#n7Stage').count(),0,'the old stage is not even on the Humanoid page');
  ok('login lands on the APEX Humanoid in full screen');
  const box=await page.locator('.n7-guide-view').boundingBox();assert.ok(box.width>=1360&&box.height>=815,'full screen: '+JSON.stringify(box));
  assert.ok(await page.locator('.n7-guide-figure').isVisible(),'the figure is present');
  await page.waitForFunction(()=>/COMPLETE|MOOD/.test(document.querySelector('.n7-guide-status')?.textContent||''),null,{timeout:90000});await page.waitForTimeout(1500);
  if(shots)await page.screenshot({path:path.join(shots,'1-humanoid-desktop.png')});

  /* 2. Greeting: audio blocked -> visible button; click -> Greek greeting once; never again in this login. */
  await page.waitForSelector('[data-n7-start]',{timeout:15000});
  assert.equal(await page.evaluate(()=>window.__voice.length),0,'nothing is spoken before the visitor allows audio');
  assert.match(await page.locator('[aria-label="Καλωσόρισμα N7"]').innerText(),/Καλώς ήρθες\. Είμαι η N7\. Πώς μπορώ να σε βοηθήσω σήμερα;/);
  await page.click('[data-n7-start]');
  await page.waitForFunction(()=>window.__voice.length>0,null,{timeout:15000});
  assert.equal((await page.evaluate(()=>window.__voice))[0],'Καλώς ήρθες. Είμαι η N7.','the first piece of the approved sentence goes to the female voice');
  assert.equal(await page.locator('[data-n7-start]').count(),0,'the button is gone once used');
  ok('greeting: button where audio is blocked, then the approved Greek sentence is sent to the female voice');

  /* 3. One conversation: a message from the Humanoid creates exactly one, and the shared state names it. */
  assert.equal((await conversations(page)).length,0,'no conversation exists before the first message');
  await sendInHumanoid(page,'Γεια σου N7, πες μου μια φράση για τον έλεγχο.');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('n7-shared-state-v1')||'{}').conversationId,null,{timeout:30000});
  await page.waitForFunction(()=>/απάντηση δοκιμαστικού μοντέλου/.test(document.body.innerText),null,{timeout:30000});
  let list=await conversations(page);assert.equal(list.length,1,'exactly one conversation after the first message');
  const sharedId=await page.evaluate(()=>JSON.parse(localStorage.getItem('n7-shared-state-v1')).conversationId);
  assert.equal(sharedId,list[0].id,'the shared state names the conversation the Humanoid used');
  ok('Humanoid message creates one conversation and records it for the other screens',sharedId);

  /* 4. Command -> Chat (typed text takes the same path as dictation): same conversation, with its history. */
  await sendInHumanoid(page,'N7, άνοιξε το Chat.');
  await page.waitForURL(/\/\?view=chat$/,{timeout:20000});
  await page.waitForSelector('#application:not(.hidden)',{timeout:20000});
  await page.waitForFunction(()=>/Γεια σου N7, πες μου μια φράση/.test(document.body.innerText)&&/απάντηση δοκιμαστικού μοντέλου/.test(document.body.innerText),null,{timeout:30000});
  assert.equal((await conversations(page)).length,1,'moving to the Chat creates no conversation');
  assert.equal(await page.evaluate(()=>{const s=document.getElementById('n7Stage');return !s||s.hidden;}),true,'the Chat view shows no stage and no old Humanoid');
  assert.ok(await page.locator('.n7-home-nav button[data-nav="humanoid"]').isVisible());
  ok('"άνοιξε το Chat" opens the written Chat with the same conversation and its history');
  if(shots)await page.screenshot({path:path.join(shots,'2-chat-desktop.png')});

  /* 5. Chat -> Humanoid by button; the Humanoid reopens the SAME conversation, no second greeting, no new conversation. */
  const spokenBefore=0;await page.click('.n7-home-nav button[data-nav="humanoid"]');
  await page.waitForURL(/\/n7-apex\/$/,{timeout:20000});await page.waitForSelector('.n7-guide-view',{timeout:30000});
  await page.waitForTimeout(1500);
  assert.equal(await page.locator('[data-n7-start]').count(),0,'no second greeting after returning from the Chat');
  assert.equal((await page.evaluate(()=>window.__voice.filter(t=>/Καλώς ήρθες/.test(t)).length)),0,'nothing greets again on this page load');
  await sendInHumanoid(page,'Δεύτερο μήνυμα στην ίδια συνομιλία.');
  // The Humanoid shows only the last answer; the conversation itself is read from the server.
  await page.waitForFunction(async()=>{const l=(await (await fetch('/api/conversations',{credentials:'same-origin'})).json()).conversations||[];if(!l[0])return false;const c=(await (await fetch('/api/conversations/'+l[0].id,{credentials:'same-origin'})).json()).conversation;return c.messages.filter(m=>m.role==='assistant').length>=2;},null,{timeout:40000,polling:700});
  list=await conversations(page);assert.equal(list.length,1,'still exactly one conversation after returning');
  const full=await api(page,'/api/conversations/'+list[0].id);
  assert.equal(full.conversation.messages.filter(m=>m.role==='user').length,2,'both user messages live in the one conversation');
  ok('Chat -> Humanoid keeps the same conversation (2 user messages, 1 conversation), no new greeting');
  void spokenBefore;

  /* 6. Chat composer: «επέστρεψε στο ολόγραμμα» is a move, not a question. */
  await page.goto(base+'/?view=chat');await page.waitForSelector('#application:not(.hidden)');
  const countBefore=(await api(page,'/api/conversations/'+list[0].id)).conversation.messages.length;
  await page.fill('#message','N7, επέστρεψε στο ολόγραμμα.');await page.press('#message','Enter');
  await page.waitForURL(/\/n7-apex\/$/,{timeout:20000});await page.waitForSelector('.n7-guide-view',{timeout:30000});
  assert.equal((await api(page,'/api/conversations/'+list[0].id)).conversation.messages.length,countBefore,'the command was not sent to the model');
  ok('"επέστρεψε στο ολόγραμμα" typed in the Chat returns to the Humanoid and is not sent to the model');

  /* 7. Button -> NABOU: the existing workspace opens without the old figure; honest while the map is unconfirmed. */
  await page.click('.n7-guide-view button[data-nav="nabou"]');
  await page.waitForURL(/\/\?view=nabou$/,{timeout:20000});
  await page.waitForSelector('#n7Stage:not([hidden])',{timeout:20000});
  await page.waitForSelector('#n7MapFrame',{timeout:15000});
  assert.equal(await page.locator('.n7-stage-figure').isVisible(),false,'the old figure is hidden: there is no second Humanoid');
  assert.match(await page.locator('#n7MapFrame').getAttribute('src'),/^https:\/\/lepe12\.github\.io\/geraki-historical-atlas\//,'the real NABOU atlas is loaded');
  const dockBox=await page.locator('#n7MapDock').boundingBox();console.log('dock box',JSON.stringify(dockBox));assert.ok(dockBox.height>=820*0.5,'the NABOU workspace uses the screen, not a small strip: '+JSON.stringify(dockBox));
  assert.equal((await conversations(page)).length,1,'moving to NABOU creates no conversation');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('n7-shared-state-v1')).conversationId),list[0].id,'the conversation is kept');
  ok('button "NABOU" opens the NABOU workspace, hides the old figure and keeps the conversation');
  if(shots)await page.screenshot({path:path.join(shots,'3-nabou-desktop.png')});
  // return to the Humanoid
  await page.click('.n7-home-nav button[data-nav="humanoid"]');await page.waitForURL(/\/n7-apex\/$/);await page.waitForSelector('.n7-guide-view',{timeout:30000});
  ok('NABOU -> Humanoid');

  /* 8. Command -> NABOU from the Humanoid. */
  await sendInHumanoid(page,'N7, άνοιξε τον ιστορικό χάρτη.');
  await page.waitForURL(/\/\?view=nabou$/,{timeout:20000});await page.waitForSelector('#n7MapFrame',{timeout:15000});
  assert.equal((await conversations(page)).length,1);
  ok('"άνοιξε τον ιστορικό χάρτη" opens NABOU');

  /* 8b. Library and Agents: a command opens the existing library, and the status of the agents is read from the real report. */
  await page.goto(base+'/n7-apex/');await page.waitForSelector('.n7-guide-view',{timeout:30000});
  await sendInHumanoid(page,'Άνοιξε τη βιβλιοθήκη');
  await page.waitForURL(/\/\?view=library$/,{timeout:20000});
  await page.waitForSelector('dialog[open] [aria-label="Κλείσιμο βιβλιοθήκης"]',{timeout:20000});
  assert.equal((await conversations(page)).length,1,'opening the library creates no conversation');
  ok('"άνοιξε τη βιβλιοθήκη" opens the existing library');
  await page.goto(base+'/n7-apex/');await page.waitForSelector('.n7-guide-view',{timeout:30000});
  const beforeAgents=(await api(page,'/api/conversations/'+list[0].id)).conversation.messages.length;
  await sendInHumanoid(page,'Δείξε μου την κατάσταση των Agents');
  const agentTable=page.getByRole('table',{name:'Κατάσταση agents'});
  await agentTable.waitFor({timeout:20000});
  const real=await api(page,'/api/agents');
  assert.match(await agentTable.locator('caption').innerText(),new RegExp('^Ρυθμισμένοι '+real.summary.ready+' από '+real.summary.total));
  assert.equal(await agentTable.locator('tbody tr').count(),real.summary.total);
  assert.equal((await api(page,'/api/conversations/'+list[0].id)).conversation.messages.length,beforeAgents,'the status question was not sent to the model');
  ok('"κατάσταση των Agents" is answered from the real /api/agents report, not from the model',real.summary.ready+'/'+real.summary.total);
  await page.goto(base+'/?view=agents');await page.waitForSelector('#application:not(.hidden)');
  ok('"άνοιξε τους agents" view loads the existing task view');

  /* 9. Logout ends the login: the next login greets again. */
  await page.evaluate(()=>{try{sessionStorage.setItem('n7-apex-greeted-v1','1');}catch{}});
  await page.goto(base+'/?view=chat');await page.waitForSelector('#application:not(.hidden)');
  await page.click('#logout');await page.waitForSelector('#login:not(.hidden)');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('n7-apex-greeted-v1')),null,'logout clears the greeting flag');
  ok('logout clears the greeting flag, so the next login greets once more');
  assert.deepEqual(errors.filter(e=>!/Failed to fetch|ERR_|importScripts/.test(e)) /* the Piper model files are not part of this harness; the voice itself is tested in the atlas voice tests */,[],'no page errors: '+JSON.stringify(errors));
  await ctx.close();

  /* 10. Where audio is allowed, the greeting plays by itself, once per login. */
  const auto=await browser.newContext(ctxOptions());const pa=await auto.newPage();await pa.addInitScript(spy);
  await login(pa);await pa.waitForURL(/\/n7-apex\/$/,{timeout:30000});await pa.waitForSelector('.n7-guide-view',{timeout:30000});
  await pa.waitForFunction(()=>window.__voice.some(t=>/Καλώς ήρθες/.test(t)),null,{timeout:30000});
  await pa.waitForTimeout(1200);
  assert.equal(await pa.evaluate(()=>window.__voice.filter(t=>/Καλώς ήρθες/.test(t)).length),1,'greeted exactly once');
  assert.equal(await pa.locator('[data-n7-start]').count(),0,'no button when audio is allowed');
  await pa.goto(base+'/?view=chat');await pa.waitForSelector('#application:not(.hidden)');await pa.click('.n7-home-nav button[data-nav="humanoid"]');
  await pa.waitForURL(/\/n7-apex\/$/);await pa.waitForSelector('.n7-guide-view',{timeout:30000});await pa.waitForTimeout(1500);
  assert.equal(await pa.evaluate(()=>window.__voice.filter(t=>/Καλώς ήρθες/.test(t)).length),0,'a return from the Chat is not greeted again');
  ok('greeting plays automatically where audio is allowed, once per login');
  await auto.close();

  /* 11. Phone layout. */
  const phone=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});const mp=await phone.newPage();await mp.addInitScript(spy);
  await login(mp);await mp.waitForURL(/\/n7-apex\/$/,{timeout:30000});await mp.waitForSelector('.n7-guide-view',{timeout:30000});
  for(const sel of ['.n7-guide-view button[data-nav="chat"]','.n7-guide-view button[data-nav="nabou"]','.n7-guide-view button[data-exit]']){
   const b=await mp.locator(sel).boundingBox();assert.ok(b&&b.x>=0&&b.x+b.width<=390&&b.y>=0&&b.y+b.height<=844,'phone: control inside the screen '+sel+JSON.stringify(b));
  }
  assert.equal(await mp.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'phone: no horizontal scroll');
  await mp.waitForFunction(()=>/COMPLETE|MOOD/.test(document.querySelector('.n7-guide-status')?.textContent||''),null,{timeout:90000});await mp.waitForTimeout(1500);
  if(shots)await mp.screenshot({path:path.join(shots,'4-humanoid-phone.png')});
  await mp.goto(base+'/?view=chat');await mp.waitForSelector('#application:not(.hidden)');
  const nav=await mp.locator('.n7-home-nav').boundingBox();assert.ok(nav&&nav.x>=0&&nav.x+nav.width<=390&&nav.y+nav.height<=844,'phone: navigation strip inside the screen');
  if(shots)await mp.screenshot({path:path.join(shots,'5-chat-phone.png')});
  ok('phone: Humanoid, Chat and the controls fit the screen');
  await phone.close();

  /* 12. Safe entrance: the Humanoid cannot be reached -> the written Chat opens with a notice; never a blank screen. */
  apexAvailable=false;
  const safe=await browser.newContext(ctxOptions());const sp=await safe.newPage();
  await login(sp);await sp.waitForSelector('.n7-home-notice',{timeout:20000});
  assert.match(await sp.locator('.n7-home-notice').innerText(),/Το Humanoid δεν είναι διαθέσιμο/);
  assert.equal(await sp.locator('#n7HomeLoading').count(),0,'the loading cover is removed');
  assert.equal(await sp.locator('#application').isVisible(),true,'the Chat is usable');
  assert.equal(await sp.evaluate(()=>{const s=document.getElementById('n7Stage');return !s||s.hidden;}),true,'the old Humanoid does not appear as a substitute');
  assert.ok((await sp.evaluate(()=>document.body.innerText.length))>50,'the screen is not blank');
  if(shots)await sp.screenshot({path:path.join(shots,'6-safe-entrance.png')});
  apexAvailable=true;
  await sp.click('.n7-home-nav button[data-nav="humanoid"]');await sp.waitForURL(/\/n7-apex\/$/,{timeout:20000});await sp.waitForSelector('.n7-guide-view',{timeout:30000});
  ok('safe entrance: the Chat opens with a notice when the Humanoid is unavailable, and the button returns when it is back');
  await safe.close();

  console.log(JSON.stringify({ok:true,checks:checks.length,names:checks},null,1));
 }catch(e){console.error('FAILED',e.stack||e);if(logs)console.error('server log tail:',logs.slice(-800));process.exitCode=1;}
 finally{if(browser)await browser.close();if(child){child.kill('SIGTERM');await once(child,'exit').catch(()=>{});}front.close();model.close();fs.rmSync(data,{recursive:true,force:true});}
})();
