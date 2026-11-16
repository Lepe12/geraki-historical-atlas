'use strict';
// N7_WEATHER_PRESENTATION_V1, end to end in a real browser: the assembled N7 runtime (provider fixtures from
// test/fixtures/n7-agents-provider-preload.cjs, loopback model) serves the page; the stage's own weather
// handler must show the current conditions and the notice about warnings that the server now words, and
// speak a text with Greek words. A weather question that fails must show no figures.
// Needs playwright-core (or playwright) and Chromium. Env: CHROME_BIN (optional), N7_RUNTIME_PATH (optional).
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
let chromium;try{({chromium}=require('playwright-core'));}catch{({chromium}=require('playwright'));}
const ROOT=path.resolve(__dirname,'../..');
const runtime=path.resolve(process.env.N7_RUNTIME_PATH||path.join(ROOT,'.n7-runtime'));
const preload=path.join(ROOT,'test/fixtures/n7-agents-provider-preload.cjs');
(async()=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'n7-weather-stage-'));let child,browser;
 const provider=http.createServer(async(req,res)=>{let t='';for await(const c of req)t+=c;res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:'Απάντηση δοκιμής'},finish_reason:'stop'}]}));});
 await new Promise(r=>provider.listen(0,'127.0.0.1',r));
 const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const base='http://127.0.0.1:'+port;let logs='';
 async function start(extra={}){
  child=spawn(process.execPath,[path.join(runtime,'server.js')],{cwd:runtime,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:data,COOKIE_SECURE:'0',BOT_PASSWORD:'local-weather-stage',
   SESSION_SECRET:'test-only-session-secret-'.repeat(3),LLM_BASE_URL:'http://127.0.0.1:'+provider.address().port+'/v1',LLM_API_KEY:'fixture-not-a-key',LLM_MODEL:'fixture',
   NODE_OPTIONS:((process.env.NODE_OPTIONS||'')+' --require '+JSON.stringify(preload)).trim(),...extra}});
  child.stdout.on('data',b=>logs=(logs+b).slice(-3000));child.stderr.on('data',b=>logs=(logs+b).slice(-3000));
  for(let i=0;i<120;i++){try{if((await fetch(base+'/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}
  throw Error('server did not start: '+logs);
 }
 async function stop(){if(child){const c=child;child=null;c.kill('SIGTERM');await once(c,'exit');}}
 try{
  await start();
  browser=await chromium.launch({executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  // A device with a Greek voice: every utterance the screen speaks is recorded instead of played.
  await page.addInitScript(()=>{window.N7_LEGACY_STAGE_ENTRY=true;}); // N7_APEX_HOME_V1: this test exercises the stage itself
  await page.addInitScript(()=>{window.__spoken=[];
   // The native class refuses a voice object that is not a real SpeechSynthesisVoice, so it is replaced too.
   window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
   const stub={getVoices:()=>[{lang:'el-GR',name:'Greek fixture',voiceURI:'fixture-el'}],speak(u){window.__spoken.push(u.text);setTimeout(()=>u.onend&&u.onend(),0);},cancel(){},addEventListener(){},removeEventListener(){},speaking:false};
   Object.defineProperty(window,'speechSynthesis',{value:stub,configurable:true});});
  await page.goto(base+'/');await page.waitForSelector('#login:not(.hidden) #loginform input[name=password]');
  await page.fill('#loginform input[name=password]','local-weather-stage');await page.press('#loginform input[name=password]','Enter');
  await page.waitForSelector('#n7Stage:not([hidden])',{timeout:20000});
  const ask=async text=>{await page.fill('#n7StageInput',text);await page.click('#n7StageSend');await page.waitForSelector('#n7StageResults .n7-note',{timeout:20000});};
  await ask('Τι καιρό κάνει στην Αθήνα;');
  const notes=await page.$$eval('#n7StageResults .n7-note',els=>els.map(e=>e.textContent));
  const table=await page.$$eval('#n7StageResults table tr',trs=>trs.map(t=>[...t.children].map(td=>td.innerText)));
  assert.equal(table.length,4,'header row and three forecast days are still shown: '+JSON.stringify(table));
  assert.deepEqual(table[0],['Ημέρα','Καιρός','Μέγ.','Ελάχ.','Βροχή','Άνεμος']);
  assert.match(notes[0],/^Τώρα \(Σάβ 14\/11\/2026 15:15, ώρα Europe\/Athens\): 18,4°C \(αίσθηση 17,9°C\) · Νεφελώδης · άνεμος 12,2 km\/h από ΒΑ, ριπές 24,8 km\/h/,'current conditions are shown: '+notes[0]);
  assert.match(notes[1],/^Προειδοποιήσεις: ο πάροχος δεν δίνει επίσημες προειδοποιήσεις/,'the notice about warnings is shown');
  assert.match(notes[2],/^Πηγή: Open-Meteo · Αθήνα, Ελλάδα · ανακτήθηκε /,'the source line is still last');
  const spoken=await page.evaluate(()=>window.__spoken.join(' '));
  if(!spoken)console.error('SPEECH DIAGNOSTIC',JSON.stringify(await page.evaluate(()=>({count:window.__spoken.length,type:typeof window.speechSynthesis,voices:window.speechSynthesis&&window.speechSynthesis.getVoices&&window.speechSynthesis.getVoices().length,state:document.getElementById('n7StageState').textContent,prefs:localStorage.length}))));
  assert.match(spoken,/^Καιρός, Αθήνα\. τώρα 18,4 βαθμούς Κελσίου, νεφελώδης, άνεμος 12,2 χιλιόμετρα την ώρα\. Αύριο: /,'weather speech: '+spoken);
  assert.doesNotMatch(spoken,/°C|km\/h|%/,'weather speech has no raw units');
  // A dictated geopolitics question goes to the chat, the news agent answers, and the screen speaks the cleaned text.
  const before=await page.evaluate(()=>window.__spoken.length);
  await page.fill('#n7StageInput','Ποιες είναι οι τελευταίες γεωπολιτικές εξελίξεις;');await page.click('#n7StageSend');
  await page.waitForFunction(n=>window.__spoken.length>n,before,{timeout:30000});
  const screenText=await page.evaluate(()=>document.getElementById('n7StageReply').innerText);
  assert.match(screenText,/^\[News & Geopolitics Agent\]/,'the screen shows the full agent answer: '+screenText.slice(0,120));
  const newsSpoken=await page.evaluate(n=>window.__spoken.slice(n).join(' '),before);
  assert.match(newsSpoken,/^Ειδήσεις, Γεωπολιτική και διεθνείς σχέσεις, Ελλάδα και διεθνή\. Γεγονότα που διασταυρώθηκαν από περισσότερα μέσα\. /,'news speech: '+newsSpoken.slice(0,200));
  assert.match(newsSpoken,/σύμφωνα με /);
  assert.doesNotMatch(newsSpoken,/https?:|\[S\d+\]|\[.*Agent\]|\d{2}\/\d{2}\/\d{4}|°C/,'news speech carries marks, addresses or raw dates: '+newsSpoken.slice(0,300));
  assert.ok(newsSpoken.length<=800,'speech is cut at about half a minute: '+newsSpoken.length);
  // The server is told the place by the screen; a provider failure shows no figures.
  await stop();await start({N7_FIXTURE_WEATHER_DOWN:'1'});
  await page.reload();await page.waitForSelector('#n7Stage:not([hidden])',{timeout:20000});
  await page.fill('#n7StageInput','Τι καιρό κάνει στην Αθήνα;');await page.click('#n7StageSend');
  await page.waitForFunction(()=>/WEATHER|δεν|απέτυχ|σφάλμα|διαθέσιμ/i.test(document.getElementById('n7StageState').textContent+document.getElementById('n7StageReply').textContent),{timeout:20000});
  const failure=await page.evaluate(()=>document.getElementById('n7StageResults').innerText+' '+document.getElementById('n7StageReply').innerText);
  assert.doesNotMatch(failure,/°C|km\/h/,'no figures when the provider is down: '+failure);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,notes,weatherSpoken:spoken.slice(0,160),newsSpoken:newsSpoken.slice(0,240)},null,1));
 }finally{if(browser)await browser.close();await stop();provider.closeAllConnections();provider.close();fs.rmSync(data,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
