'use strict';
// End-to-end: real assembled N7 runtime (loopback model fixture) served at the real N7 origin, the real
// NABOU atlas checkout served at the real atlas origin, real PHP library search over a real imported
// book (pages produced by import_gutenberg_public_domain.pages_from_html). Browser routing replaces only
// DNS/TLS and the signed bridge to pct-live. No production service, data or credentials are used.
// Env: N7_ATLAS_DIR, N7_BOOK_PAGES (pages JSON), optional N7_SCREENSHOT_DIR, N7_RUNTIME_PATH.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn,execFileSync}=require('node:child_process');
const {once}=require('node:events');
const ROOT=path.resolve(__dirname,'../..');
const runtime=path.resolve(process.env.N7_RUNTIME_PATH||path.join(ROOT,'.n7-runtime'));
const atlasDir=process.env.N7_ATLAS_DIR,bookPages=process.env.N7_BOOK_PAGES,shots=process.env.N7_SCREENSHOT_DIR;
// Optional: real semantic index (tools/library/n7-semantic-index.mjs) and pinned model dir (scripts/prepare_semantic_model.cjs).
const semIndex=process.env.N7_SEMANTIC_INDEX,modelDir=process.env.N7_MODEL_DIR;
if(!atlasDir||!bookPages)throw Error('N7_ATLAS_DIR and N7_BOOK_PAGES are required');
const BOT='https://bot.piratecartography.com',ATLAS='https://lepe12.github.io',ATLAS_BASE=ATLAS+'/geraki-historical-atlas/';
const results=[];const record=(id,name,status,detail)=>{results.push({id,name,status,detail});console.log(status.padEnd(7),id,name,'—',detail);};
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2'};
const php=(...args)=>JSON.parse(execFileSync('php',[path.join(ROOT,'test/fixtures/n7_library_search_harness.php'),path.join(ROOT,'tools/library/n7_library.php'),bookPages,...args],{encoding:'utf8',maxBuffer:2e7}));
const firstBook=()=>JSON.parse(fs.readFileSync(bookPages.split(',')[0],'utf8')).pages;
const allPages=()=>bookPages.split(',').flatMap(f=>{const d=JSON.parse(fs.readFileSync(f,'utf8'));const sid=require('node:crypto').createHash('sha256').update('gutenberg:'+d.book.id).digest('hex');return d.pages.map(p=>({...p,source_id:sid,title:d.book.title}));});

