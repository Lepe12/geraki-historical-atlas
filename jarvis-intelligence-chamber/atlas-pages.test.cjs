// Verify the actual chart, not only the decorative welcome image. No production writes.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const server=http.createServer((req,res)=>{let file=path.join(root,new URL(req.url,'http://local').pathname);if(file.endsWith('/'))file+='index.html';try{const ext=path.extname(file);res.setHeader('content-type',({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.json':'application/json','.bin':'application/octet-stream','.woff2':'font/woff2'})[ext]||'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
 browser=await chromium.launch({headless:true,...(process.env.JARVIS_BROWSER_EXECUTABLE?{executablePath:process.env.JARVIS_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const snapshot={schema:'pct-command-center-live-v1',run_id:'100',mission:{target:'Έλεγχος χάρτη',status:'COMPLETED'},agents:[{id:'greek',status:'COMPLETED'}],discoveries:[{title:'Δοκιμαστική ιστορική πηγή',url:'https://example.org/source'}],claims:[],blockers:[],events:[],safety:{automatic_verified:false}};
 await page.route('**/*',r=>{const u=r.request().url();if(!u.startsWith('https://'))return r.continue();if(u.includes('raw.githubusercontent.com'))return r.fulfill({json:snapshot});if(u.includes('/status/'))return r.fulfill({json:{snapshot,events:[]}});return r.abort();});await page.routeWebSocket(/.*/,()=>{});
 await page.goto('http://127.0.0.1:'+server.address().port+'/jarvis-intelligence-chamber/');
 await page.waitForFunction(()=>document.body.dataset.currentResearchRun==='100');
 assert.equal(await page.locator('#atlasHome').isVisible(),true);
 await page.locator('#atlasExplore').hover();
 assert.equal(await page.locator('#atlasExplore').evaluate(e=>getComputedStyle(e).backdropFilter),'none');
 assert.equal(await page.locator('#atlasExplore').evaluate(e=>getComputedStyle(e).backgroundImage),'none');
 await page.locator('#atlasResearch [data-atlas-nav="map"]').hover();
 assert.equal(await page.locator('#atlasResearch [data-atlas-nav="map"]').evaluate(e=>getComputedStyle(e).backgroundImage),'none');
 await page.screenshot({path:path.join(process.env.NABOU_SCREENSHOT_DIR||__dirname,'unified-home.png')});
 await page.locator('#atlasExplore').click();
 await page.waitForFunction(()=>document.body.dataset.readerView==='map');
 assert.equal(await page.locator('#atlasHome').isVisible(),false);
 assert.equal(await page.locator('.atlas-research-panel').isVisible(),false);
 assert.equal(await page.locator('#chartFrame').isVisible(),true);
 assert.equal(await page.locator('#nodeLabels .node-label').count(),17);
 const visibleAgents=await page.locator('#nodeLabels .node-label').evaluateAll(es=>es.filter(e=>getComputedStyle(e).visibility==='visible'&&e.getBoundingClientRect().width>0).length);
 assert.ok(visibleAgents>=5,'Researcher emblems must be visibly rendered on the real map');
 await page.waitForTimeout(500);
 const bounds=await page.evaluate(()=>{const C=window.NABOU_CHART,plane=document.querySelector('#chartPlane'),p=plane.getBoundingClientRect(),frame=document.querySelector('#chartView').getBoundingClientRect();const scale=p.width/C.W,M=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))*180/Math.PI;return [[-5.5,36],[35.5,34]].map(([lon,lat])=>{const x=p.left+(lon-C.lon0)*C.k*scale,y=p.top+(C.my1-M(lat))*C.k*scale;return x>=frame.left-2&&x<=frame.right+2&&y>=frame.top-2&&y<=frame.bottom+2;});});
 assert.deepEqual(bounds,[true,true],'Gibraltar and the Levant must both be inside the chart');
 const transform=await page.locator('#chartPlane').getAttribute('style');
 await page.locator('#zoomIn').click();await page.waitForFunction(old=>document.querySelector('#chartPlane').getAttribute('style')!==old,transform,{timeout:10000});
 assert.notEqual(await page.locator('#chartPlane').getAttribute('style'),transform,'Zoom acts on the actual chart');
 await page.locator('#resetView').click();
 await page.locator('#atlasResearch [data-atlas-nav="research"]').click();
 assert.equal(await page.locator('#researchOverview').isVisible(),true);
 await page.locator('#atlasCloseResearch').click();
 assert.equal(await page.locator('.atlas-research-panel').isVisible(),false);
 assert.equal(await page.locator('#chartFrame').isVisible(),true);
 await page.locator('#nodeLabels .node-label').filter({visible:true}).first().click();
 await page.locator('#detailPanel').waitFor({state:'visible'});
 await page.locator('#closeDetail').click();
 await page.waitForFunction(()=>document.body.dataset.readerView==='map');
 // Real WebGL, terrain scene and researcher pins, not a mocked enabled checkbox.
 assert.equal(await page.evaluate(()=>window.NABOU_MAP3D.supported),true,'Chromium test must provide WebGL');
 await page.locator('#map3dToggle').click();
 await page.waitForFunction(()=>window.NABOU_MAP3D.enabled&&window.NABOU_MAP3D.ready,null,{timeout:90000});
 await page.locator('.map3d-gl.shown').waitFor({state:'visible'});
 assert.ok(await page.locator('.map3d-canvas').evaluate(e=>e.width>100&&e.height>100));
 assert.equal(await page.locator('.map3d-pin').count(),17);
 const shots=process.env.NABOU_SCREENSHOT_DIR||path.join(__dirname,'screenshots');fs.mkdirSync(shots,{recursive:true});
 await page.waitForTimeout(800);await page.screenshot({path:path.join(shots,'restored-live-map-3d.png')});
 await page.locator('#map3dToggle').click();
 await page.waitForFunction(()=>!window.NABOU_MAP3D.enabled);
 await page.waitForTimeout(600);
 await page.screenshot({path:path.join(shots,'restored-live-map-2d.png')});
 for(const width of [390,360]){
  await page.setViewportSize({width,height:844});
  await page.locator('#atlasResearch [data-atlas-nav="sources"]').click();
  await page.locator('#readerSources').waitFor({state:'visible'});
  await page.locator('#atlasResearch [data-atlas-nav="map"]').click();
  assert.equal(await page.locator('.atlas-research-panel').isVisible(),false);
  assert.equal(await page.locator('#chartFrame').isVisible(),true);
  for(const id of ['zoomIn','zoomOut','resetView','map3dToggle'])assert.equal(await page.locator('#'+id).isVisible(),true);
  await page.getByRole('button',{name:'N7 · Αρχική σελίδα',exact:true}).click();
  assert.equal(await page.locator('#atlasHome').isVisible(),true);
  await page.locator('#atlasExplore').click();
 }
 assert.deepEqual(errors,[]);console.log('PASS real chart navigation, Gibraltar–Levant bounds, emblems, zoom, actual WebGL 3D and mobile controls');
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
