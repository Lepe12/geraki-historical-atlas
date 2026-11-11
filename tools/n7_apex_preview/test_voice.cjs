// Deterministic browser integration fixtures; never presented as real audio/model proof.
const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const url=process.env.N7_VISUAL_URL||'http://127.0.0.1:4177/n7-apex-step5/',out=process.env.N7_VOICE_OUT||'/tmp/n7-voice';fs.mkdirSync(out,{recursive:true});
(async()=>{const b=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/chromium',...(process.env.N7_BROWSER_PROXY?{proxy:{server:process.env.N7_BROWSER_PROXY}}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
 const p=await b.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{
   window.__voiceFixture={utterances:[],cancelled:0,starts:0};
   class Recognition {start(){window.__voiceFixture.recognition=this;window.__voiceFixture.starts++;}abort(){this.onend?.();}}
   class Utterance {constructor(text){this.text=text;}}
   Object.defineProperty(window,'SpeechRecognition',{value:Recognition,configurable:true});
   Object.defineProperty(window,'SpeechSynthesisUtterance',{value:Utterance,configurable:true});
   Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[{voiceURI:'fixture-el',name:'Fixture Greek',lang:'el-GR'}],addEventListener(){},removeEventListener(){},speak(u){window.__voiceFixture.utterances.push(u);window.__voiceFixture.current=u;},cancel(){window.__voiceFixture.cancelled++;}},configurable:true});
 });
 const waitRelease=async()=>{const until=Date.now()+10000;while(!release&&Date.now()<until)await p.waitForTimeout(20);assert(release,'Chat POST never reached fixture');};
 let authenticated=true,messages=[],queued=false,poll=0,posts=0,fail=false,release;
 await p.route('**/api/**',async route=>{const req=route.request(),pathname=new URL(req.url()).pathname;let data={},status=200;
   if(pathname==='/api/status')data={authenticated};
   else if(pathname==='/api/login'){if(req.postDataJSON().password==='fixture-only-not-a-secret'){authenticated=true;data={ok:true};}else{status=401;data={error:'Λάθος κωδικός.'};}}
   else if(pathname==='/api/tasks')data={tasks:[]};
   else if(pathname==='/api/conversations'&&req.method()==='POST')data={id:'voice-fixture'};
   else if(pathname==='/api/conversations')data={conversations:[{id:'voice-fixture',title:'Voice fixture'}]};
   else if(pathname.endsWith('/chat')){posts++;const text=req.postDataJSON().message;messages.push({role:'user',content:text});await new Promise(r=>release=r);if(fail){status=500;data={error:'Fixture model failure'};}else if(queued){status=202;data={pending:true,job_id:'voice-queue'};}else{messages.push({role:'assistant',content:'Απάντηση μόνο από τη δοκιμή.'});data={conversation:{messages}};}}
   else if(pathname==='/api/n7/job/voice-queue'){poll++;messages.push({role:'assistant',content:'Απάντηση ουράς μόνο από τη δοκιμή.'});data={status:'done'};}
   else data={conversation:{messages}};
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 });
 await p.goto(url,{waitUntil:'networkidle'});const dialog=p.getByRole('dialog',{name:'N7 Humanoid preview'});
 await dialog.getByRole('button',{name:'Φωνητική συνομιλία',exact:true}).click({timeout:5000});
 assert.equal(await dialog.locator('input[type=password]').count(),0);await dialog.getByRole('button',{name:'Υπαγόρευση',exact:true}).waitFor();
 const enableVoice=async()=>{const button=dialog.getByRole('button',{name:'Φωνή ανενεργή',exact:true});if(await button.isVisible())await button.click();};
 const mood=()=>dialog.getByLabel('N7 mood status');const count=()=>p.evaluate(()=>window.__voiceFixture.utterances.length);
 const skip=dialog.getByRole('button',{name:'Skip',exact:true});if(await skip.isVisible())await skip.click();
 assert.equal(await p.evaluate(()=>window.__voiceFixture.starts),0,'Mic started without gesture');assert.equal(await count(),0,'Audio started without gesture');
 await dialog.getByRole('button',{name:'Υπαγόρευση',exact:true}).click();assert(!((await mood().innerText()).includes('LISTENING')),'Listening before recognition start');
 await p.evaluate(()=>window.__voiceFixture.recognition.onstart());await dialog.getByText('MOOD · LISTENING · LIVE N7 REQUEST',{exact:true}).waitFor();
 await p.evaluate(()=>{const r=window.__voiceFixture.recognition;r.onresult({results:[{isFinal:true,0:{transcript:'Πες μου για τη Ρόδο.'}}]});r.onend();});
 await dialog.getByText('MOOD · IDLE',{exact:true}).waitFor();assert.equal(await dialog.getByLabel('Φωνητικό μήνυμα',{exact:true}).inputValue(),'Πες μου για τη Ρόδο.');assert.equal(posts,0,'Transcript sent without confirmation');
 await enableVoice();await dialog.getByRole('button',{name:'Αποστολή στη φιγούρα',exact:true}).click();
 await waitRelease();await dialog.getByText('MOOD · THINKING · LIVE N7 REQUEST',{exact:true}).waitFor();release();
 await dialog.getByLabel('Τελευταία απάντηση N7').getByText('Απάντηση μόνο από τη δοκιμή.',{exact:true}).waitFor();await p.waitForFunction(()=>window.__voiceFixture.utterances.length===1);
 assert(!((await mood().innerText()).includes('SPEAKING')),'Speaking before audio start');await p.evaluate(()=>window.__voiceFixture.current.onstart());await dialog.getByText('MOOD · SPEAKING · LIVE N7 REQUEST',{exact:true}).waitFor();
 await p.evaluate(()=>window.__voiceFixture.current.onend());await dialog.getByText('MOOD · IDLE',{exact:true}).waitFor();
 await dialog.getByRole('button',{name:'Ανάγνωση απάντησης',exact:true}).click();await p.evaluate(()=>window.__voiceFixture.current.onstart());await dialog.getByRole('button',{name:'Διακοπή ήχου',exact:true}).click();await dialog.getByText('MOOD · IDLE',{exact:true}).waitFor();assert.equal(await dialog.getByRole('button',{name:'Φωνή ανενεργή',exact:true}).getAttribute('aria-pressed'),'false');
 await p.evaluate(()=>window.__voiceFixture.current.onend());assert.equal(await count(),2,'Cancelled speech resumed');
 await dialog.getByRole('button',{name:'Υπαγόρευση',exact:true}).click();await p.evaluate(()=>{const r=window.__voiceFixture.recognition;r.onstart();r.onerror({error:'not-allowed'});});await dialog.getByLabel('Κατάσταση φωνής').getByText(/Επίτρεψε το μικρόφωνο/).waitFor();await dialog.getByText('MOOD · IDLE',{exact:true}).waitFor();
 queued=true;release=null;await enableVoice();await dialog.getByLabel('Φωνητικό μήνυμα').fill('queued fixture');await dialog.getByRole('button',{name:'Αποστολή στη φιγούρα',exact:true}).click();await waitRelease();release();await dialog.getByText('MOOD · THINKING · LIVE N7 REQUEST',{exact:true}).waitFor();assert.equal(await count(),2,'Queued response spoke before completion');
 await p.waitForFunction(()=>window.__voiceFixture.utterances.length===3,{},{timeout:18000});assert.equal(poll,1);await p.evaluate(()=>window.__voiceFixture.current.onstart());await dialog.getByText('MOOD · SPEAKING · LIVE N7 REQUEST',{exact:true}).waitFor();await p.evaluate(()=>window.__voiceFixture.current.onend());await dialog.getByText('MOOD · IDLE',{exact:true}).waitFor();
 queued=false;fail=true;release=null;await dialog.getByLabel('Φωνητικό μήνυμα').fill('failure fixture');await dialog.getByRole('button',{name:'Αποστολή στη φιγούρα',exact:true}).click();await waitRelease();release();await dialog.getByText('MOOD · IDLE',{exact:true}).waitFor();assert.equal(await count(),3,'Error response spoke');
 await dialog.getByRole('button',{name:'Δοκιμή φωνής',exact:true}).click();await p.evaluate(()=>window.__voiceFixture.current.onstart());await dialog.getByText('MOOD · SPEAKING · LIVE N7 REQUEST',{exact:true}).waitFor();await dialog.getByRole('button',{name:'Exit',exact:true}).click();assert((await p.evaluate(()=>window.__voiceFixture.cancelled))>0);
 await p.getByRole('button',{name:'HUMANOID',exact:true}).click();await dialog.getByRole('button',{name:'Φωνή ανενεργή',exact:true}).waitFor();
 await p.setViewportSize({width:390,height:844});await p.screenshot({path:path.join(out,'mobile-voice.png')});const box=await dialog.getByLabel('Φωνητικό μήνυμα').boundingBox();assert(box.width>200&&box.x>=0&&box.x+box.width<=390,'Mobile composer overflow');
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'fixture-results.json'),JSON.stringify({scope:'Local mocked N7 API and speech device events; not an actual model or audible audio test',existingSessionReused:true,passwordFieldAbsent:true,micRequiresGesture:true,transcriptRequiresConfirmation:true,listenStartEnd:true,playbackStartEnd:true,stopCancels:true,permissionDenied:true,queuedReplyRead:true,errorClearsActivity:true,exitCancels:true,mobile:true,errors},null,2));
 await p.close();
 // Read-only native capability and deployed UI probe. No auth bypass or mocked model.
 const real=await b.newPage();await real.goto(url,{waitUntil:'networkidle'});await real.getByRole('button',{name:'Φωνητική συνομιλία',exact:true}).click();
 const capabilities=await real.evaluate(()=>({recognition:!!(window.SpeechRecognition||window.webkitSpeechRecognition),synthesis:!!window.speechSynthesis,voices:window.speechSynthesis?.getVoices().map(v=>({name:v.name,lang:v.lang})),secure:window.isSecureContext}));
 fs.writeFileSync(path.join(out,'native-capabilities.json'),JSON.stringify({url,...capabilities,limitations:'Headless device capabilities do not prove a human microphone recording, audible speaker output, or an authenticated real-model answer.'},null,2));console.log('Voice lifecycle fixture and native UI probe passed.');
 }finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
