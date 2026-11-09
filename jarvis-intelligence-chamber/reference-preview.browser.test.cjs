// Verify the actual chart, not only the decorative welcome image. No production writes.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const server=http.createServer((req,res)=>{let file=path.join(root,new URL(req.url,'http://local').pathname);if(file.endsWith('/'))file+='index.html';try{const ext=path.extname(file);res.setHeader('content-type',({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.json':'application/json','.bin':'application/octet-stream','.woff2':'font/woff2'})[ext]||'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
 browser=await chromium.launch({headless:true,...(process.env.JARVIS_BROWSER_EXECUTABLE?{executablePath:process.env.JARVIS_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
 const page=await browser.newPage({viewport:{width:1672,height:941},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));

 const snapshot={schema:'pct-command-center-live-v1',run_id:'100',mission:{target:'Algiers',status:'COMPLETED'},agents:[],discoveries:[{title:'Algiers source',url:'https://example.org/algiers',event_year:1600},{title:'Algiers unsafe URL',url:'javascript:alert(1)'}],claims:[],blockers:[],events:[],safety:{automatic_verified:false}};
 let dispatched=false;
 await page.route('**/*',r=>{const u=r.request().url();if(!u.startsWith('https://'))return r.continue();if(u.includes('/dispatch')){dispatched=true;return r.abort();}if(u.includes('raw.githubusercontent.com'))return r.fulfill({json:snapshot});if(u.includes('/status/'))return r.fulfill({json:{snapshot,events:[]}});return r.abort();});await page.routeWebSocket(/.*/,()=>{});
 await page.goto('http://127.0.0.1:'+server.address().port+'/jarvis-intelligence-chamber/reference-preview.html');
 await page.waitForFunction(()=>window.NABOU_REFERENCE);
 await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.locator('#atlasMap image').evaluate(e=>e.href.baseVal.endsWith('mediterranean-art.png')),true);
 assert.equal(await page.locator('.masthead nav a').count(),4);
 assert.equal(await page.locator('.marker').count(),11);
 assert.equal(await page.locator('#placeTitle').innerText(),'Αλγέρι');
 const before=await page.locator('#atlasMap').getAttribute('viewBox');
 await page.locator('#zoomIn').click();
 assert.notEqual(await page.locator('#atlasMap').getAttribute('viewBox'),before);
 await page.locator('#resetMap').click();
 assert.equal(await page.locator('#atlasMap').getAttribute('viewBox'),before);
 await page.getByRole('checkbox',{name:'Λιμάνια',exact:true}).check();
 assert.equal(await page.locator('[data-place=corfu]').isVisible(),true);
 await page.getByRole('checkbox',{name:'Λιμάνια',exact:true}).uncheck();
 assert.equal(await page.locator('[data-place=corfu]').isVisible(),false);
 await page.getByLabel('Από το έτος',{exact:true}).fill('1680');
 await page.getByLabel('Έως το έτος',{exact:true}).fill('1600');
 assert.equal(await page.getByLabel('Από το έτος',{exact:true}).inputValue(),'1600');
 await page.getByLabel('Αναζήτηση τόπου',{exact:true}).fill('βενετια');
 await page.locator('#searchResults button').click();
 assert.equal(await page.locator('#placeTitle').innerText(),'Βενετία');
 await page.locator('#closePlace').click();
 assert.equal(await page.locator('#placePanel').isVisible(),false);
 await page.evaluate(()=>window.NABOU_REFERENCE.select('algiers'));
 await page.locator('#sourcesAction').click();
 await page.getByRole('dialog').waitFor({state:'visible'});
 assert.match(await page.locator('#dialogBody').innerText(),/δεν αποτελούν ιστορική τεκμηρίωση/i);
 assert.equal(await page.locator('#dialogBody a[href^="javascript:"]').count(),0);
 await page.locator('#closeDialog').click();
 await page.getByLabel('Από το έτος',{exact:true}).fill('1500');
 await page.getByLabel('Έως το έτος',{exact:true}).fill('1700');
 await page.getByLabel('Αναζήτηση τόπου',{exact:true}).fill('');
 await page.locator('#placeSearch').evaluate(e=>e.blur());
 const shots=process.env.NABOU_SCREENSHOT_DIR||path.join(__dirname,'screenshots');fs.mkdirSync(shots,{recursive:true});
 await page.setViewportSize({width:1672,height:941});await page.waitForTimeout(300);await page.screenshot({path:path.join(shots,'reference-desktop.png')});
 for(const width of [1440,1024,390,360]){
 await page.setViewportSize({width,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'No horizontal page overflow at '+width);
 if(width<=900){await page.locator('#mobileLayers').click();assert.equal(await page.locator('.layers-panel').isVisible(),true);await page.getByLabel('Αναζήτηση τόπου',{exact:true}).fill('candia');await page.locator('#searchResults button').click();assert.equal(await page.locator('#placeTitle').innerText(),'Κάντια');assert.equal(await page.locator('.layers-panel').isVisible(),false);}
 if(width===390)await page.screenshot({path:path.join(shots,'reference-mobile.png')});
 }
 await page.locator('#contextAction').click();
 await page.waitForFunction(()=>window.N7_READER&&document.body.dataset.readerView==='research');
 assert.match(await page.locator('#operatorQuery').inputValue(),/Κάντια, 1500–1700/);
 assert.equal(dispatched,false,'Opening research must not dispatch a job');
 assert.deepEqual(errors,[]);console.log('PASS faithful preview: artwork, responsive layout, search, layers, dates, zoom, source disclosure and real research handoff without dispatch');
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
