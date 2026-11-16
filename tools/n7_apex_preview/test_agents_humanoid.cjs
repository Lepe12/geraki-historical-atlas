// N7_SPECIALIST_AGENTS_V1: the Humanoid with the News & Geopolitics and Weather agents.
// One conversation only: a dictated or typed request, the agent's answer in the same place,
// active source links and Greek speech without web addresses.
//
// Two modes:
//  - default: the /api answers are fixtures in the exact format the N7 server produces. This checks
//    the Humanoid side only and proves nothing about real news or weather.
//  - N7_BACKEND_URL + N7_BACKEND_PASSWORD: every /api call is passed to a real running N7 server
//    (the canonical runtime). Then the intent recognition, the agents and their providers are the
//    real ones. Speech recognition input is always a fixture transcript; no microphone is claimed.
const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const url=process.env.N7_VISUAL_URL||'http://127.0.0.1:4173/n7-apex/',out=process.env.N7_AGENTS_OUT||'/tmp/n7-agents';fs.mkdirSync(out,{recursive:true});
const backend=(process.env.N7_BACKEND_URL||'').replace(/\/$/,''),password=process.env.N7_BACKEND_PASSWORD||'';
const WEATHER='[Weather Agent]\nΚαιρός — Αθήνα, Αττική, Ελλάδα\nΤώρα (Σάβ 14/11/2026 15:15, ώρα Europe/Athens): 18,4°C (αίσθηση 17,9°C) · Νεφελώδης · άνεμος 12,2 km/h από ΒΑ.\nΠρόγνωση:\n• Σάβ 14/11/2026: Νεφελώδης · 11,2 έως 19,1°C · πιθανότητα βροχής 10%\nΠροειδοποιήσεις: ο πάροχος δεν δίνει επίσημες προειδοποιήσεις, άρα δεν αναφέρω καμία. Για έκτακτα δελτία ισχύει η ΕΜΥ.\nΠηγή: Open-Meteo · ανάκτηση 14/11/2026, 15:20 (ώρα Ελλάδας)\nhttps://geocoding-api.open-meteo.com/v1/search?count=1&name=fixture\nhttps://api.open-meteo.com/v1/forecast?latitude=37.98&longitude=23.72';
const NEWS='[News & Geopolitics Agent]\nΕιδήσεις — Γεωπολιτική και διεθνείς σχέσεις · Ελλάδα και διεθνή\nΕνημέρωση: 14/11/2026, 15:20 (ώρα Ελλάδας)\n\nΓΕΓΟΝΟΤΑ ΜΕ ΔΙΑΣΤΑΥΡΩΣΗ (τουλάχιστον δύο ανεξάρτητα μέσα, ένα καθιερωμένο):\n[S1] Δοκιμαστικός τίτλος συμφωνίας — 14/11/2026 — Reuters, Kathimerini\nReuters: https://news.google.com/rss/articles/fixture-1\nKathimerini: https://news.google.com/rss/articles/fixture-2\n\nΙΣΧΥΡΙΣΜΟΙ, ΔΗΛΩΣΕΙΣ ΚΑΙ ΑΠΟΔΙΔΟΜΕΝΕΣ ΑΝΑΦΟΡΕΣ (ανήκουν σε όσους τους διατυπώνουν):\n[S2] Υπουργός: «Δοκιμαστική δήλωση» — 14/11/2026 — Skai.gr\nSkai.gr: https://news.google.com/rss/articles/fixture-3\n\nΣημείωση: διαβάστηκαν μόνο τίτλοι, ημερομηνίες και μέσα από δημόσιες ροές ειδήσεων, όχι τα ίδια τα άρθρα.';
(async()=>{
 let cookie='';
 if(backend){
  const login=await fetch(backend+'/api/login',{method:'POST',headers:{'content-type':'application/json',origin:backend},body:JSON.stringify({password})});
  assert.equal(login.status,200,'backend login failed');cookie=login.headers.get('set-cookie').split(';')[0];
 }
 const b=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const p=await b.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{
   window.__agents={starts:0,spoken:[],decoded:[],nativeCalls:0};
   // What is handed to the Greek voice, and what audio it produced.
   const NativeWorker=window.Worker;
   window.Worker=class extends NativeWorker{postMessage(message,...rest){if(message&&typeof message.text==='string')window.__agents.spoken.push(message.text);return super.postMessage(message,...rest);}};
   const decode=AudioContext.prototype.decodeAudioData;
   AudioContext.prototype.decodeAudioData=function(bytes,...args){return decode.call(this,bytes,...args).then(buffer=>{const pcm=buffer.getChannelData(0);let sum=0;for(const v of pcm)sum+=v*v;window.__agents.decoded.push({duration:buffer.duration,rms:Math.sqrt(sum/pcm.length)});return buffer;});};
   class Recognition{start(){window.__agents.recognition=this;window.__agents.starts++;queueMicrotask(()=>this.onstart?.());}abort(){}}
   Object.defineProperty(window,'SpeechRecognition',{value:Recognition,configurable:true});
   Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],addEventListener(){},removeEventListener(){},cancel(){},speak(){window.__agents.nativeCalls++;}},configurable:true});
  });
  const fixture={messages:[]};
  await p.route('**/api/**',async route=>{
   const request=route.request(),u=new URL(request.url());
   if(backend){
    // The page is same-origin with its API in production; here the same calls reach the real server.
    const response=await fetch(backend+u.pathname+u.search,{method:request.method(),headers:{'content-type':'application/json',cookie,origin:backend},body:request.method()==='GET'?undefined:request.postData()});
    await route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});return;
   }
   let data={};
   if(u.pathname==='/api/status')data={authenticated:true};
   else if(u.pathname==='/api/tasks')data={tasks:[]};
   else if(u.pathname==='/api/conversations'&&request.method()==='POST'){fixture.messages=[];data={id:'agents-fixture'};}
   else if(u.pathname==='/api/conversations')data={conversations:[{id:'agents-fixture',title:'Agents fixture'}]};
   else if(u.pathname.endsWith('/chat')){
    const text=request.postDataJSON().message,weather=/καιρ|βρέξ|βροχ/i.test(text),news=/ειδησ|ειδήσ|γεωπολιτικ/i.test(text);
    const reply=weather?WEATHER:news?NEWS:'Απλή απάντηση δοκιμής χωρίς agent.';
    fixture.messages.push({role:'user',content:text},{role:'assistant',content:reply});
    data={reply,agent:weather?{id:'weather',label:'Weather',greek:'Καιρός'}:news?{id:'news_geopolitics',label:'News & Geopolitics',greek:'Ειδήσεις και Γεωπολιτική'}:undefined,conversation:{messages:fixture.messages}};
   }else data={conversation:{messages:fixture.messages}};
   await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await p.goto(url,{waitUntil:'networkidle'});
  const d=p.getByRole('dialog',{name:'N7 Humanoid preview'});
  const skip=d.getByRole('button',{name:'Skip',exact:true});if(await skip.isVisible().catch(()=>false))await skip.click();
  await d.getByRole('button',{name:'Συνομιλία',exact:true}).click();
  const answer=d.getByLabel('Τελευταία απάντηση N7',{exact:true});
  const result={url,mode:backend?'real N7 server ('+(process.env.N7_AGENTS_LIVE==='1'?'live providers':'synthetic providers')+')':'fixture API answers',voice:[],typed:[],errors};
  const say=async(transcript,label,turn)=>{
   await p.waitForFunction(n=>window.__agents.starts===n,turn,{timeout:Number(process.env.N7_AGENTS_WAIT||600000)}).catch(async e=>{
    // Diagnostics: where the voice flow stood when listening did not resume.
    const state=await p.evaluate(()=>({starts:window.__agents.starts,spoken:window.__agents.spoken.length,decoded:window.__agents.decoded.length,status:document.querySelector('[aria-label="Κατάσταση φωνής"]')?.innerText,mood:[...document.querySelectorAll('*')].map(x=>x.childElementCount===0?x.textContent:'').find(t=>/^MOOD · /.test(t||''))}));
    console.error('VOICE STATE WHEN LISTENING DID NOT RESUME',JSON.stringify(state));throw e;});
   const spokenBefore=await p.evaluate(()=>window.__agents.spoken.length);
   await p.evaluate(text=>{const r=window.__agents.recognition;r.onresult({results:[{isFinal:true,0:{transcript:text}}]});r.onend();},transcript);
   await answer.getByText(label,{exact:false}).waitFor({timeout:120000});
   const text=await answer.innerText();
   // The answer is spoken by the Greek voice, to the end: listening resumes only after the last piece.
   await d.getByText('MOOD · SPEAKING · LIVE N7 REQUEST',{exact:true}).waitFor({timeout:600000});
   await p.waitForFunction(n=>window.__agents.starts===n+1,turn,{timeout:Number(process.env.N7_AGENTS_WAIT||600000)});
   const spoken=(await p.evaluate(from=>window.__agents.spoken.slice(from),spokenBefore)).join(' ');
   assert.ok(spoken.length>20,'nothing was handed to the voice');
   assert.doesNotMatch(spoken,/https?:|\[S\d+\]|\[.*Agent\]|°C|km\/h|\d+%|\d{2}\/\d{2}\/\d{4}|Europe\//,'spoken text carries addresses, marks or raw units: '+spoken.slice(0,300));
   const links=await answer.locator('a[href^="https://"]').evaluateAll(a=>a.map(x=>({href:x.href,target:x.target,rel:x.rel,text:x.textContent})));
   return {transcript,text,spoken,links};
  };
  if(!process.env.N7_AGENTS_SKIP_VOICE){ // N7_AGENTS_SKIP_VOICE=1 is only for debugging the typed part quickly.
  await d.getByRole('button',{name:'Έναρξη συζήτησης',exact:true}).click();
  // Voice command 1: weather, dictated in lower case as speech recognition returns it.
  const weather=await say('τι καιρό κάνει στην αθήνα','[Weather Agent]',1);
  if(/°C/.test(weather.text)){
   assert.match(weather.text,/Καιρός — /);assert.match(weather.text,/ανάκτηση \d\d\/\d\d\/\d{4}, \d\d:\d\d \(ώρα Ελλάδας\)/);
   assert.ok(weather.links.some(l=>new URL(l.href).hostname==='api.open-meteo.com'),'the provider address is an active link');
   assert.match(weather.spoken,/^Καιρός, Αθήνα/);assert.match(weather.spoken,/βαθμούς Κελσίου/);
  }else{
   assert.match(weather.text,/Το Open-Meteo δεν απάντησε αυτή τη στιγμή/,'no figures without provider data');
   result.weatherProviderUnavailable=true;
  }
  assert.ok(weather.links.every(l=>l.target==='_blank'&&l.rel.includes('noopener')));
  result.voice.push({transcript:weather.transcript,agent:'weather',answer:weather.text,spoken:weather.spoken,links:weather.links.length});
  await p.screenshot({path:path.join(out,'voice-weather.png')});
  // Voice command 2: geopolitics, in the same conversation, after listening resumes by itself.
  const news=await say('ποιες είναι οι τελευταίες γεωπολιτικές εξελίξεις','[News & Geopolitics Agent]',2);
  assert.match(news.text,/Ειδήσεις — Γεωπολιτική και διεθνείς σχέσεις/);
  assert.match(news.text,/Ενημέρωση: \d\d\/\d\d\/\d{4}, \d\d:\d\d \(ώρα Ελλάδας\)/);
  if(/\[S1\]/.test(news.text)){assert.ok(news.links.length>=1,'news sources are active links');assert.match(news.spoken,/^Ειδήσεις, /);}
  else result.newsProviderUnavailable=true;
  result.voice.push({transcript:news.transcript,agent:'news_geopolitics',answer:news.text.slice(0,1500),spoken:news.spoken,links:news.links.length});
  await p.screenshot({path:path.join(out,'voice-news.png')});
  const audio=await p.evaluate(()=>window.__agents.decoded);
  assert.ok(audio.length>=2&&audio.every(a=>a.duration>0.3&&a.rms>0.003),'Greek speech audio was not produced: '+JSON.stringify(audio));
  assert.equal(await p.evaluate(()=>window.__agents.nativeCalls),0,'the device voice was used instead of the Greek N7 voice');
  result.audio={clips:audio.length,seconds:Math.round(audio.reduce((s,a)=>s+a.duration,0)*10)/10};
  await d.getByRole('button',{name:'Τέλος συζήτησης',exact:true}).click();
  }
  // Typed requests in the same workspace: no second chat is opened anywhere.
  await d.getByRole('button',{name:'Exit',exact:true}).click();
  await p.locator('[aria-controls="n7-workspace"]').click();
  const box=p.getByLabel('Νέο μήνυμα',{exact:true}),log=p.locator('#n7-workspace [aria-live="polite"]').first();
  for(const [text,expect] of [['Πες μου τις σημερινές ειδήσεις','[News & Geopolitics Agent]'],['Θα βρέξει αύριο στη Θεσσαλονίκη;','[Weather Agent]'],['Γράψε μου ένα δίστιχο για τη θάλασσα',null]]){
   const before=await log.locator('article').count();
   await box.fill(text);await p.getByRole('button',{name:'Αποστολή',exact:true}).click();
   await p.waitForFunction(({n})=>document.querySelectorAll('#n7-workspace [aria-live="polite"] article').length>=n+2,{n:before},{timeout:120000}).catch(async e=>{
    console.error('TYPED STEP STUCK',JSON.stringify({text,before,now:await log.locator('article').count(),workspace:(await p.locator('#n7-workspace').innerText()).slice(-700)}));throw e;});
   const last=log.locator('article').last(),content=await last.innerText();
   if(expect)assert.ok(content.includes(expect),text+' did not reach its agent: '+content.slice(0,160));
   else assert.doesNotMatch(content,/\[(?:Weather|News & Geopolitics) Agent\]/,'an ordinary message was sent to an agent');
   result.typed.push({text,agent:expect,links:await last.locator('a[href^="https://"]').count(),answer:content.slice(0,700)});
  }
  assert.equal(await p.locator('[aria-label="Νέο μήνυμα"]').count(),1,'exactly one chat input exists');
  await p.screenshot({path:path.join(out,'typed.png')});
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({mode:result.mode,voice:result.voice.map(v=>({transcript:v.transcript,agent:v.agent,links:v.links,spoken:v.spoken.slice(0,160)})),typed:result.typed.map(t=>({text:t.text,agent:t.agent,links:t.links})),audio:result.audio,weatherProviderUnavailable:result.weatherProviderUnavailable||false,newsProviderUnavailable:result.newsProviderUnavailable||false},null,1));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