(async()=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'n7-e2e-'));let child,logs='';
 const provider=http.createServer(async(req,res)=>{let t='';for await(const c of req)t+=c;const r=JSON.parse(t);
  const last=JSON.stringify(r.messages||[]);
  if(last.includes('N7_FORCE_MODEL_FAILURE')){res.writeHead(500,{'Content-Type':'application/json'});return res.end('{"error":"fixture failure"}');}
  const answer='Γεια σου. Είμαι ο N7 (απάντηση δοκιμαστικού μοντέλου).';
  if(r.stream){res.writeHead(200,{'Content-Type':'text/event-stream'});return res.end('data: '+JSON.stringify({choices:[{delta:{content:answer},finish_reason:null}]})+'\n\ndata: [DONE]\n\n');}
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:answer},finish_reason:'stop'}]}));});
 await new Promise(r=>provider.listen(0,'127.0.0.1',r));
 const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const base='http://127.0.0.1:'+port;
 const env={...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:data,COOKIE_SECURE:'0',BOT_PASSWORD:'local-e2e-test',
  SESSION_SECRET:'test-only-session-secret-'.repeat(3),LLM_BASE_URL:'http://127.0.0.1:'+provider.address().port+'/v1',LLM_API_KEY:'fixture-not-a-key',LLM_MODEL:'fixture'};
 delete env.HTTPS_PROXY;delete env.https_proxy;delete env.NODE_USE_ENV_PROXY; // server has no external network: weather must fail honestly
 if(semIndex){fs.rmSync(path.join(runtime,'n7-semantic'),{recursive:true,force:true});fs.cpSync(semIndex,path.join(runtime,'n7-semantic'),{recursive:true});}
 if(modelDir){fs.rmSync(path.join(runtime,'public','n7-model'),{recursive:true,force:true});fs.cpSync(modelDir,path.join(runtime,'public','n7-model'),{recursive:true});}
 child=spawn(process.execPath,[path.join(runtime,'server.js')],{cwd:runtime,env});
 child.stdout.on('data',b=>logs=(logs+b).slice(-6000));child.stderr.on('data',b=>logs=(logs+b).slice(-6000));
 for(let i=0;i<120;i++){try{if((await fetch(base+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
 // A local front emulates only the signed pct-live library bridge with the REAL PHP search over the
 // real book pages, and proxies everything else to the runtime. The main flow reaches it through
 // Playwright routing at the real N7 origin (the browser never touches the network for that origin);
 // the on-device semantic test (T11) loads the app from the front directly so the 118 MB model streams
 // (Playwright cannot fulfil bodies of that size). Production is never contacted.
 let libraryDown=false;
 const front=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://front');let raw='';
  if(req.method==='POST'&&(url.pathname==='/api/library/search'||url.pathname==='/api/library/page')){
   for await(const c of req)raw+=c;const send=(code,obj)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(obj));};
   const authed=await fetch(base+'/api/status',{headers:{cookie:req.headers.cookie||''}}).then(r=>r.json()).then(j=>j.authenticated).catch(()=>false);
   if(!authed)return send(401,{error:'Authentication required'});
   if(url.pathname==='/api/library/search'){if(libraryDown)return send(503,{error:'Library service connection failed'});
    const q=JSON.parse(raw||'{}').query;const out=semIndex?php('hybrid',q,semIndex):php('search',q);
    return send(200,{schema:'n7-library-read-v1',matches:out.matches,source_count:out.source_count,page_count:out.page_count,historically_verified:false});}
   const b=JSON.parse(raw||'{}');return send(200,{schema:'n7-library-page-v1',page:php('page',String(b.scan_index),b.source_id)});
  }
  const up=http.request({host:'127.0.0.1',port,method:req.method,path:url.pathname+url.search,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
  up.on('error',()=>{res.writeHead(502);res.end();});req.pipe(up);
 });
 await new Promise(r=>front.listen(0,'127.0.0.1',r));
 const frontPort=front.address().port,FRONT='http://127.0.0.1:'+frontPort;
 const viaFront=(req,url)=>new Promise((resolve,reject)=>{
  const r=http.request({host:'127.0.0.1',port:frontPort,method:req.method(),path:url.pathname+url.search,headers:{...req.headers(),host:'bot.piratecartography.com'}},x=>{const ch=[];x.on('data',c=>ch.push(c));
   x.on('end',()=>{const h={};for(const [k,v] of Object.entries(x.headers))h[k]=Array.isArray(v)?v.join('\n'):String(v);resolve({status:x.statusCode,headers:h,body:Buffer.concat(ch)});});});
  r.on('error',reject);const b=req.postDataBuffer();if(b)r.write(b);r.end();});
 const browser=await chromium.launch();
 const context=await browser.newContext({viewport:{width:1440,height:900},locale:'el-GR'});
 const csp=[],errors=[];
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin===BOT){
   // In the main flow the device model is unavailable: the stage must fall back without failing.
   if(url.pathname.startsWith('/n7-model/'))return route.fulfill({status:404,body:''});
   return route.fulfill(await viaFront(req,url));
  }
  if(url.origin===ATLAS&&url.pathname.startsWith('/geraki-historical-atlas/')){
   let rel=decodeURIComponent(url.pathname.slice('/geraki-historical-atlas/'.length));if(!rel||rel.endsWith('/'))rel+='index.html';
   // tools/n7 in the atlas is the generated distribution of this repository: serve the canonical files.
   const file=rel.startsWith('tools/n7/')&&fs.existsSync(path.join(ROOT,rel))?path.join(ROOT,rel):path.join(atlasDir,rel);
   if(!file.startsWith(atlasDir)&&!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory())return route.fulfill({status:404,body:'not found'});
   return route.fulfill({status:200,contentType:MIME[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
  }
  return route.abort(); // hermetic: CDNs, fonts and other hosts are not reached
 });
 const page=await context.newPage();
 page.on('console',m=>{if(/Content Security Policy/i.test(m.text()))csp.push(m.text().slice(0,200));});
 page.on('pageerror',e=>errors.push(String(e)));
 const run=async(text)=>{await page.fill('#n7StageInput',text);await page.click('#n7StageSend');
  await page.waitForFunction(()=>!document.getElementById('n7StageSend').disabled,null,{timeout:40000});return (await page.textContent('#n7StageReply')).trim();};
 try{
  await page.goto(BOT+'/');await page.waitForSelector('#login:not(.hidden) #loginform input[name=password]');
  await page.fill('#loginform input[name=password]','local-e2e-test');await page.press('#loginform input[name=password]','Enter');
  await page.waitForSelector('#n7Stage:not([hidden])',{timeout:15000});
  await page.waitForSelector('#n7StageFigure .n7-live-presence canvas');
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#n7StageFigure .n7-live-presence')).visibility==='visible',null,{timeout:15000});
  const fig=await page.$eval('#n7StageFigure',e=>{const r=e.getBoundingClientRect(),c=e.querySelector('canvas');return {w:r.width,h:r.height,cw:c.width,ch:c.height,bw:c.getBoundingClientRect().width,bh:c.getBoundingClientRect().height,vw:innerWidth};});
  assert.ok(fig.w>=480&&Math.abs(fig.bw-fig.bh)<1&&fig.cw===650&&fig.ch===650,'figure '+JSON.stringify(fig));
  record('T9a','Humanoid κεντρικό, μεγάλο, χωρίς παραμόρφωση','PASS',`πλαίσιο ${Math.round(fig.w)}×${Math.round(fig.h)} px σε viewport 1440×900, canvas 650×650 (1:1)`);
  if(shots)await page.screenshot({path:path.join(shots,'humanoid-desktop.png')});

  // Test 1: Humanoid -> NABOU, focus Corfu
  const popupWait=context.waitForEvent('page');
  const r1=await run('N7, άνοιξε τον ιστορικό χάρτη');const atlas=await popupWait;
  atlas.on('pageerror',e=>errors.push('atlas: '+e));
  assert.match(r1,/NABOU είναι ανοιχτός/);
  await atlas.waitForFunction(()=>window.NABOU_PRO_ATLAS&&document.getElementById('n7MapBack'));
  const before=await atlas.evaluate(()=>({sel:NABOU_PRO_ATLAS.selected,view:NABOU_PRO_ATLAS.view()}));
  const r2=await run('Δείξε μου την Κέρκυρα');
  const after=await atlas.evaluate(()=>({sel:NABOU_PRO_ATLAS.selected,view:NABOU_PRO_ATLAS.view(),card:document.getElementById('proPlaceInfo')?.innerText||''}));
  assert.equal(after.sel,'corfu');assert.match(after.card,/Κέρκυρα/);assert.match(r2,/εστίασε στο Κέρκυρα/);
  record('T1','Humanoid → NABOU → Κέρκυρα','PASS',`NABOU selected: ${before.sel} → ${after.sel}; view ${JSON.stringify(before.view)} → ${JSON.stringify(after.view)}; κάρτα τόπου περιέχει «Κέρκυρα»`);
  const r3=await run('Δείξε μου τις πηγές');
  const open=await atlas.evaluate(()=>document.querySelector('#proPlaceInfo details.n7-sources')?.open===true);
  assert.ok(open);record('T1b','«Δείξε μου τις πηγές» → πάνελ πηγών NABOU','PASS','details.n7-sources open=true · '+r3);
  const noMap=await run('Άνοιξε την Αστυπάλαια στον χάρτη');
  assert.match(noMap,/δεν υπάρχει εγκεκριμένο σημείο/);
  record('T6b','Αβέβαιο τοπωνύμιο δεν τοποθετείται αυθαίρετα','PASS',noMap.slice(0,140));
  if(shots)await atlas.screenshot({path:path.join(shots,'nabou-corfu.png')});

  // Chat through the real N7 transport
  const rc=await run('Γεια σου N7');assert.match(rc,/Είμαι ο N7/);
  const conv1=await page.evaluate(()=>active);

  // Test 2: back to Humanoid, conversation and map state preserved
  const rb=await run('Γύρνα στο Humanoid');
  const st=await page.evaluate(()=>({active,state:N7Stage.state(),stage:!document.getElementById('n7Stage').hidden}));
  const mapSel=await atlas.evaluate(()=>NABOU_PRO_ATLAS.selected);
  assert.ok(st.stage&&st.active===conv1&&st.state.conversationId===conv1&&st.state.map.selected==='corfu'&&mapSel==='corfu');
  record('T2','NABOU → Humanoid χωρίς απώλεια','PASS',`ίδια συνομιλία ${conv1.slice(0,8)}…, κοινή κατάσταση map.selected=${st.state.map.selected}, NABOU παρέμεινε στο ${mapSel} · ${rb.slice(0,60)}`);
  await atlas.click('#n7MapBack');await page.waitForFunction(()=>N7Stage.state().actions.some(a=>a.text==='Επιστροφή από το NABOU'));
  record('T2b','Κουμπί «← Humanoid N7» στο NABOU','PASS','μήνυμα return λήφθηκε από το N7 (η εστίαση παραθύρου εξαρτάται από τον browser)');

  // Test 3 / 4: library search on a real imported book, verified against the original page
  const rl=await run('Αναζήτησε στη βιβλιοθήκη αναφορές στην Κέρκυρα');
  const rows=await page.$$eval('#n7StageResults tbody tr',trs=>trs.map(t=>[...t.children].map(td=>td.innerText)));
  assert.ok(rows.length>0,rl);
  await page.click('#n7StageResults tbody tr:first-child button');
  await page.waitForSelector('#n7StageResults .n7-page-row pre');
  const pageText=await page.textContent('#n7StageResults .n7-page-row pre');
  const ex=rows[0][2].replace(/^…|…$/g,'').trim();
  const first=(await page.evaluate(()=>N7Stage.state().results.items[0]));
  const orig=allPages().find(p=>p.source_id===first.source_id&&p.scan_index===first.scan_index);
  assert.ok(pageText.includes(ex)&&orig.text.includes(ex)&&String(orig.printed_page)===rows[0][1].split(' ')[0]);
  record('T3','Βιβλιοθήκη: πραγματικό βιβλίο, απόσπασμα = πρωτότυπη σελίδα','PASS',`${rows.length} αποσπάσματα· 1ο: «${rows[0][0]}», σελ. ${rows[0][1]}, το απόσπασμα περιέχεται αυτούσιο στη σελίδα ${orig.printed_page} του HTML του Gutenberg`);
  record('T4','Historical/Library agent χρησιμοποιεί ανακτημένα χωρία','PASS','απάντηση: '+rl.slice(0,160));

  // Test 6: results to NABOU with source link
  const rm=await run('Δείξε μου τα αποτελέσματα στο NABOU');
  const panel=await atlas.evaluate(()=>{const p=document.getElementById('n7MapResults');return {visible:!p.hidden,quotes:[...p.querySelectorAll('blockquote')].map(q=>q.textContent),cites:[...p.querySelectorAll('cite')].map(c=>c.textContent),sel:NABOU_PRO_ATLAS.selected};});
  assert.ok(panel.visible&&panel.quotes.some(q=>q.includes(ex))&&panel.sel==='corfu');
  record('T6','Ευρήματα βιβλιοθήκης στο NABOU με παραπομπή','PASS',`${rm} · παραπομπή: ${panel.cites[0]}`);
  if(shots)await atlas.screenshot({path:path.join(shots,'nabou-results.png')});

  // Test 8: reconnect (reload) — what persisted
  await page.reload();await page.waitForSelector('#n7Stage:not([hidden])');
  await page.waitForFunction(c=>active===c,conv1,{timeout:15000});
  const persisted=await page.evaluate(()=>({state:N7Stage.state(),line:document.getElementById('n7StageState').textContent,rows:document.querySelectorAll('#n7StageResults tbody tr').length,msgs:document.querySelectorAll('#messages .bubble').length}));
  assert.ok(persisted.state.results?.items?.length&&persisted.rows>0&&persisted.msgs>=2);
  const reopen=context.waitForEvent('page',{timeout:3000}).catch(()=>null);
  const rr=await run('Δείξε μου τις πηγές');await reopen;
  const kept=await atlas.evaluate(()=>NABOU_PRO_ATLAS.selected);
  assert.ok(/Άνοιξαν οι πηγές για Κέρκυρα/.test(rr)&&kept==='corfu');
  record('T8','Μνήμη μετά από επαναφόρτωση/επανασύνδεση','PASS',`συνομιλία ${conv1.slice(0,8)}… επανήλθε με ${persisted.msgs} μηνύματα· ${persisted.rows} γραμμές αποτελεσμάτων· map.selected=${persisted.state.map?.selected}; το ίδιο παράθυρο NABOU επανασυνδέθηκε (hashchange) χωρίς επαναφόρτωση, τόπος: ${kept}`);

  // T11: meaning-based library search (Greek question about English books), excerpts verified against the source pages
  if(semIndex&&modelDir){
   const pagesAll=allPages();
   const c2=await browser.newContext({viewport:{width:1440,height:900},locale:'el-GR'});
   await c2.route('**/*',r=>new URL(r.request().url()).origin===FRONT?r.continue():r.abort());
   const p2=await c2.newPage();p2.on('pageerror',e=>errors.push('front: '+e));p2.on('console',m=>{if(/Content Security Policy/i.test(m.text()))csp.push(m.text().slice(0,200));});
   await p2.goto(FRONT+'/');await p2.waitForSelector('#login:not(.hidden) #loginform input[name=password]');
   await p2.fill('#loginform input[name=password]','local-e2e-test');await p2.press('#loginform input[name=password]','Enter');
   await p2.waitForSelector('#n7Stage:not([hidden])');
   const run2=async text=>{await p2.fill('#n7StageInput',text);await p2.click('#n7StageSend');await p2.waitForFunction(()=>!document.getElementById('n7StageSend').disabled,null,{timeout:180000});return (await p2.textContent('#n7StageReply')).trim();};
   for(const q of ['Αναζήτησε στη βιβλιοθήκη: Πώς ζούσαν οι σκλάβοι κωπηλάτες στις γαλέρες;','Αναζήτησε στη βιβλιοθήκη: ποιος συγγραφέας του Δον Κιχώτη έπεσε αιχμάλωτος των κουρσάρων;']){
    const t0=Date.now();const reply=await run2(q);const ms=Date.now()-t0;
    const st=await p2.evaluate(()=>N7Stage.state().results);
    assert.ok(st.layers.device&&st.layers.lexical!==undefined,'device layer: '+reply);
    const sem=st.items.filter(x=>x.how.includes('semantic-device'));assert.ok(sem.length>0,reply);
    for(const x of st.items){const p=pagesAll.find(p=>p.source_id===x.source_id&&p.scan_index===x.scan_index);
     assert.ok(p&&p.text.includes(x.excerpt.replace(/^…|…$/g,'').trim()),'excerpt not verbatim: '+x.title+' '+x.scan_index);}
    const top=st.items[0];
    record('T11','Αναζήτηση με βάση το νόημα','PASS',`«${q.slice(28,90)}» σε ${ms} ms: ${st.items.length} αποσπάσματα (${sem.length} μέσω νοήματος στη συσκευή, server-νόημα: ${st.layers.server}), όλα αυτούσια στις σελίδες· 1ο: ${top.title}, σ. ${top.printed_page} [${top.how.join('+')}] «${top.excerpt.slice(0,70)}…»`);
   }
   if(shots)await p2.screenshot({path:path.join(shots,'humanoid-semantic.png')});
   await c2.close();
  }

  // T13: N7_STAGE_CLEAR_RESULTS_V1 — results clear by hand and when a new non-map question starts
  const rowsNow=()=>page.evaluate(()=>({rows:document.querySelectorAll('#n7StageResults tbody tr').length,stored:!!JSON.parse(localStorage.getItem('n7-shared-state-v1')||'{}').results,flag:document.getElementById('n7Stage').dataset.results}));
  const c0=await rowsNow();assert.ok(c0.rows>0,'results present before clearing');
  await page.click('.n7-results-clear');const c1=await rowsNow();
  assert.ok(c1.rows===0&&!c1.stored&&c1.flag==='0',JSON.stringify(c1));
  await run('Αναζήτησε στη βιβλιοθήκη αναφορές στην Κέρκυρα');const c2=await rowsNow();assert.ok(c2.rows>0,'new search shows results');
  await run('Δείξε μου τα αποτελέσματα στο NABOU');const c3=await rowsNow();assert.ok(c3.rows===c2.rows,'map command keeps results');
  const clearedBy='Έλεγξε το τελευταίο GitHub PR';
  // T12: coding agent — real PR state needs the server token; code changes need explicit confirmation
  const codingCalls=[];page.on('request',q=>{if(q.url().includes('/api/coding/tasks'))codingCalls.push(q.method());});
  const rp=await run(clearedBy);
  const c4=await rowsNow();assert.ok(c4.rows===0&&!c4.stored,'a new question clears the results');
  record('T13','Καθαρισμός ευρημάτων','PASS',`κουμπί «Καθαρισμός»: ${c0.rows}→${c1.rows} γραμμές· νέα αναζήτηση: ${c2.rows}· «Δείξε στο NABOU» τα κρατά: ${c3.rows}· νέα ερώτηση «${clearedBy}»: ${c4.rows}`);
  assert.ok(await page.$('#n7StageReply .n7-error')&&/CODING_TOKEN_NOT_CONFIGURED/.test(rp),rp);
  const rcf=await run('Άλλαξε τον κώδικα του NABOU ώστε οι ετικέτες του navigation rail να είναι μεγαλύτερες');
  assert.ok(await page.$('#n7CodingConfirm')&&codingCalls.length===0,rcf);
  await page.click('#n7CodingConfirm button:has-text("Προεπισκόπηση")');
  await page.waitForFunction(()=>/Coding Agent δεν ξεκίνησε/.test(document.getElementById('n7StageReply').innerText),null,{timeout:15000});
  const rce=(await page.textContent('#n7StageReply')).trim();
  record('T12','Coding Agent από τη συνομιλία','PASS',`έλεγχος PR: «${rp.slice(0,80)}» · αλλαγή κώδικα: πάνελ επιβεβαίωσης, 0 αποστολές πριν από το κλικ, μετά το κλικ ${codingCalls.length} αίτημα → «${rce.slice(0,90)}» (χωρίς token στο τοπικό περιβάλλον)`);

  // Test 10: safe failure
  libraryDown=true;const rf=await run('Αναζήτησε στη βιβλιοθήκη αναφορές στη Γραμβούσα');libraryDown=false;
  const stF=await page.evaluate(()=>({state:document.getElementById('n7Stage').dataset.state,err:!!document.querySelector('#n7StageReply .n7-error')}));
  assert.ok(stF.err&&stF.state==='error'&&/δεν απάντησε/.test(rf));
  const rw=await run('Τι καιρό θα κάνει αύριο στην Αθήνα;');
  assert.ok(/WEATHER_|Σφάλμα|503|unavailable/i.test(rw)&&await page.$('#n7StageReply .n7-error'));
  const rmf=await run('N7_FORCE_MODEL_FAILURE');
  assert.ok(await page.$('#n7StageReply .n7-error'),rmf);
  record('T10','Ασφαλής αποτυχία (βιβλιοθήκη, καιρός, μοντέλο)','PASS',`βιβλιοθήκη: «${rf.slice(0,70)}» · καιρός χωρίς δίκτυο: «${rw.slice(0,60)}» · μοντέλο 500: «${rmf.slice(0,60)}»`);

  // Test 7: voice in headless Chromium (no microphone, no Greek system voice)
  await page.evaluate(()=>{document.getElementById('n7StageReply').replaceChildren();N7Presence.setKind('idle');document.getElementById('n7Stage').dataset.state='idle';});
  await page.click('#n7StageMic');await page.waitForFunction(()=>document.getElementById('n7StageReply').innerText.trim()||document.getElementById('n7Stage').dataset.state==='listening',null,{timeout:9000}).catch(()=>{});await page.waitForFunction(()=>document.getElementById('n7Stage').dataset.state==='error',null,{timeout:9000}).catch(()=>{});
  const voice=await page.evaluate(()=>({sr:!!(window.SpeechRecognition||window.webkitSpeechRecognition),voices:speechSynthesis.getVoices().map(v=>v.lang),reply:document.getElementById('n7StageReply').innerText,mic:document.getElementById('n7StageMic').getAttribute('aria-pressed'),state:document.getElementById('n7Stage').dataset.state}));
  assert.ok(voice.state==='error'&&voice.reply.trim(),'microphone failure must be reported: '+JSON.stringify(voice));
  record('T7a','Μη διαθέσιμο STT/TTS αναφέρεται ως σφάλμα','PASS','μήνυμα: «'+voice.reply.slice(0,110)+'»');
  record('T7','STT/TTS ελληνικά','BLOCKED',`headless Chromium: SpeechRecognition=${voice.sr}, φωνές=${JSON.stringify(voice.voices)}; μετά το πάτημα μικροφώνου: state=${voice.state}, mic=${voice.mic}, μήνυμα «${voice.reply.slice(0,90)}». Πραγματικό μικρόφωνο/ηχεία δεν υπάρχουν στο sandbox.`);

  // Responsive
  for(const [name,w,h] of [['tablet',834,1112],['mobile',390,844]]){
   await page.setViewportSize({width:w,height:h});await page.waitForTimeout(300);
   const m=await page.evaluate(()=>{const ids=['n7StageFigure','n7StageInput','n7StageSend','n7StageMic'];const out={};for(const id of ids){const r=document.getElementById(id).getBoundingClientRect();out[id]={x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};}
    out.rail=[...document.querySelectorAll('.n7-rail-item')].every(b=>{const r=b.getBoundingClientRect();return r.width>0&&r.bottom<=innerHeight+1&&r.right<=innerWidth+1;});out.scrollX=document.documentElement.scrollWidth>innerWidth;return out;});
   assert.ok(m.rail&&!m.scrollX&&m.n7StageInput.w>150&&m.n7StageSend.x+m.n7StageSend.w<=w,JSON.stringify(m));
   record('T9-'+name,'Responsive '+name+' '+w+'×'+h,'PASS',`figure ${m.n7StageFigure.w}px, πεδίο ${m.n7StageInput.w}px, όλα τα στοιχεία πλοήγησης ορατά, χωρίς οριζόντια κύλιση`);
   if(shots)await page.screenshot({path:path.join(shots,'humanoid-'+name+'.png')});
  }
  record('T9-csp','CSP παραβιάσεις στη σελίδα N7',csp.length?'NOTE':'PASS',csp.length?csp.length+' (π.χ. '+csp[0]+')':'καμία');
  assert.deepEqual(errors,[]);
 }catch(e){record('E2E','Σφάλμα δοκιμής','FAIL',e.stack?.split('\n').slice(0,3).join(' | ')+' | server: '+logs.slice(-400));process.exitCode=1;}
 finally{await browser.close();front.close();child.kill('SIGTERM');await once(child,'exit');provider.close();fs.rmSync(data,{recursive:true,force:true});
  if(shots)fs.writeFileSync(path.join(shots,'e2e-results.json'),JSON.stringify(results,null,1));}
})();
