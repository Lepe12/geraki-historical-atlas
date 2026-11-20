'use strict';
// NABOU_INTERFACE_V2 browser test. Real index.html, real data.json, real MapLibre 4.7.1 (npm), real
// N7 scripts. Network is replaced by fixtures: base map = Natural Earth land (TEST FIXTURE), no DEM tiles.
// Env: REPO (atlas checkout), NM (node_modules: maplibre-gl@4.7.1, world-atlas, topojson-client,
// @fortawesome/fontawesome-free@6.4.0, @fontsource/plus-jakarta-sans), ICONS (output of generate_diorama_assets.py:
// _site/icons), SHOTS (screenshot dir), optional CHROME (browser executable).
// Part A: preview origin (raw.githack.com) — standalone interface. Part B: N7 embed on the Pages origin,
// driven from a page on the real N7 origin string (postMessage origin checks are the production ones).
let pw;try{pw=require('playwright');}catch{pw=require('playwright-core');}const {chromium}=pw;
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const REPO=process.env.REPO,NM=process.env.NM,ICONS=process.env.ICONS,SHOTS=process.env.SHOTS;
const BRANCH='nabou-interface-redesign';
const PREVIEW='https://raw.githack.com/Lepe12/geraki-historical-atlas/'+BRANCH+'/';
const PAGES='https://lepe12.github.io/geraki-historical-atlas/';
const BOT='https://bot.piratecartography.com';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const data=JSON.parse(fs.readFileSync(path.join(REPO,'data.json'),'utf8'));
const corfu=data.places.find(p=>p.id==='rec1ocg1Hina4wpFp');
const results=[];const ok=(name,detail='')=>{results.push(['PASS',name,detail]);console.log('PASS',name,detail);};

function style(){
  const topo=require(path.join(NM,'topojson-client'));
  const land=topo.feature(require(path.join(NM,'world-atlas/land-10m.json')),'land');
  const sea={type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[-30,20],[60,20],[60,60],[-30,60],[-30,20]]]}};
  return {version:8,name:'TEST FIXTURE',sources:{sea:{type:'geojson',data:sea},land:{type:'geojson',data:land}},
    layers:[{id:'background',type:'background',paint:{'background-color':'#c8aa70'}},{id:'water',type:'fill',source:'sea',paint:{'fill-color':'#4f7f88'}},
      {id:'landcover',type:'fill',source:'land',paint:{'fill-color':'#c8aa70'}}]};
}
const file=(f,ct)=>fs.existsSync(f)?{status:200,contentType:ct||MIME[path.extname(f)]||'application/octet-stream',body:fs.readFileSync(f)}:{status:404,body:'not found'};
async function routes(ctx){
  await ctx.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.protocol==='data:')return route.continue();
    let r=null;
    if(u.host==='raw.githack.com'&&u.pathname.startsWith('/Lepe12/geraki-historical-atlas/'+BRANCH+'/')){
      let rel=decodeURIComponent(u.pathname.slice(('/Lepe12/geraki-historical-atlas/'+BRANCH+'/').length))||'index.html';
      r=file(path.join(REPO,rel)); // icons/diorama-* are NOT in the repo: preview must fall back to Pages
    }else if(u.host==='lepe12.github.io'&&u.pathname.startsWith('/geraki-historical-atlas/')){
      let rel=decodeURIComponent(u.pathname.slice('/geraki-historical-atlas/'.length))||'index.html';
      if(rel.startsWith('icons/')&&fs.existsSync(path.join(ICONS,path.basename(rel))))r=file(path.join(ICONS,path.basename(rel)));
      else r=file(path.join(REPO,rel));
    }else if(u.host==='unpkg.com'&&u.pathname.startsWith('/maplibre-gl@4.7.1/dist/')){
      r=file(path.join(NM,'maplibre-gl/dist',path.basename(u.pathname)));
    }else if(u.host==='tiles.openfreemap.org'){
      r={status:200,contentType:'application/json',body:JSON.stringify(style())};
    }else if(u.host==='cdnjs.cloudflare.com'&&u.pathname.startsWith('/ajax/libs/font-awesome/6.4.0/')){
      r=file(path.join(NM,'@fortawesome/fontawesome-free',u.pathname.slice('/ajax/libs/font-awesome/6.4.0/'.length)));
    }else if(u.host==='fonts.googleapis.com'){
      const f=(fam,pkg,w)=>`@font-face{font-family:'${fam}';font-weight:${w};src:url(https://fonts.gstatic.com/fx/${pkg}/${pkg}-greek-${w.split(' ')[0]}-normal.woff2) format('woff2'),url(https://fonts.gstatic.com/fx/${pkg}/${pkg}-latin-${w.split(' ')[0]}-normal.woff2) format('woff2')}`;
      r={status:200,contentType:'text/css',body:[`@font-face{font-family:'Plus Jakarta Sans';font-weight:300 800;src:url(https://fonts.gstatic.com/fx/plus-jakarta-sans/plus-jakarta-sans-latin-400-normal.woff2) format('woff2')}`].join('\n')};
    }else if(u.host==='fonts.gstatic.com'&&u.pathname.startsWith('/fx/')){
      const [, ,pkg,name]=u.pathname.split('/');r=file(path.join(NM,'@fontsource',pkg,'files',name));
    }else if(u.host==='bot.piratecartography.com'&&u.pathname==='/harness'){
      r={status:200,contentType:'text/html',body:'<!doctype html><meta charset=utf-8><body style="margin:0;background:#081014"><div style="height:120px;color:#bff6ff;font:14px system-ui;padding:12px">N7 harness (test page on the N7 origin)</div><iframe id=f style="border:0;width:100%;height:calc(100vh - 120px)"></iframe></body>'};
    }
    if(!r){return route.fulfill({status:404,body:''});}
    return route.fulfill(r);
  });
}

