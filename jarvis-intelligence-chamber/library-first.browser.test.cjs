// One library + library-first research in the real chamber page. Every pct-live call is answered
// by the test; nothing reaches pct-live, GitHub or any production service, and no research is dispatched.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const A={id:'pub:a',short:'Ιωάννου 2000',title:'Οι φουρτούνες του καπετάν-Πέτρου Λάντζα',kind:'published'},B={id:'pub:b',short:'Λάσκαρις 1956',title:'Πέτρος Λάντζας',kind:'published'};
const HITS=[{book:A,page:278,text:'Τον Μάρτιο του 1568 ο Πέτρος Λάντζας εμφανίζεται για πρώτη φορά στην περιοχή της Χιμάρας με δύο φούστες.'},{book:B,page:105,text:'Το 1573 ο Λάντζας διορίζεται διοικητής της Πάργας από τους Βενετούς, κατά την παράδοση της οικογένειας.'},{book:A,page:298,text:'Το 1577 οι Βενετοί κρατούν ένα μπριγκαντίνι του Λάντζα στο λιμάνι της Κέρκυρας, όπως γράφουν τα έγγραφα.'}];
(async()=>{const root=path.resolve(__dirname,'..');const server=http.createServer((req,res)=>{let file=path.join(root,new URL(req.url,'http://local').pathname);if(file.endsWith('/'))file+='index.html';try{res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.svg')?'image/svg+xml':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.JARVIS_BROWSER_EXECUTABLE||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const base='http://127.0.0.1:'+server.address().port+'/jarvis-intelligence-chamber/?skip=1';
 const snapshot={schema:'pct-command-center-live-v1',run_id:'100',mission:{target:'Παλαιότερη έρευνα',status:'COMPLETED'},agents:[],claims:[],discoveries:[],blockers:[],events:[],safety:{automatic_verified:false}};
 async function open({library='online',signed=true,url=base}={}){
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const calls={search:0,dispatch:0,knowledge:0,add:0,addHeaders:null};let added=[];
  await page.route('**/*',route=>{const u=route.request().url();const m=route.request().method();
   if(!u.startsWith('https://'))return route.continue();
   if(u.includes('raw.githubusercontent.com'))return route.fulfill({json:snapshot});
   if(!u.startsWith('https://pct-live.piratecartography.com/'))return route.abort();
   if(u.endsWith('/dispatch')){calls.dispatch++;return route.fulfill({status:202,json:{request_id:'own'}});}
   if(u.includes('/knowledge/')){calls.knowledge++;return route.abort();}
   if(u.includes('/library/')&&library==='offline')return route.abort();
   if(u.endsWith('/library/status'))return route.fulfill({json:{schema:'nabou-library-status-v1',signed_in:signed,can_add:signed}});
   if(u.endsWith('/library/books')&&m==='GET')return route.fulfill({json:{schema:'nabou-library-books-v1',published:[{id:'pub:Ioannou_2000_Thesaurismata30_Oi-fourtounes-tou-kapetan-Petrou-Lantza',pages:24}],added:signed?added:null}});
   if(u.endsWith('/library/books')&&m==='POST'){calls.add++;calls.addHeaders=route.request().headers();added=[{id:'src-1',kind:'uploaded',title:decodeURIComponent(calls.addHeaders['x-book-title']),author:'Δοκιμή',pages:3}];return route.fulfill({status:201,json:{status:'ADDED_TO_LIBRARY',book:added[0],pages:3,readable_pages:3,passages:5}});}
   if(u.endsWith('/library/search')){calls.search++;const q=JSON.parse(route.request().postData()).query;return route.fulfill({json:{schema:'nabou-library-search-v1',query:q,hits:/Λάντζα/.test(q)?HITS:[],stores:{published:'OK',uploaded:'OK',historical:'NOT_CONFIGURED'},took_ms:40}});}
   return route.fulfill({json:{snapshot,events:[]}});});
  await page.routeWebSocket(/.*/,()=>{});
  await page.goto(url);await page.waitForFunction(()=>window.NABOU_LIBRARY_FIRST&&document.body.dataset.readerView);
  return {page,errors,calls};
 }
 const ask=async(page,q)=>{await page.locator('#n7Shell [data-atlas-nav="research"]').click();await page.locator('#operatorQuery').fill(q);await page.locator('#executeQuery').click();await page.waitForFunction(()=>{const c=document.querySelector('#libraryAnswer');return c&&!c.hidden&&c.dataset.path!=='searching';});};
 try{
  // Reader nav: Χάρτης, Έρευνα, Πηγές; no operator screens.
  {const {page,errors}=await open();
   assert.equal(await page.locator('#n7Shell [data-atlas-nav="tools"]').isVisible(),false,'Δεδομένα is an operator screen');
   assert.equal(await page.locator('#n7Shell [data-atlas-nav="agents"]').isVisible(),false,'Ερευνητές is an operator screen');
   for(const n of ['map','research','sources'])assert.equal(await page.locator('#n7Shell [data-atlas-nav="'+n+'"]').first().isVisible(),true,n);
   assert.deepEqual(errors,[]);await page.close();}
  {const {page}=await open({url:base+'&operator=1'});assert.equal(await page.locator('#n7Shell [data-atlas-nav="tools"]').isVisible(),true,'?operator=1 brings the operator screens back');await page.evaluate(()=>localStorage.removeItem('nabou-operator'));await page.close();}
  // 1. Library is enough: a short chronological story with a source under each fact, and no long run.
  {const {page,errors,calls}=await open();await ask(page,'Βρες στοιχεία για τον Πέτρο Λάντζα τον κουρσάρο');
   assert.equal(calls.search,1);assert.equal(calls.dispatch,0,'the long run must not start when the library is enough');
   assert.equal(await page.locator('#libraryAnswer').getAttribute('data-path'),'library');
   assert.deepEqual(await page.locator('#libraryAnswer .library-when').allInnerTexts(),['1568','1573','1577']);
   assert.deepEqual(await page.locator('#libraryAnswer .library-source').allInnerTexts(),['Πηγή: Ιωάννου 2000, σ. 278','Πηγή: Λάσκαρις 1956, σ. 105','Πηγή: Ιωάννου 2000, σ. 298']);
   assert.match(await page.locator('#libraryAnswer').innerText(),/η μεγάλη έρευνα στο διαδίκτυο δεν ξεκίνησε/i);
   assert.equal(await page.locator('#libraryAnswer .library-details').getAttribute('open'),null,'numbers stay behind Λεπτομέρειες');
   assert.match(await page.locator('#commandState').innerText(),/βιβλιοθήκη/);
   await page.locator('#libraryAnswer .library-long').click();await page.waitForFunction(()=>document.body.dataset.dispatchRequest==='own');
   assert.equal(calls.dispatch,1,'one explicit click starts the long run');assert.deepEqual(errors,[]);await page.close();}
  // 2. Library has nothing: the long run starts, and the card says so honestly.
  {const {page,calls}=await open();await ask(page,'πειρατικές επιδρομές στη Κίμωλο, 16ος–17ος αιώνας');await page.waitForFunction(()=>document.body.dataset.dispatchRequest==='own');
   assert.equal(calls.search,1);assert.equal(calls.dispatch,1);assert.match(await page.locator('#libraryAnswer').innerText(),/δεν είχε τίποτα για «Κίμωλο».*20–90 λεπτά/s);await page.close();}
  // 3. Library could not be consulted (not deployed yet): nothing starts by itself.
  {const {page,calls}=await open({library:'offline'});await ask(page,'Βρες στοιχεία για τον Πέτρο Λάντζα');await page.waitForTimeout(300);
   assert.equal(calls.dispatch,0,'never start the 20–90 minute run silently');assert.equal(await page.locator('#libraryAnswer').getAttribute('data-path'),'ask');
   assert.match(await page.locator('#libraryAnswer').innerText(),/Η βιβλιοθήκη για τη συγκεκριμένη έρευνα δεν διαθέτει στοιχεία/);
   assert.match(await page.locator('#libraryAnswer .library-long').innerText(),/Έναρξη έρευνας σε βάθος/);
   assert.match(await page.locator('#libraryAnswer .library-duration').innerText(),/διάρκεια 20–90 λεπτά/);
   await page.locator('#libraryAnswer .library-long').click();await page.waitForFunction(()=>document.body.dataset.dispatchRequest==='own');assert.equal(calls.dispatch,1);await page.close();}
  // 4. Explicit ask to search further: the long run starts at once, without a library round trip.
  {const {page,calls}=await open();await page.locator('#n7Shell [data-atlas-nav="research"]').click();await page.locator('#researchDeep').check();await page.locator('#operatorQuery').fill('Βρες στοιχεία για τον Πέτρο Λάντζα');await page.locator('#executeQuery').click();await page.waitForFunction(()=>document.body.dataset.dispatchRequest==='own');
   assert.equal(calls.search,0);assert.equal(calls.dispatch,1);await page.close();}
  // 5. Πηγές = the one library; adding a PDF adds a book (no approve/reject, no /knowledge upload).
  {const {page,errors,calls}=await open();await page.locator('#n7Shell [data-atlas-nav="sources"]').click();await page.locator('#readerLibrary').waitFor({state:'visible'});
   assert.match(await page.locator('#readerLibrary').innerText(),/Δημοσιευμένες πηγές[\s\S]*Οι φουρτούνες του καπετάν-Πέτρου Λάντζα[\s\S]*24 σελίδες/);
   assert.equal(await page.locator('#readerLibrary').evaluate(e=>getComputedStyle(e).color),'rgb(63, 58, 46)','ink on parchment, not a dark console');
   const pdf=Buffer.from('%PDF-1.4\n% test\n');await page.setInputFiles('#libraryFile',{name:'vivlio.pdf',mimeType:'application/pdf',buffer:pdf});
   await page.locator('#libraryTitle').fill('Δοκιμαστικό βιβλίο');await page.locator('#libraryAdd').click();
   await page.waitForFunction(()=>/Μπήκε στη βιβλιοθήκη/.test(document.querySelector('.library-add-state').textContent));
   assert.equal(calls.add,1);assert.equal(calls.knowledge,0,'not the old Δεδομένα knowledge flow');assert.equal(calls.addHeaders['content-type'],'application/pdf');
   await page.waitForFunction(()=>document.querySelector('#readerLibrary').textContent.includes('Δοκιμαστικό βιβλίο'));
   assert.equal(await page.locator('#readerLibrary .learning-item, #readerLibrary [data-act=accept]').count(),0,'no approve/reject');
   assert.deepEqual(errors,[]);await page.close();}
  // 6. Library not deployed: Πηγές says so and cannot add.
  {const {page}=await open({library:'offline'});await page.locator('#n7Shell [data-atlas-nav="sources"]').click();await page.waitForFunction(()=>document.querySelector('#readerLibrary').dataset.state==='offline');
   assert.match(await page.locator('#readerLibrary .library-status').innerText(),/δεν έχει ανέβει ακόμη/);assert.equal(await page.locator('#libraryAdd').isDisabled(),true);
   assert.match(await page.locator('#readerLibrary').innerText(),/Λάσκαρις|Πάργας/,'published titles still listed from the public catalogue');await page.close();}
  console.log('PASS one library in Πηγές, PDF upload adds a book, library-first answer skips the long run, honest fallback, explicit long run, reader nav without operator screens');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
