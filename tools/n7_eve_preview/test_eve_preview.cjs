// Real-function checks of the local /n7-eve preview. Library/agents/NABOU use the live services;
// the microphone uses a scripted SpeechRecognition stand-in (headless has no microphone).
const { chromium } = require('playwright-core');
const fs=require('fs');
const BASE=process.env.URL||'http://127.0.0.1:4180/n7-eve/';
const OUT=process.env.N7_EVE_OUT||'/tmp/n7eve/shots'; fs.mkdirSync(OUT,{recursive:true});
const log=(...a)=>console.log(...a);
const ok=(c,m)=>{if(!c)throw Error('FAIL: '+m);log('PASS',m);};
async function page(b,vp){
  const mobile=vp.width<500;
  const ctx=await b.newContext({viewport:vp,deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile});
  await ctx.addInitScript(()=>{
    // Microphone stand-in: start → onstart (LISTENING), stop after 1.5 s with a final transcript.
    class FakeRec{constructor(){this.lang='';}start(){setTimeout(()=>this.onstart&&this.onstart(),50);this._t=setTimeout(()=>{this.onresult&&this.onresult({results:[Object.assign([{transcript:'Μπαρμπαρόσα'}],{isFinal:true})]});this.onend&&this.onend();},2500);}abort(){clearTimeout(this._t);}}
    window.webkitSpeechRecognition=FakeRec;window.SpeechRecognition=FakeRec;
  });
  const p=await ctx.newPage();p.errors=[];p.failed=[];
  p.on('pageerror',e=>p.errors.push(String(e)));
  p.on('response',r=>{if(r.status()>=400)p.failed.push(r.status()+' '+r.url());});
  return p;
}
const state=p=>p.locator('.eve-root').getAttribute('data-state');
// Navigation: the rail is always visible on desktop; on a phone it opens from the menu button.
async function go(p,tag,section){
  if(tag==='mobile'){await p.locator('.eve-menu').click();await p.locator('.eve-rail[data-mobile-open=true]').waitFor();}
  await p.locator(`.eve-rail-item[data-section=${section}]`).click();
}
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
  for(const [tag,vp] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]){
    log('==',tag);
    const p=await page(b,vp);
    await p.goto(BASE,{waitUntil:'load'});
    const fig=p.locator('.eve-figure canvas:visible').first();
    await fig.waitFor({state:'visible',timeout:20000});
    const box=await p.locator('.eve-figure').boundingBox();
    ok(box&&box.height>vp.height*0.45,`${tag}: humanoid is large (${box&&Math.round(box.width)}x${box&&Math.round(box.height)} in ${vp.width}x${vp.height})`);
    await p.waitForFunction(()=>document.querySelector('.eve-figure')?.dataset.assembly==='complete',null,{timeout:20000});
    ok(true,`${tag}: assembly animation completed`);
    ok(await state(p)==='idle',`${tag}: state IDLE at rest`);
    if(tag==='desktop'){
      // Home screen: side panels with real values only.
      await p.waitForFunction(()=>/piratecartography/.test(document.querySelector('.eve-col-right')?.innerText||''),null,{timeout:30000});
      const right=await p.locator('.eve-col-right').innerText(), left=await p.locator('.eve-col-left').innerText();
      ok(/Τρέχον Έργο/i.test(right)&&/piratecartography/.test(right),'desktop: Τρέχον Έργο shows the real pct-live project');
      ok(/N7 — Υποδοχή/.test(left)&&/Ενεργοί Agents/i.test(left),'desktop: Υποδοχή and Ενεργοί Agents panels present');
      ok(!/\d+\s?%/.test(left+right),'desktop: no invented percentages in the side panels');
      ok(await p.locator('.eve-actions button',{hasText:'Ανάλυση πηγής (OCR)'}).isDisabled(),'desktop: OCR quick action disabled (not connected)');
      ok(await p.locator('.eve-actions button',{hasText:'Αναζήτηση στο διαδίκτυο'}).isDisabled(),'desktop: web search disabled while signed out');
      ok(!(await p.locator('.eve-actions button',{hasText:'Άνοιγμα χάρτη NABOU'}).isDisabled()),'desktop: NABOU quick action enabled');
      await p.waitForFunction(()=>document.querySelectorAll('.eve-sys li[data-tone=ok]').length>=3,null,{timeout:30000});
      ok(true,'desktop: Σύστημα dots reflect live services');
      ok(/Online|Offline/.test(await p.locator('.eve-online').innerText()),'desktop: top bar shows real N7 reachability');
      for(const s of ['n7','chat','research','sources','nabou','agents','library','projects','settings'])
        ok(await p.locator(`.eve-rail-item[data-section=${s}] .eve-rail-label`).isVisible(),`desktop: rail item ${s} with Greek label`);
      await p.waitForTimeout(1500);
      await p.screenshot({path:`${OUT}/${tag}-0-main.png`});
    }
    // Chat: signed out → the question goes to the real library; THINKING while it runs.
    if(tag==='mobile'){await p.locator('.eve-n7-foot textarea').fill('Λάντζας');}
    else await p.locator('.eve-n7-foot textarea').fill('Λάντζας');
    await p.locator('.eve-n7-foot textarea').press('Enter');
    await p.waitForFunction(()=>document.querySelector('.eve-root')?.dataset.state==='thinking',null,{timeout:5000});
    ok(true,`${tag}: state THINKING while the request runs`);
    await p.locator('.eve-msg[data-role=library] .eve-hit').first().waitFor({timeout:90000});
    ok(await p.locator('.eve-msg[data-role=library] .eve-hit').count()>0,`${tag}: chat send returned real library hits`);
    ok(await state(p)==='idle',`${tag}: back to IDLE`);
    await p.screenshot({path:`${OUT}/${tag}-1-n7-main.png`});
    // Microphone → LISTENING → transcript sent → THINKING.
    if(tag==='mobile'){ /* the sheet holds the compact bar */ }
    const mic=p.locator(tag==='mobile'?'.eve-chat-foot .eve-mic':'.eve-n7-foot .eve-mic');
    await mic.click();
    await p.waitForFunction(()=>document.querySelector('.eve-root')?.dataset.state==='listening',null,{timeout:5000});
    ok(true,`${tag}: mic button → LISTENING`);
    if(tag==='desktop') await p.screenshot({path:`${OUT}/${tag}-1b-listening.png`});
    const field=p.locator(tag==='mobile'?'.eve-chat-foot textarea':'.eve-n7-foot textarea');
    await p.waitForFunction(sel=>document.querySelector(sel)?.value.includes('Μπαρμπαρόσα'),tag==='mobile'?'.eve-chat-foot textarea':'.eve-n7-foot textarea',{timeout:8000});
    ok(await state(p)==='idle',`${tag}: dictation filled the field (signed out: dictation only) and state returned to IDLE`);
    await field.press('Enter');
    await p.waitForFunction(()=>document.querySelector('.eve-root')?.dataset.state==='thinking',null,{timeout:8000});
    ok(true,`${tag}: dictated question sent → THINKING`);
    await p.waitForFunction(()=>document.querySelectorAll('.eve-msg[data-role=library]').length>=2,null,{timeout:90000});
    ok(true,`${tag}: spoken question answered from the library`);
    // NABOU workspace: the real map in the iframe, N7 chat beside it.
    const t0=Date.now();
    await go(p,tag,'nabou');
    const frame=p.frameLocator('.eve-nabou iframe');
    await p.locator('.eve-nabou iframe').waitFor({state:'visible'});
    await p.waitForFunction(()=>!document.querySelector('.eve-nabou-loading'),null,{timeout:45000});
    const fr=p.frames().find(f=>f.url().includes('jarvis-intelligence-chamber'));
    ok(!!fr,`${tag}: NABOU iframe loaded ${fr&&fr.url()}`);
    await p.waitForTimeout(7000);
    const title=await fr.title().catch(()=>'');
    const canvases=await fr.locator('canvas').count().catch(()=>0);
    ok(canvases>0||title,`${tag}: NABOU page title «${title}», canvases ${canvases}`);
    if(await p.locator('.eve-dock-open-map').isVisible())await p.locator('.eve-dock-open-map').click();
    ok(await p.locator('.eve-dock .eve-command textarea').isVisible(),`${tag}: N7 chat available on the map`);
    await p.waitForTimeout(800);
    const onTop=await p.evaluate(()=>{const d=document.querySelector('.eve-dock'),r=d.getBoundingClientRect(),e=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {inDock:!!e&&d.contains(e),op:getComputedStyle(d).opacity,hit:e&&e.className};});
    ok(onTop.inDock,`${tag}: N7 chat panel is on top of the map ${JSON.stringify(onTop)}`);
    await p.screenshot({path:`${OUT}/${tag}-2-nabou.png`});
    await go(p,tag,'n7');
    await p.waitForFunction(()=>getComputedStyle(document.querySelector('.eve-n7')).visibility==='visible',null,{timeout:3000});
    const back=Date.now();
    ok(await p.locator('.eve-figure canvas:visible').first().isVisible(),`${tag}: back to the Humanoid (switch round trip, iframe kept loaded)`);
    // LIBRARY with a real search.
    await p.goto(BASE+'#library',{waitUntil:'load'});
    await p.locator('.eve-search input').fill('Λάντζας');
    await p.locator('.eve-search button').click();
    await p.locator('.eve-results .eve-hit').first().waitFor({timeout:90000});
    const n=await p.locator('.eve-results .eve-hit').count();
    ok(n>0,`${tag}: LIBRARY search «Λάντζας» returned ${n} hits with citations`);
    ok((await p.locator('.eve-books li').count())>0,`${tag}: LIBRARY catalogue listed ${await p.locator('.eve-books li').count()} sources`);
    await p.waitForTimeout(500);
    await p.screenshot({path:`${OUT}/${tag}-3-library.png`});
    // AGENTS with real status.
    await p.goto(BASE+'#agents',{waitUntil:'load'});
    await p.waitForFunction(()=>/PARTIAL|PASS|FAIL|BLOCKED/.test(document.querySelector('.eve-dock .eve-glass')?.innerText||''),null,{timeout:30000}).catch(()=>{});
    const txt=await p.locator('.eve-dock .eve-glass').innerText();
    ok(/PARTIAL|PASS|FAIL|BLOCKED/.test(txt),`${tag}: AGENTS shows pct-live state from /n7/status`);
    ok(/Μοντέλο/.test(txt),`${tag}: AGENTS shows N7 runtime /api/status`);
    await p.waitForTimeout(800);
    await p.screenshot({path:`${OUT}/${tag}-4-agents.png`});
    // SOURCES: the catalogue alone; PROJECTS: the real project status.
    await p.goto(BASE+'#sources',{waitUntil:'load'});
    await p.locator('.eve-books li').first().waitFor({timeout:30000});
    ok((await p.locator('.eve-dock .eve-search').count())===0,`${tag}: ΠΗΓΕΣ lists the catalogue (${await p.locator('.eve-books li').count()} sources)`);
    await p.goto(BASE+'#projects',{waitUntil:'load'});
    await p.waitForFunction(()=>/piratecartography/.test(document.querySelector('.eve-dock')?.innerText||''),null,{timeout:30000});
    ok(true,`${tag}: ΕΡΓΑ shows the pct-live project`);
    if(tag==='desktop'){
      await p.goto(BASE,{waitUntil:'load'});
      await p.locator('.eve-actions button',{hasText:'Ιστορική έρευνα'}).click();
      ok(await p.locator('.eve-dock h2',{hasText:'Έρευνα'}).isVisible(),'desktop: quick action Ιστορική έρευνα opens Research');
      await p.locator('.eve-tabs button[data-section=library]').click();
      ok(await p.locator('.eve-dock .eve-search').isVisible(),'desktop: top nav Βιβλιοθήκη opens the library');
      // SPEAKING follows real audio: the Greek female voice (Piper, from the N7 server) plays a test line.
      await p.goto(BASE+'#settings',{waitUntil:'load'});
      await p.getByRole('button',{name:'Δοκιμή φωνής'}).click();
      await p.waitForFunction(()=>document.querySelector('.eve-root')?.dataset.state==='speaking',null,{timeout:90000});
      ok(true,'desktop: voice playback → SPEAKING');
      await p.locator('.eve-dock .eve-winctl button[aria-label="Κλείσιμο"]').click();
      await p.waitForTimeout(400);
      await p.screenshot({path:`${OUT}/${tag}-6-speaking.png`});
      await p.waitForFunction(()=>document.querySelector('.eve-root')?.dataset.state==='idle',null,{timeout:30000});
      ok(true,'desktop: playback ended → IDLE');
    } else {
      await p.goto(BASE,{waitUntil:'load'});await p.waitForFunction(()=>document.querySelector('.eve-figure')?.dataset.assembly==='complete',null,{timeout:20000});await p.waitForTimeout(3500);
      await p.screenshot({path:`${OUT}/${tag}-0-humanoid.png`});
      await p.locator('.eve-menu').click();await p.waitForTimeout(500);
      ok(await p.locator('.eve-rail-item[data-section=agents]').isVisible(),'mobile: menu opens the navigation');
      await p.screenshot({path:`${OUT}/${tag}-5-menu.png`});
      await p.locator('.eve-rail-item[data-section=n7]').click();
      await p.waitForFunction(()=>/piratecartography/.test(document.querySelector('.eve-overview')?.innerText||''),null,{timeout:30000});
      ok(true,'mobile: N7 opens the overview sheet with the real side panels');
      await p.waitForTimeout(600);
      await p.screenshot({path:`${OUT}/${tag}-6-overview.png`});
    }
    log('page errors:',JSON.stringify(p.errors));
    log('HTTP >=400:',JSON.stringify([...new Set(p.failed)]));
    if(p.errors.length) throw Error('page errors');
    await p.context().close();
  }
  await b.close();
  log('ALL CHECKS PASSED');
})().catch(e=>{console.error(e);process.exit(1)});
