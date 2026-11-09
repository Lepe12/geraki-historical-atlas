'use strict';
// The actual live public frontend is exercised against an isolated, explicit API fixture.
// No production messages, model calls or research dispatches are made by this test.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const editor=require('./editor-diff');
const dir=process.env.N7_FIXTURE_DIR;
if(!dir)throw Error('N7_FIXTURE_DIR is required');
const chats=[{id:'11111111-1111-4111-8111-111111111111',title:'Επιμέλεια κεφαλαίου',messages:[],updated:new Date().toISOString()},{id:'22222222-2222-4222-8222-222222222222',title:'Ιστορία της Νάξου',messages:[],updated:new Date().toISOString()}];
const memory=[],requests=[],errors=[];let seq=3;
let jobReads=0;
const missionId='n7mission-'+'a'.repeat(24);
function json(res,code,data,cookie){res.writeHead(code,{'Content-Type':'application/json',...(cookie?{'Set-Cookie':cookie}:{})});res.end(JSON.stringify(data));}
const app=http.createServer(async(req,res)=>{
 try{
  const p=new URL(req.url,'http://local').pathname;let raw='';for await(const chunk of req)raw+=chunk;
  const b=raw?JSON.parse(raw):{};
  if(p==='/api/login')return json(res,b.password==='local-ui-test'?200:401,{ok:b.password==='local-ui-test'},b.password==='local-ui-test'?'sid=ui-test; HttpOnly; Path=/; SameSite=Strict':undefined);
  if(p==='/api/status')return json(res,200,{authenticated:req.headers.cookie?.includes('sid=ui-test')||false,modelConfigured:true});
  if(p==='/api/logout')return json(res,200,{ok:true},'sid=; Path=/; Max-Age=0');
  if(p.startsWith('/api/')&&!req.headers.cookie?.includes('sid=ui-test'))return json(res,401,{error:'Authentication required'});
  if(p==='/api/conversations'){
   if(req.method==='POST'){const c={id:String(seq++).padStart(8,'0')+'-1111-4111-8111-111111111111',title:'Νέα συνομιλία',messages:[],updated:new Date().toISOString()};chats.unshift(c);return json(res,201,{id:c.id});}
   return json(res,200,{conversations:chats});
  }
  const chat=p.match(/^\/api\/conversations\/([^/]+)(\/chat)?$/);
  if(chat){const c=chats.find(x=>x.id===chat[1]);if(!c)return json(res,404,{error:'Not found'});
   if(chat[2]){await new Promise(r=>setTimeout(r,800));if(b.message.includes('N7_TEST_FAILURE'))return json(res,502,{error:'Δοκιμαστική αποτυχία σύνδεσης'});requests.push(b.message);if(b.message.includes('N7_TEST_QUEUE')){c.messages.push({role:'user',content:b.message});return json(res,202,{pending:true,job_id:'44444444-4444-4444-8444-444444444444',dispatch:'immediate'});}const source=editor.input(b.message);let answer='Κράτησα τη φωνή και τον ρυθμό σου.\n\nΟ άνεμος έκοβε το πρόσωπο. Το πλοίο έγερνε, μα κρατούσε.\nΣτον ορίζοντα φάνηκε η Νάξος. Κανείς δεν μιλούσε.';if(source&&!b.message.includes('N7_TEST_NO_TAGS'))answer='⟦N7_EDIT⟧\n'+source.source.replace('μα κρατούσε','αλλά κρατούσε')+'\n⟦/N7_EDIT⟧\n⟦N7_NOTES⟧Άλλαξα έναν σύνδεσμο.⟦/N7_NOTES⟧';c.messages.push({role:'user',content:b.message},{role:'assistant',content:answer});c.title='Επιμέλεια κεφαλαίου';return json(res,200,{reply:answer,conversation:c});}
   return json(res,200,{conversation:c});
  }
  if(p==='/api/n7/approved-lessons'){
   if(req.method==='POST'){const lesson={id:'33333333-3333-4333-8333-333333333333',rule:b.rule};memory.push(lesson);return json(res,201,{lesson});}
   return json(res,200,{lessons:memory});
  }
  if(p.startsWith('/api/n7/approved-lessons/')&&req.method==='DELETE'){memory.splice(0);return json(res,200,{deleted:true});}
  if(p==='/api/skills/feedback')return json(res,200,{feedback:[]});
  if(p.startsWith('/api/n7/job/'))return json(res,200,{status:++jobReads===1?'processing':'done'});
  if(p==='/api/tasks')return json(res,200,{tasks:[]});
  if(p==='/api/research/missions')return json(res,202,{request_id:missionId});
  if(p.startsWith('/api/research/missions/'))return json(res,200,{request_id:missionId,status:'DISPATCH_NOT_OBSERVED'});
  if(p.endsWith('/stream'))return json(res,200,{documents:[]});
  if(p.startsWith('/api/'))return json(res,404,{error:'Fixture endpoint not configured'});
  const name=p==='/'?'index.html':p.slice(1);
  if(!['index.html','app.js','style.css','historical-library.js','n7-library-ui.js','n7-mission-owner-ui.js'].includes(name)){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(path.join(dir,name)));
 }catch(e){json(res,500,{error:e.message});}
});
async function main(){
 await new Promise(r=>app.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.N7_CHROMIUM?{executablePath:process.env.N7_CHROMIUM}:{}),args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write'],acceptDownloads:true});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+app.address().port,{waitUntil:'networkidle'});
  await page.locator('#login:not(.hidden)').waitFor();
  await page.locator('#loginform input').fill('local-ui-test');await page.locator('#loginform button[type=submit]').click();
  await page.locator('#application:not(.hidden)').waitFor();
  await page.getByRole('button',{name:'Επιμέλεια',exact:true}).click();
  await page.locator('#message').fill('Το πλοίο έγερνε, μα κρατούσε.');
  await page.locator('#send').click();
  await page.locator('#n7-writing-status:not([hidden])').waitFor();
  assert.match(await page.locator('#n7-writing-status').textContent(),/Το Ν7 γράφει/);
  assert.ok(await page.locator('.n7-writing-avatar canvas').isVisible());
  await page.waitForFunction(()=>{const c=document.querySelector('.n7-writing-avatar canvas');return c&&c.getContext('2d').getImageData(0,0,130,130).data.some((v,i)=>i%4===3&&v>0);});
  if(process.env.N7_SCREENSHOT_DIR){fs.mkdirSync(process.env.N7_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.N7_SCREENSHOT_DIR,'n7-writing.png'),fullPage:true});}
  await page.locator('.n7-answer-content').waitFor();
  await page.locator('#n7-writing-status').waitFor({state:'hidden'});
  assert.equal(await page.locator('.n7-comparison-prose').nth(0).textContent(),'Το πλοίο έγερνε, μα κρατούσε.');
  if(process.env.N7_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.N7_SCREENSHOT_DIR,'n7-comparison.png'),fullPage:true});
  assert.equal(await page.locator('.n7-comparison-prose').nth(1).textContent(),'Το πλοίο έγερνε, αλλά κρατούσε.');
  assert.equal(await page.locator('.n7-comparison ins').textContent(),'αλλά');
  await page.getByRole('button',{name:'Απόκρυψη αλλαγών',exact:true}).click();assert.ok(await page.locator('.n7-hide-highlights').count());
  await page.getByRole('button',{name:'Προβολή αλλαγών',exact:true}).click();
  assert.match(requests[0],/^Επιμέλεια κειμένου:/,'Editing mode must survive creation of a new chat');
  await page.locator('.n7-answer-actions').getByRole('button',{name:'Αντιγραφή',exact:true}).click();
  await page.getByRole('button',{name:'Αντιγράφηκε',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'Το πλοίο έγερνε, αλλά κρατούσε.');
  const downloaded=page.waitForEvent('download');await page.locator('.n7-answer-actions').getByRole('button',{name:'Λήψη',exact:true}).click();assert.match((await downloaded).suggestedFilename(),/\.txt$/);
  const exported=page.waitForEvent('download');await page.getByRole('button',{name:'↓ Εξαγωγή',exact:true}).click();assert.match((await exported).suggestedFilename(),/\.txt$/);
  await page.reload({waitUntil:'networkidle'});await page.locator('#conversations button').first().click();
  await page.locator('.n7-comparison').waitFor();
  assert.equal(await page.locator('.n7-comparison-prose').nth(0).textContent(),'Το πλοίο έγερνε, μα κρατούσε.');
  await page.getByRole('button',{name:'Επιμέλεια',exact:true}).click();await page.locator('#message').fill('N7_TEST_NO_TAGS');await page.locator('#send').click();
  await page.locator('.n7-comparison-warning').waitFor();assert.equal(await page.locator('.bubble.assistant').last().locator('.n7-comparison').count(),0);
  await page.getByRole('button',{name:'Συνομιλία',exact:true}).click();
  await page.locator('#message').fill('Μην αλλάζεις τις κοφτές προτάσεις του συγγραφέα.');await page.locator('#send').click();
  await page.locator('#n7-correction-approval').waitFor({state:'visible'});
  await page.getByRole('button',{name:'Ναι, αποθήκευσέ το',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('αποθηκεύτηκε'));
  assert.equal(memory.length,1);
  await page.locator('#n7-owner-memory-button').click();await page.locator('#n7-owner-memory-dialog[open]').waitFor();
  await page.getByRole('dialog').getByText(memory[0].rule,{exact:false}).first().waitFor();
  await page.getByRole('dialog').getByRole('button',{name:'Κλείσιμο',exact:true}).click();
  await page.getByRole('button',{name:'Αναζήτηση',exact:false}).first().click();await page.locator('#n7-conversation-search').fill('ναξου');
  assert.equal(await page.locator('#conversations button:visible').count(),1);
  await page.locator('#n7-conversation-search').fill('');
  await page.getByRole('button',{name:'Προσθήκη αρχείου',exact:true}).click();
  await page.getByRole('button',{name:'Αρχείο PDF, εικόνα ή έγγραφο',exact:true}).click();
  await page.locator('#chat input[type=file]').setInputFiles({name:'απόσπασμα.txt',mimeType:'text/plain',buffer:Buffer.from('Το αρχείο μου περιέχει αυτό το κείμενο.')});
  await page.locator('.n7-file-chip').waitFor({state:'visible'});
  await page.locator('.n7-file-chip').getByRole('button',{name:'Προβολή',exact:true}).click();await page.locator('.n7-file-preview[open]').waitFor();
  assert.equal(await page.locator('.n7-file-preview pre').textContent(),'Το αρχείο μου περιέχει αυτό το κείμενο.');await page.locator('.n7-file-preview').getByRole('button',{name:'Κλείσιμο',exact:true}).click();
  await page.locator('#message').fill('Επιμελήσου το συνημμένο κείμενο.');await page.locator('#send').click();
  await page.waitForFunction(()=>!document.getElementById('send').disabled);
  assert.ok(requests.at(-1).includes('Το αρχείο μου περιέχει αυτό το κείμενο.'));
  await page.locator('#n7-library-button').click();await page.locator('#n7-source-library[open]').waitFor();
  await page.locator('#n7-source-library').getByRole('button',{name:'Προσθήκη βιβλίου',exact:true}).click();
  assert.ok(await page.locator('#n7-source-library input[type=file]').isVisible());
  await page.locator('#n7-source-library .n7-library-close').click();
  await page.getByRole('button',{name:'▥  Αναζήτηση πηγών',exact:true}).click();
  const archive=page.locator('section[aria-label="Αναζήτηση ιστορικών πηγών"]');await archive.waitFor({state:'visible'});
  assert.equal(await archive.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
  await archive.getByRole('button',{name:'Κλείσιμο',exact:true}).click();
  await page.getByRole('button',{name:'Έρευνα',exact:true}).click();await page.locator('#missions:not(.hidden)').waitFor();
  await page.locator('#missiontarget').fill('Νάξος');await page.locator('#missionpurpose').fill('Αναζήτησε ιστορικές πηγές για τη Νάξο τον 17ο αιώνα.');
  await page.locator('#missionform button[type=submit]').click();await page.waitForFunction(()=>localStorage.getItem('n7-last-mission'));
  await page.getByRole('button',{name:'Συνομιλία',exact:true}).click();await page.locator('#chat:not(.hidden)').waitFor();
  await page.locator('#taskview').click();await page.locator('#tasks:not(.hidden)').waitFor();
  await page.getByRole('button',{name:'Συνομιλία',exact:true}).click();
  await page.locator('#message').fill('N7_TEST_FAILURE: κράτησε το μήνυμά μου.');await page.locator('#send').click();
  await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('Δοκιμαστική αποτυχία'));
  assert.ok(await page.locator('#n7-writing-status').isHidden());
  assert.match(await page.locator('#message').inputValue(),/N7_TEST_FAILURE/);await page.locator('#message').fill('');
  await page.locator('#message').fill('Συνέχισε τη συζήτηση.');await page.locator('#send').click();await page.waitForFunction(()=>!document.getElementById('send').disabled);
  assert.ok(!(await page.locator('#notice').textContent()).includes('Δοκιμαστική αποτυχία'));
  await page.locator('#message').fill('N7_TEST_QUEUE');await page.locator('#send').click();await page.waitForFunction(()=>document.getElementById('n7-writing-status').textContent.includes('Σε αναμονή μοντέλου'));
  await page.evaluate(()=>api('/api/n7/job/44444444-4444-4444-8444-444444444444'));assert.match(await page.locator('#n7-writing-status').textContent(),/επεξεργάζεται/);
  await page.evaluate(()=>api('/api/n7/job/44444444-4444-4444-8444-444444444444'));assert.ok(await page.locator('#n7-writing-status').isHidden());
  await page.getByRole('button',{name:'Ρυθμίσεις εμφάνισης',exact:true}).click();await page.getByLabel('Μέγεθος κειμένου',{exact:true}).selectOption('18');
  assert.equal(await page.evaluate(()=>localStorage.getItem('n7-font-size')),'18');await page.locator('.n7-preferences').getByRole('button',{name:'Κλείσιμο',exact:true}).click();
  if(process.env.N7_SCREENSHOT_DIR){fs.mkdirSync(process.env.N7_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.N7_SCREENSHOT_DIR,'n7-desktop.png'),fullPage:true});}
  await page.setViewportSize({width:390,height:844});
  await page.locator('#toggle').click();await page.locator('.sidebar.show').waitFor();
  await page.locator('#n7-owner-memory-button').click();await page.locator('#n7-owner-memory-dialog[open]').waitFor();
  await page.getByRole('dialog').getByRole('button',{name:'Κλείσιμο',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=0);
  assert.ok(await page.locator('#send').isVisible());
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,'Mobile page must not overflow horizontally');
  if(process.env.N7_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.N7_SCREENSHOT_DIR,'n7-mobile.png'),fullPage:true});
  await page.locator('#toggle').click();await page.locator('#logout').click();await page.locator('#login:not(.hidden)').waitFor();
  assert.deepEqual(errors,[]);
  console.log('N7_MODERN_BROWSER_PASS login=true chat=true editingMode=true clipboard=true download=true correctionApproval=true memory=true search=true textAttachment=true library=true research=true tasks=true preferences=true mobile=true logout=true pageErrors=0');
 }finally{await browser.close();await new Promise(r=>app.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;app.close();});
