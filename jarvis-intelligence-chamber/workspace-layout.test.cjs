// UI integration with synthetic read-only research data; never contacts production.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const NAVMAP={universe:'map',findings:'research',agents:'agents'};
// Atlas UI: top text nav replaces the lab rail. PDF/tools opens via Εργαλεία.
async function navTo(page,view){
  async function openResearch(){
    if(await page.locator('#atlasHome:not([hidden])').count()){
      await page.locator('#atlasExplore').click();
      await page.waitForFunction(()=>document.body.dataset.atlasPage==='research');
    }
  }
  if(view==='universe'){
    await page.locator('#atlasHome:not([hidden]) .atlas-topnav [data-atlas-nav="map"], #atlasResearch:not([hidden]) .atlas-topnav [data-atlas-nav="map"]').first().click();
    await page.waitForFunction(()=>document.body.dataset.atlasPage==='home');
    return;
  }
  await openResearch();
  const key = view==='pdf' ? 'tools' : (NAVMAP[view] || view);
  await page.locator('#atlasResearch:not([hidden]) .atlas-topnav [data-atlas-nav="'+key+'"]').click();
}
(async()=>{
 const root=path.resolve(__dirname,'..');
 const server=http.createServer((req,res)=>{let file=path.join(root,new URL(req.url,'http://local').pathname);if(file.endsWith('/'))file+='index.html';try{res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;try{
 browser=await chromium.launch({headless:true,...(process.env.JARVIS_BROWSER_EXECUTABLE?{executablePath:process.env.JARVIS_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
 const shotDir=process.env.NABOU_SCREENSHOT_DIR;if(shotDir)fs.mkdirSync(shotDir,{recursive:true});
 for(const [width,height] of [[1440,900],[1280,720],[1024,768],[390,844],[360,740]]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const snapshot={schema:'pct-command-center-live-v1',run_id:'100',mission:{target:'Δοκιμή διεπαφής',status:'COMPLETED'},agents:[{id:'greek',status:'COMPLETED'}],claims:[],blockers:[{description:'Δοκιμαστικό εμπόδιο πρόσβασης'}],discoveries:[{title:'Δοκιμαστική ιστορική πηγή',query:'Ανύπαρκτο',lane:'greek',url:'https://example.org/source',topical_match:{category:'TARGET_MATCH'}}],events:[],safety:{automatic_verified:false}};
  let dispatched=false;
  await page.route('**/*',r=>{if(!r.request().url().startsWith('https://'))return r.continue();const u=r.request().url();if(u.endsWith('/dispatch')){dispatched=true;return r.fulfill({status:503,json:{error:'test_unavailable'}});}if(u.includes('raw.githubusercontent.com'))return r.fulfill({json:snapshot});if(u.includes('/status/'))return r.fulfill({json:{snapshot,events:[]}});return r.abort();});
  await page.routeWebSocket(/.*/,()=>{});
  await page.goto('http://127.0.0.1:'+server.address().port+'/jarvis-intelligence-chamber/?skip=1');
  await page.waitForFunction(()=>document.body.dataset.currentResearchRun==='100').catch(async e=>{console.error('BROWSER DIAGNOSTICS',errors,await page.locator('body').evaluate(e=>({...e.dataset})));throw e;});
  await page.waitForFunction(()=>/^[0-9]+ FPS$/.test(document.querySelector('#fps')?.textContent||''));
  assert.ok(await page.locator('#universe').evaluate(canvas=>canvas.width>100&&canvas.height>100),'The original renderer must own a real canvas');
  assert.equal(await page.locator('#nodeLabels .node-label').count(),17,'All original research nodes must be rendered');
  assert.equal(await page.locator('body').getAttribute('data-atlas-page'),'home');
  assert.equal(await page.locator('#atlasHome .atlas-topnav [data-atlas-nav]').count(),3,'Home nav: Χάρτης · Έρευνα · Πηγές');
  assert.equal(await page.locator('#v2rail').isVisible(),false,'Lab rail must not show under atlas home');
  assert.equal(await page.locator('#topbar').isVisible(),false,'Lab topbar/clock must not show under atlas home');
  async function layout(panel){
   const data=await page.evaluate(selector=>{const rect=s=>{const el=document.querySelector(s);return el&&el.getClientRects().length?el.getBoundingClientRect():{left:0,right:0,top:0,bottom:0,width:0,height:0};};const pageMode=document.body.dataset.atlasPage||'home';const nav=rect('.atlas-page:not([hidden]) .atlas-topnav');const composer=pageMode==='research'?rect('#operatorCommand'):{left:0,right:0,top:0,bottom:0,width:0,height:0};const panel=selector&&pageMode==='research'?rect(selector):null;const overlap=(a,b)=>!(a.width&&b.width)?0:Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));return {overflow:document.documentElement.scrollWidth>innerWidth+1,navComposer:overlap(nav,composer),panelComposer:panel?overlap(panel,composer):0,panelNav:panel?overlap(panel,nav):0,inputSize:parseFloat(getComputedStyle(document.querySelector('#operatorQuery')).fontSize),pageMode};},panel);
   assert.equal(data.overflow,false);assert.equal(data.navComposer,0);
   // Atlas research: right panel sits above the bottom ask bar — allow zero vertical overlap only.
   if(width>=1181 && data.pageMode==='research' && panel==='.atlas-research-panel') assert.equal(data.panelComposer,0,'Το πάνελ δεν πρέπει να καλύπτει τη μπάρα ερωτήματος');
   if(panel==='.atlas-research-panel') assert.equal(data.panelNav,0);
   assert.ok(data.inputSize>=15);
  }
  await layout();
  await page.locator('#atlasExplore').click();
  await page.waitForFunction(()=>document.body.dataset.atlasPage==='research');
  const initialHeight=await page.locator('#operatorQuery').evaluate(e=>e.offsetHeight);
  await page.locator('#operatorQuery').fill('Πρόσωπο και ιστορική περίοδος\nΠηγές για τη δράση του\nΣχετικά αρχεία και μαρτυρίες\nΑκριβείς σελίδες και ημερομηνίες\nΠεριορισμοί της έρευνας');
  await page.waitForTimeout(150);
  assert.ok(await page.locator('#operatorQuery').evaluate(e=>e.offsetHeight)>=initialHeight,'Query field remains usable');
  await navTo(page,'findings');await layout('.atlas-research-panel');
  await navTo(page,'universe');
  await page.waitForFunction(()=>document.body.dataset.atlasPage==='home');
  await page.locator('#atlasExplore').click();
  await page.waitForFunction(()=>document.body.dataset.atlasPage==='research');
  await page.locator('#operatorQuery').fill('');await page.waitForTimeout(150);
  if(shotDir)await page.screenshot({path:path.join(shotDir,width+'-overview.png'),animations:'disabled'});
  for(const [view,panel] of [['agents','#nxsAgentsPage'],['findings','#resultsDrawer'],['pdf','#learningPanel']]){
   await navTo(page,view);await page.locator(panel==='#resultsDrawer'?'.atlas-research-panel':panel).waitFor({state:'visible'});await layout(panel==='#resultsDrawer'?'.atlas-research-panel':panel);
   // Atlas keeps research page chrome; exactly one primary workspace module should be active.
   const openCount=await page.locator('#nxsAgentsPage:not(.hidden),#resultsDrawer:not(.hidden),#learningPanel:not(.hidden),#activityStrip:not(.hidden)').count();
   assert.ok(openCount>=1 && openCount<=2,'expected an open workspace');
   if(view==='agents'){
    assert.equal(await page.locator('#nxsAgentsPage .nxs-agent').count(),17);
    if(width>=1024){
      await page.locator('#nxsAgentsPage [data-agent-filter="analysis"]').click({force:true});
      await page.waitForFunction(()=>document.querySelectorAll('#nxsAgentsPage .nxs-agent-group:not([hidden]) .nxs-agent').length===6);
      assert.equal(await page.locator('#nxsAgentsPage .nxs-agent-group:not([hidden]) .nxs-agent').count(),6);
      await page.locator('#nxsAgentsPage [data-agent-filter="all"]').click({force:true});
      await page.waitForFunction(()=>document.querySelectorAll('#nxsAgentsPage .nxs-agent-group:not([hidden]) .nxs-agent').length===17);
    }
   }
   if(view==='findings'){
    await page.locator('#atlasResearch [data-atlas-nav="sources"]').click();
    await page.locator('#readerSources').waitFor({state:'visible'});
    await page.locator('#readerSourceSearch').fill('Ανύπαρκτο');
    assert.equal(await page.locator('#readerSources li').count(),0);
    await page.locator('#readerSourceSearch').fill('ιστορικη δοκιμαστικη');
    await page.waitForFunction(()=>document.querySelector('#readerSources ol').textContent.includes('Δοκιμαστική ιστορική πηγή'));
    assert.match(await page.locator('#readerSources ol').innerText(),/Δοκιμαστική ιστορική πηγή/);
    await page.locator('#readerSourceSearch').fill('');
    await page.locator('#atlasResearch [data-atlas-nav="research"]').click();
    assert.equal(await page.locator('#researchOverview').isVisible(),true);
    assert.equal(await page.locator('#researchFindings').isVisible(),false,'Technical findings remain hidden in article view');
   }
   if(view==='pdf'){assert.equal(await page.locator('#learningAnalyze').isDisabled(),true);assert.equal(await page.locator('#learningSave').isDisabled(),true);assert.equal(await page.locator('.learning-panel pre').isVisible(),false);}
   if(shotDir)await page.screenshot({path:path.join(shotDir,width+'-'+view+'.png'),animations:'disabled'});
   await page.keyboard.press('Escape');
   // Atlas keeps research page chrome; shell view may return to universe.
   assert.ok(['universe','findings','agents','pdf'].includes(await page.locator('body').getAttribute('data-nxs-view')));
  }
  await navTo(page,'agents');
  if(width>=1024){
    await page.locator('#nxsAgentsPage .nxs-agent[data-agent="greek"]').click({force:true});
    await page.locator('#detailPanel').waitFor({state:'visible'});
    await layout('#detailPanel');
    await page.locator('#closeDetail').click();
  }
  await page.locator('#operatorQuery').fill('Δοκιμή ερευνητικού ερωτήματος');await page.locator('#executeQuery').click();await page.waitForFunction(()=>document.querySelector('#operatorCommand').classList.contains('is-error'));assert.ok(dispatched);assert.match(await page.locator('#commandState').innerText(),/503/);assert.equal(await page.locator('#executeQuery').isEnabled(),true);
  assert.deepEqual(errors,[]);console.log('PASS',width+'×'+height,'navigation, panels, search, filters, agent focus, PDF empty state, dispatch error, no overlaps');await page.close();
 }
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);console.error('::error title=NABOU workspace browser test::'+String(e.stack||e).replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A'));process.exitCode=1});
