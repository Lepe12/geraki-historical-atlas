// UI integration with synthetic read-only research data; never contacts production.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const server=http.createServer((req,res)=>{let file=path.join(root,new URL(req.url,'http://local').pathname);if(file.endsWith('/'))file+='index.html';try{res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;try{
 browser=await chromium.launch({headless:true,...(process.env.JARVIS_BROWSER_EXECUTABLE?{executablePath:process.env.JARVIS_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
 const shotDir=process.env.NABOU_SCREENSHOT_DIR;if(shotDir)fs.mkdirSync(shotDir,{recursive:true});
 for(const [width,height] of [[1440,900],[1024,768],[390,844],[360,740]]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const snapshot={schema:'pct-command-center-live-v1',run_id:'100',mission:{target:'Δοκιμή διεπαφής',status:'COMPLETED'},agents:[{id:'greek',status:'COMPLETED'}],claims:[],blockers:[{description:'Δοκιμαστικό εμπόδιο πρόσβασης'}],discoveries:[{title:'Δοκιμαστική ιστορική πηγή',lane:'greek',url:'https://example.org/source',topical_match:{category:'TARGET_MATCH'}}],events:[],safety:{automatic_verified:false}};
  let dispatched=false;
  await page.route('**/*',r=>{if(!r.request().url().startsWith('https://'))return r.continue();const u=r.request().url();if(u.endsWith('/dispatch')){dispatched=true;return r.fulfill({status:503,json:{error:'test_unavailable'}});}if(u.includes('raw.githubusercontent.com'))return r.fulfill({json:snapshot});if(u.includes('/status/'))return r.fulfill({json:{snapshot,events:[]}});return r.abort();});
  await page.routeWebSocket(/.*/,()=>{});
  await page.goto('http://127.0.0.1:'+server.address().port+'/jarvis-intelligence-chamber/');
  await page.waitForFunction(()=>document.body.dataset.currentResearchRun==='100').catch(async e=>{console.error('BROWSER DIAGNOSTICS',errors,await page.locator('body').evaluate(e=>({...e.dataset})));throw e;});
  await page.waitForFunction(()=>/^[0-9]+ FPS$/.test(document.querySelector('#fps')?.textContent||''));
  assert.ok(await page.locator('#universe').evaluate(canvas=>canvas.width>100&&canvas.height>100),'The original renderer must own a real canvas');
  assert.equal(await page.locator('#nodeLabels .node-label').count(),17,'All original research nodes must be rendered');
  assert.equal(await page.locator('.nxs-dock button').count(),4);
  async function layout(panel){
   const data=await page.evaluate(selector=>{const rect=s=>document.querySelector(s).getBoundingClientRect();const nav=rect('.nxs-dock'),composer=rect('#operatorCommand'),panel=selector?rect(selector):null;const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));return {overflow:document.documentElement.scrollWidth>innerWidth,navComposer:overlap(nav,composer),panelComposer:panel?overlap(panel,composer):0,panelNav:panel?overlap(panel,nav):0,inputSize:parseFloat(getComputedStyle(document.querySelector('#operatorQuery')).fontSize)};},panel);
   assert.equal(data.overflow,false);assert.equal(data.navComposer,0);assert.equal(data.panelComposer,0);assert.equal(data.panelNav,0);assert.ok(data.inputSize>=15);
  }
  await layout();
  if(shotDir)await page.screenshot({path:path.join(shotDir,width+'-overview.png'),animations:'disabled'});
  for(const [view,panel] of [['agents','#nxsAgentsPage'],['findings','#resultsDrawer'],['pdf','#learningPanel']]){
   await page.locator('button[data-nxs-view="'+view+'"]').click();await page.locator(panel).waitFor({state:'visible'});await layout(panel);
   assert.equal(await page.locator('.nxs-workspace:not(.hidden),.results-drawer:not(.hidden),.learning-panel:not(.hidden),.activity-strip:not(.hidden)').count(),1);
   if(view==='agents'){
    assert.equal(await page.locator('.nxs-agent').count(),17);
    await page.locator('[data-agent-filter="analysis"]').click();assert.equal(await page.locator('.nxs-agent:visible').count(),6);
    await page.locator('[data-agent-filter="all"]').click();
   }
   if(view==='findings'){
    await page.locator('#resultSearch').fill('Ανύπαρκτο');assert.match(await page.locator('#resultsList').innerText(),/Δεν υπάρχουν/);
    await page.locator('#resultSearch').fill('');assert.match(await page.locator('#resultsList').innerText(),/Δοκιμαστική ιστορική πηγή/);
    await page.locator('[data-result-filter="blockers"]').click();assert.match(await page.locator('#resultsList').innerText(),/εμπόδιο πρόσβασης/);
    await page.locator('[data-result-filter="all"]').click();
    await page.locator('.result-options summary').click();assert.ok(await page.locator('#researchRunId').isVisible());await page.locator('.result-options summary').click();await page.locator('.inspect-result').click();await page.locator('#focusDiscovery').click();await page.locator('#detailPanel').waitFor({state:'visible'});assert.equal(await page.locator('#resultsDrawer').isVisible(),false);await page.locator('#closeDetail').click();await page.locator('button[data-nxs-view="findings"]').click();
   }
   if(view==='pdf'){assert.equal(await page.locator('#learningAnalyze').isDisabled(),true);assert.equal(await page.locator('#learningSave').isDisabled(),true);assert.equal(await page.locator('.learning-panel pre').isVisible(),false);}
   if(shotDir)await page.screenshot({path:path.join(shotDir,width+'-'+view+'.png'),animations:'disabled'});
   await page.keyboard.press('Escape');assert.equal(await page.locator('body').getAttribute('data-nxs-view'),'universe');
  }
  await page.locator('button[data-nxs-view="agents"]').click();await page.locator('.nxs-agent[data-agent="greek"]').click();await page.locator('#detailPanel').waitFor({state:'visible'});assert.equal(await page.locator('body').getAttribute('data-nxs-view'),'universe');await layout('#detailPanel');await page.locator('#closeDetail').click();
  await page.locator('#operatorQuery').fill('Δοκιμή ερευνητικού ερωτήματος');await page.locator('#executeQuery').click();await page.waitForFunction(()=>document.querySelector('#operatorCommand').classList.contains('is-error'));assert.ok(dispatched);assert.match(await page.locator('#commandState').innerText(),/503/);assert.equal(await page.locator('#executeQuery').isEnabled(),true);
  assert.deepEqual(errors,[]);console.log('PASS',width+'×'+height,'navigation, panels, search, filters, agent focus, PDF empty state, dispatch error, no overlaps');await page.close();
 }
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);console.error('::error title=NABOU workspace browser test::'+String(e.stack||e).replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A'));process.exitCode=1});