(async()=>{
  fs.mkdirSync(SHOTS,{recursive:true});
  const browser=await chromium.launch({executablePath:process.env.CHROME||undefined,args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  /* ── Part A: standalone interface on the preview origin ── */
  const ctx=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
  await routes(ctx);
  const page=await ctx.newPage();const errors=[];
  page.on('pageerror',e=>errors.push('pageerror: '+e.message));
  page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|404/.test(m.text()))errors.push('console: '+m.text());});
  await page.goto(PREVIEW+'index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.NABOU_MAP?.ready?.(),null,{timeout:60000});
  await page.waitForTimeout(1500);
  ok('map ready on preview origin');
  const markers=await page.evaluate(()=>document.querySelectorAll('#realMap .settlement-wrap,#realMap .label-only').length);
  assert.ok(markers>=40,'markers '+markers);ok('real data.json markers drawn',String(markers));
  await page.waitForFunction(()=>[...document.querySelectorAll('.settlement-img')].every(i=>i.complete&&i.naturalWidth>0),null,{timeout:15000}).catch(()=>{});
  const imgs=await page.evaluate(()=>[...document.querySelectorAll('.settlement-img')].map(i=>({ok:i.complete&&i.naturalWidth>0,src:i.currentSrc})));
  assert.ok(imgs.length&&imgs.every(i=>i.ok),'settlement art loaded: '+JSON.stringify(imgs.filter(i=>!i.ok).slice(0,3)));
  assert.ok(imgs.every(i=>i.src.startsWith('https://lepe12.github.io/')),'preview uses published icons');
  ok('settlement artwork falls back to published Pages icons',imgs.length+' images');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('nbNeocom')).display),'flex');
  assert.ok(await page.evaluate(()=>document.querySelectorAll('#nbTlTrack .year-btn').length)>=5);ok('Neocom, top bar and timeline rendered');
  assert.ok(await page.evaluate(()=>!!atlasMap.getLayer('atlas-relief')&&!!atlasMap.getTerrain()));ok('3D terrain + hillshade still configured');
  await page.screenshot({path:SHOTS+'/01-desktop-overview.png'});

  // Search (Greek, accent-insensitive) + keyboard selection → existing focusPlace flyTo.
  await page.click('#searchInput');await page.keyboard.type('κερκυρα');
  await page.waitForSelector('#searchResults:not(.hidden) .nb-sr-item');
  const first=await page.textContent('#searchResults .nb-sr-item .nb-sr-name');assert.match(first,/Κέρκυρα/);ok('search finds Κέρκυρα by Greek name',first);
  await page.screenshot({path:SHOTS+'/02-search.png'});
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  await page.waitForFunction(()=>{const c=atlasMap.getCenter();return Math.abs(c.lng-19.9217)<.2&&Math.abs(c.lat-39.6243)<.2&&!atlasMap.isMoving();},null,{timeout:15000});
  ok('map flew to Corfu (existing focusPlace)');
  assert.equal(await page.isVisible('#nbDock'),true);
  assert.match(await page.textContent('#nbDockBody .nb-card-name'),/Κέρκυρα/);
  assert.match(await page.textContent('#nbDockBody'),/Major trilogy hub/);
  assert.ok(await page.evaluate(()=>!!document.querySelector('[data-place-id="rec1ocg1Hina4wpFp"][data-nb-selected]')));
  ok('history panel shows stored Corfu record; marker highlighted');
  const n7=await page.getAttribute('#nbN7Link','href');const pay=JSON.parse(decodeURIComponent(n7.split('#atlas=')[1]));
  assert.equal(pay.schema,'n7-atlas-handoff/v1');assert.equal(pay.place,'Κέρκυρα');assert.ok(pay.from>=1500&&pay.to<=1700&&pay.from<=pay.to);
  ok('N7 handoff link carries n7-atlas-handoff/v1',JSON.stringify(pay));
  await page.waitForTimeout(600);await page.screenshot({path:SHOTS+'/03-place-corfu.png'});

  // Every panel opens with real content.
  for(const [id,re] of [['settlements',/Οικισμοί/],['monuments',/Μνημεία/],['people',/Πρόσωπα/],['routes',/Διαδρομές/],['sources',/Ιστορικές πηγές/],['history',/Κέρκυρα/]]){
    await page.click(`.nb-nc-btn[data-panel="${id}"]`);
    assert.match(await page.textContent(id==='history'?'#nbDockBody .nb-card-name':'#nbDockTitle'),re);
    const n=await page.evaluate(()=>document.querySelectorAll('#nbDockBody .nb-item,#nbDockBody .nb-person-card,#nbDockBody .nb-source,#nbDockBody .nb-card').length);
    assert.ok(n>0,id+' has items');ok('panel '+id,n+' items');
    if(id==='people'||id==='routes')await page.screenshot({path:SHOTS+`/04-panel-${id}.png`});
  }
  // Route from panel → route view + highlight layer filter.
  await page.click('.nb-nc-btn[data-panel="routes"]');await page.click('#nbDockBody .nb-item');
  await page.waitForFunction(()=>!atlasMap.isMoving());
  assert.match(await page.textContent('#nbDockKicker'),/ταξίδι|ανασύνθεση|Δίκτυο|Σχεδιασμένο/);
  assert.ok(await page.evaluate(()=>JSON.stringify(atlasMap.getFilter('nb-route-focus')).includes('rec')));ok('route view + route highlight');
  await page.screenshot({path:SHOTS+'/05-route.png'});

  // Timeline year filter uses the atlas's own state/render.
  const before=markers;
  await page.click('#nbTlTrack .year-btn[data-year="1577"]');
  const y=await page.evaluate(()=>({y:state.year,n:document.querySelectorAll('#realMap .settlement-wrap,#realMap .label-only').length}));
  assert.equal(y.y,'1577');assert.ok(y.n<before&&y.n>0);ok('timeline 1577 filters markers',before+' → '+y.n);
  await page.click('.book-btn[data-book="Book III"]');
  assert.equal(await page.evaluate(()=>state.book),'Book III');ok('book filter (existing handler) + UI follow');
  await page.screenshot({path:SHOTS+'/06-filtered.png'});
  await page.click('.nb-tl-all');await page.click('.book-btn[data-book="All"]');
  assert.equal(await page.evaluate(()=>state.year+state.book),'AllAll');

  // Layers: route layer visibility, status filter (CSS), ships.
  await page.click('#nbLayersToggle');assert.equal(await page.isVisible('#nbLayers'),true);
  await page.screenshot({path:SHOTS+'/07-layers.png'});
  const sw=await page.$$('#nbLayersBody .nb-switch input');
  await sw[2].click();assert.equal(await page.evaluate(()=>atlasMap.getLayoutProperty('atlas-routes','visibility')),'none');await sw[2].click();
  assert.equal(await page.evaluate(()=>atlasMap.getLayoutProperty('atlas-routes','visibility')),'visible');
  await sw[6].click();const vis=await page.evaluate(()=>[...document.querySelectorAll('[data-coordinate-status="APPROXIMATE"]')].filter(e=>getComputedStyle(e).display!=='none').length);
  assert.equal(vis,0);await sw[6].click();ok('layer toggles: routes, approximate points');
  await page.keyboard.press('Escape');assert.equal(await page.isVisible('#nbLayers'),false);

  // Neocom expand + dock close, map resize.
  await page.click('#nbNeocomExpand');await page.waitForTimeout(400);
  await page.waitForFunction(()=>document.getElementById('nbNeocom').getBoundingClientRect().width>190,null,{timeout:5000});
  await page.screenshot({path:SHOTS+'/08-neocom-expanded.png'});
  await page.click('#nbNeocomExpand');await page.click('#nbDockClose');assert.equal(await page.isVisible('#nbDock'),false);ok('Neocom expand/collapse, dock close');
  // Marker click (existing handler) opens the record.
  await page.evaluate(()=>{fitAll();});await page.waitForFunction(()=>!atlasMap.isMoving());
  await page.evaluate(()=>document.querySelector('[data-place-id="rec1ocg1Hina4wpFp"]').click());
  assert.match(await page.textContent('#nbDockBody .nb-card-name'),/Κέρκυρα/);ok('marker click opens record panel');

  // Tablet sizes.
  for(const [w,hh,n] of [[1024,768,'09-tablet-landscape'],[820,1180,'10-tablet-portrait']]){
    await page.setViewportSize({width:w,height:hh});await page.waitForTimeout(700);
    const ov=await page.evaluate(()=>{const r=document.getElementById('nbTopbar').getBoundingClientRect();return document.getElementById('nbTopbar').scrollWidth<=r.width+1;});
    assert.ok(ov,'topbar fits at '+w);await page.screenshot({path:SHOTS+'/'+n+'.png'});ok('responsive '+w+'×'+hh);
  }
  assert.deepEqual(errors,[]);ok('no page errors (standalone)');
  await ctx.close();

  /* ── Part B: N7 embed contract (Pages origin inside a page on the N7 origin) ── */
  const ctx2=await browser.newContext({viewport:{width:1440,height:900}});await routes(ctx2);
  const bot=await ctx2.newPage();const errs2=[];bot.on('pageerror',e=>errs2.push(e.message));
  await bot.goto(BOT+'/harness');
  const nonce='0123456789abcdef0123456789abcdef';
  await bot.evaluate(([url,nonce])=>{window.msgs=[];addEventListener('message',e=>{if(e.origin==='https://lepe12.github.io')window.msgs.push(e.data);});
    document.getElementById('f').src=url+'#n7map='+encodeURIComponent(JSON.stringify({schema:'n7-map/v1',nonce,origin:'https://bot.piratecartography.com',embed:true}));},[PAGES,nonce]);
  await bot.waitForFunction(()=>window.msgs.some(m=>m.type==='ready'&&m.records?.length>0),null,{timeout:60000});
  const ready=await bot.evaluate(()=>window.msgs.find(m=>m.type==='ready'));
  assert.equal(ready.records.length,data.places.length);ok('N7 ready message with all records',String(ready.records.length));
  const frame=bot.frames().find(f=>f.url().startsWith(PAGES));
  assert.equal(await frame.evaluate(()=>getComputedStyle(document.getElementById('nbNeocom')).display),'none');
  assert.ok(await frame.isVisible('.n7e-bar'));ok('embed: shell hidden, NABOU side bar mounted');
  const id='11111111-2222-3333-4444-555555555555';
  await bot.evaluate(([nonce,id,placeId])=>document.getElementById('f').contentWindow.postMessage({schema:'n7-map/v1',nonce,type:'map_focus',id,placeId},'https://lepe12.github.io'),[nonce,id,corfu.id]);
  await bot.waitForFunction(id=>window.msgs.some(m=>m.type==='ack'&&m.id===id),id,{timeout:20000});
  const ack=await bot.evaluate(id=>window.msgs.find(m=>m.type==='ack'&&m.id===id),id);
  assert.equal(ack.ok,true);assert.equal(ack.state.selected,corfu.id);assert.ok(Math.abs(ack.state.camera.lng-corfu.lon)<.05);
  ok('N7 map_focus → ack ok, camera on Corfu',JSON.stringify(ack.state.camera));
  assert.match(await frame.textContent('#n7ePlace'),/Κέρκυρα/);assert.ok(await frame.isVisible('#n7eBadge'));
  assert.equal(await frame.isVisible('#nbDock'),false);ok('embed place card + "Αποτέλεσμα από το N7" badge; atlas dock stays hidden');
  await frame.click('.n7e-tab[data-tab="history"]');assert.match(await frame.textContent('#n7eBody'),/Republic of Venice/);
  await bot.waitForTimeout(800);await bot.screenshot({path:SHOTS+'/11-n7-embed-corfu.png'});
  // Invalid place is refused, as before.
  await bot.evaluate(([nonce])=>document.getElementById('f').contentWindow.postMessage({schema:'n7-map/v1',nonce,type:'map_focus',id:'99999999-2222-3333-4444-555555555555',placeId:'recAAAAAAAAAAAAAA'},'https://lepe12.github.io'),[nonce]);
  await bot.waitForFunction(()=>window.msgs.some(m=>m.type==='ack'&&m.id==='99999999-2222-3333-4444-555555555555'));
  assert.equal(await bot.evaluate(()=>window.msgs.find(m=>m.id==='99999999-2222-3333-4444-555555555555').error),'PLACE_NOT_IN_NABOU_DATA');ok('unknown record refused (PLACE_NOT_IN_NABOU_DATA)');
  assert.deepEqual(errs2,[]);ok('no page errors (embed)');
  await browser.close();
  console.log('\n'+results.length+' checks passed');
})().catch(e=>{console.error('FAIL',e);process.exit(1);});
