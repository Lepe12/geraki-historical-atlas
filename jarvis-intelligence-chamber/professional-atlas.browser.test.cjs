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
 await page.goto('http://127.0.0.1:'+server.address().port+'/jarvis-intelligence-chamber/?skip=1');
 await page.waitForFunction(()=>document.body.dataset.currentResearchRun==='100');

 await page.waitForFunction(()=>document.body.dataset.proRelief==='ready');
 assert.equal(await page.locator('#atlasExplore, .unified-welcome, .atlas-home-hero, .pro-tools-toggle, .pro-assistant-chat').count(),0,'Old welcome card and floating chrome are not rendered');
 // Nothing positioned over the framed map except the map's own layers and controls.
 const overMap=await page.evaluate(()=>{const slot=document.getElementById('n7MapSlot'),s=slot.getBoundingClientRect(),bad=[];for(const e of document.querySelectorAll('body *')){if(slot.contains(e)||e.contains(slot))continue;const cs=getComputedStyle(e);if(cs.display==='none'||cs.visibility==='hidden'||!['fixed','absolute'].includes(cs.position))continue;const r=e.getBoundingClientRect();if(r.width<8||r.height<8||!e.innerText.trim()&&![...e.querySelectorAll('img,svg,canvas')].some(m=>m.getClientRects().length))continue;if(Math.min(r.right,s.right)-Math.max(r.left,s.left)>4&&Math.min(r.bottom,s.bottom)-Math.max(r.top,s.top)>4)bad.push(e.id||e.className);}return bad;});
 assert.deepEqual(overMap,[],'No panel overlaps the map');
 await page.locator('.n7-nav [data-n7-nav="layers"]').click();
 assert.equal(await page.locator('.pro-place-marker').count(),11);
 const projected=await page.evaluate(()=>window.NABOU_PRO_ATLAS.places.every(p=>{const point=window.NABOU_PRO_ATLAS.project(p.lon,p.lat),marker=document.querySelector('.pro-place-marker[data-place="'+p.id+'"]');return Math.abs(parseFloat(marker.style.left)-point.x)<.01&&Math.abs(parseFloat(marker.style.top)-point.y)<.01;}));
 assert.equal(projected,true,'Every place uses the original geographic projection');
 assert.match(await page.locator('.pro-relief').getAttribute('href'),/^data:image\/png;base64,/);
 await page.getByLabel('Αναζήτηση τόπου',{exact:true}).fill('χανια');
 assert.equal(await page.locator('.pro-place-list button').count(),1);
 await page.locator('.pro-place-list button').click();
 assert.equal(await page.evaluate(()=>window.NABOU_PRO_ATLAS.selected),'chania');
 assert.match(await page.locator('#proPlaceInfo').innerText(),/χρονολογημένη πηγή/);
 assert.match(await page.locator('#proPlaceInfo').innerText(),/Ιστορικές πηγές \(\d+\)/);
 await page.getByLabel('Από το έτος',{exact:true}).fill('1680');
 await page.getByLabel('Έως το έτος',{exact:true}).fill('1600');
 assert.equal(await page.getByLabel('Από το έτος',{exact:true}).inputValue(),'1600');
 await page.locator('.pro-research-place').click();
 assert.match(await page.locator('#operatorQuery').inputValue(),/Χανιά, 1600–1600/);
 assert.equal(await page.locator('body').getAttribute('data-reader-view'),'research');
 await page.locator('.n7-nav [data-atlas-nav="map"]').click();
 await page.getByLabel('Τόποι & λιμάνια',{exact:true}).uncheck();
 assert.equal(await page.locator('body').getAttribute('data-pro-places'),'false');
 await page.getByLabel('Τόποι & λιμάνια',{exact:true}).check();
 // Await the completed transition, rather than the earlier scene-ready flag.
 await page.evaluate(()=>window.NABOU_MAP3D.set(true));
 assert.equal(await page.locator('.pro-3d-place').count(),11);
 assert.ok(await page.locator('.map3d-gl canvas').evaluate(e=>e.width>100));
 await page.evaluate(()=>window.NABOU_MAP3D.set(false));
 await page.getByRole('button',{name:'Άνοιγμα φωνής N7',exact:true}).click();
 await page.locator('.nxa-connect-n7').waitFor({state:'visible'});
 await page.locator('.nxa-x').click();
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Άνοιγμα φωνής N7',exact:true}).click();
 await page.locator('.nxa-connect-n7').waitFor({state:'visible'});
 await page.locator('.nxa-x').click();

 if(!await page.locator('#proMapTools').isVisible())await page.locator('.n7-nav [data-n7-nav="layers"]').click();
 assert.equal(await page.locator('#proMapTools').isVisible(),true);
 await page.getByLabel('Αναζήτηση τόπου',{exact:true}).fill('venice');
 await page.locator('.pro-place-list button').click();
 assert.equal(await page.locator('#proMapTools').isVisible(),false);
 assert.equal(await page.locator('#proPlaceInfo h2').innerText(),'Βενετία');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 assert.deepEqual(errors,[]);
 console.log('PASS visible desktop/mobile voice entry and real voice panel, relief, real place projection, Greek search, bounded dates, research handoff, WebGL place pins and mobile tools');
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
