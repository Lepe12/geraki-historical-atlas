// «Η έρευνά μου» in a real browser with the live server blocked (as with CORS). Synthetic responses only:
// the dispatch is answered by the test itself, nothing reaches pct-live, GitHub or any production service.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
(async()=>{const root=path.resolve(__dirname,'..');const server=http.createServer((req,res)=>{let file=path.join(root,new URL(req.url,'http://local').pathname);if(file.endsWith('/'))file+='index.html';try{res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.svg')?'image/svg+xml':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;try{
 browser=await chromium.launch({executablePath:process.env.JARVIS_BROWSER_EXECUTABLE||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
 const ctx=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const QUESTION='Βρες στοιχεία για τον Κρεβελιέ τον κουρσάρο';
 const base={schema:'pct-command-center-live-v1',project:'piratecartography',agents:[],claims:[],blockers:[],events:[],safety:{automatic_verified:false}};
 const old={...base,run_id:'100',mission:{target:'Παλιά έρευνα για τον Λάντζα',purpose:'Παλιά έρευνα για τον Λάντζα',status:'PARTIAL'},discoveries:[{title:'Παλιό εύρημα',topical_match:{category:'TARGET_MATCH'}}]};
 const own={...base,run_id:'200',request_id:'own-req',mission:{target:QUESTION,purpose:QUESTION,status:'PARTIAL'},discoveries:[],research_answer:{greek_narrative:{schema:'pct-greek-narrative-v1',status:'NO_USABLE_EVIDENCE',title_el:QUESTION,paragraphs:[],sources:[],map_places:[]}}};
 let latest=old,dispatches=0,liveCalls=0;const runs=[{run_id:'100',target:old.mission.target,status:'PARTIAL',generated_utc:'2026-11-06T20:45:16Z'}];
 await ctx.route('**/*',route=>{const url=route.request().url();
  if(url.split('?')[0].endsWith('/command-center/live/index.json'))return route.fulfill({json:{schema:'nabou-research-history-v1',runs}});
  if(url.startsWith('http://127.0.0.1'))return route.continue();
  if(url.startsWith('https://pct-live.piratecartography.com/')){if(url.endsWith('/dispatch')){dispatches++;return route.fulfill({status:202,json:{request_id:'own-req'}});}liveCalls++;return route.abort('accessdenied');}
  if(url.startsWith('https://raw.githubusercontent.com/'))return route.fulfill({json:url.includes('/runs/200.json')?own:url.includes('/runs/100.json')?old:latest});
  return route.abort();});
 await ctx.routeWebSocket(/.*/,ws=>ws.close());
 const url='http://127.0.0.1:'+server.address().port+'/jarvis-intelligence-chamber/?skip=1';
 await page.goto(url);await page.waitForFunction(()=>document.body.dataset.currentResearchRun==='100');
 await page.locator('#n7Shell [data-atlas-nav="research"]').click();await page.waitForFunction(()=>document.body.dataset.readerView==='research');
 // The map stays beside the research panel (no hidden map slot, panel to its right).
 const map=await page.locator('#n7MapSlot').boundingBox(),panel=await page.locator('#atlasResearch .atlas-research-panel').boundingBox();
 assert.equal(await page.locator('#n7MapSlot').evaluate(e=>getComputedStyle(e).visibility),'visible');assert.ok(map.width>500,'map keeps a real width: '+map.width);assert.ok(panel.x>=map.x+map.width-2,'panel sits beside the map, not over it');
 // Enter alone never sends; only «Έναρξη έρευνας» does.
 await page.locator('#operatorQuery').fill(QUESTION);await page.locator('#operatorQuery').press('Enter');await page.waitForTimeout(200);assert.equal(dispatches,0,'Enter must not send');
 await page.locator('#executeQuery').click();await page.waitForFunction(()=>document.body.dataset.dispatchRequest==='own-req');assert.equal(dispatches,1);
 await page.waitForFunction(q=>document.querySelector('#researchOverview .my-research h2')?.textContent===q,QUESTION);
 let text=await page.locator('#researchOverview').innerText();assert.match(text,/Τρέχει τώρα/);assert.match(text,/20–90 λεπτά/);assert.ok(!text.includes('Λάντζα'),'old global run is not shown as mine');assert.ok(!/δευτ\./.test(await page.locator('#commandState').innerText()),'no seconds counter');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('nabou-my-research-v1')));assert.equal(saved.query,QUESTION);assert.equal(saved.request_id,'own-req');assert.ok(saved.started_at>0);
 // Reload: the own question comes back, it is not sent again, and the old latest run does not take over.
 await page.reload();await page.locator('#n7Shell [data-atlas-nav="research"]').click();
 await page.waitForFunction(q=>document.querySelector('#researchOverview .my-research h2')?.textContent===q,QUESTION);
 await page.waitForTimeout(500);text=await page.locator('#researchOverview').innerText();assert.ok(!text.includes('Λάντζα'));assert.match(await page.locator('#commandState').innerText(),/Η έρευνά σου τρέχει/);assert.equal(dispatches,1,'a reload never re-sends the question');
 assert.match(text,/δεν βλέπουμε ζωντανά/,'blocked live server is said plainly');
 // Published on GitHub while the live server stays blocked: the fallback still brings the own run.
 latest=own;await page.reload();await page.locator('#n7Shell [data-atlas-nav="research"]').click();
 await page.waitForFunction(()=>document.body.dataset.currentResearchRun==='200',null,{timeout:15000});
 await page.waitForFunction(()=>/ολοκληρώθηκε/.test(document.querySelector('#researchOverview').textContent));text=await page.locator('#researchOverview').innerText();assert.match(text,/Δεν βγήκε ιστορία από αυτή την έρευνα/);
 assert.equal(new URL(page.url()).searchParams.get('run'),'200');
 // Back to a newer global latest on a bare URL: the own finished run still opens first.
 latest={...old,run_id:'300',mission:{...old.mission,target:'Ξένη νεότερη έρευνα'}};await page.goto(url+'&view=research');
 await page.waitForFunction(()=>document.body.dataset.currentResearchRun==='200',null,{timeout:15000});assert.ok(!(await page.locator('#researchOverview').innerText()).includes('Ξένη νεότερη'));
 // A finished run without a story says so in Πρόσωπα instead of «not ready yet».
 await page.locator('#n7Shell [data-atlas-nav="map"]').click();await page.locator('#n7Shell [data-nx-go="people"]').first().click();
 await page.waitForFunction(()=>!document.getElementById('narrativeStoryPanel')?.hidden);const story=await page.locator('#narrativeStoryPanel').innerText();assert.ok(!/δεν είναι ακόμη έτοιμη/.test(story),story);
 assert.deepEqual(errors,[]);assert.equal(dispatches,1);
 if(process.env.NABOU_SCREENSHOT_DIR){fs.mkdirSync(process.env.NABOU_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.NABOU_SCREENSHOT_DIR,'research-progress-people.png')});}
 console.log('PASS own question persists across reload, map stays beside the panel, GitHub fallback with live blocked, honest no-story copy; live GETs blocked:',liveCalls);
 }finally{await browser?.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
