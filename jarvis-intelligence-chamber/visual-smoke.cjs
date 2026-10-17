const {chromium}=require("playwright");
const fs=require("node:fs"),assert=require("node:assert/strict");
(async()=>{const browser=await chromium.launch({headless:true,args:["--no-sandbox","--use-gl=angle","--use-angle=swiftshader","--enable-webgl","--enable-unsafe-swiftshader"]});
const out="jarvis-intelligence-chamber/screenshots";fs.mkdirSync(out,{recursive:true});
const report={created_at:new Date().toISOString(),screens:[],errors:[]};
try{for(const [name,width,height] of [["desktop",1600,900],["mobile",390,844]]){const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});page.on("pageerror",e=>report.errors.push(name+": "+e.message));page.on("console",m=>{if(m.type()==="error")report.errors.push(name+": "+m.text())});
const target=process.env.JARVIS_TEST_URL||"http://127.0.0.1:4179/jarvis-intelligence-chamber/";
// The local renderer harness is outside the production CORS allowlist.
// Forward the actual read-only status response; never fabricate research data.
// Public URL checks use the server's real CORS headers without this adapter.
if(new URL(target).hostname==='127.0.0.1')await page.route('https://pct-live.piratecartography.com/pct-api/live/status/**',async route=>{const response=await route.fetch();assert.equal(response.status(),200);await route.fulfill({response,headers:{...response.headers(),'access-control-allow-origin':new URL(target).origin}})});
await page.goto(target,{waitUntil:"networkidle",timeout:60000});
try{await page.waitForFunction(()=>/^[0-9]+ FPS$/.test(document.querySelector("#fps")?.textContent||""),{timeout:30000});}catch(err){console.error("FPS DIAGNOSTIC",JSON.stringify(await page.evaluate(()=>({fps:document.querySelector("#fps")?.textContent,canvas:!!document.querySelector("#universe"),map:document.querySelector("#nxMediterranean")?.dataset.mapError,hasMap:!!document.querySelector("#nxMediterranean"),body:document.body.className}))),report.errors);throw err;}
const result=await page.evaluate(()=>({canvasWidth:document.querySelector("#universe")?.width,labels:document.querySelectorAll(".node-label").length,bodyWidth:document.body.scrollWidth,viewport:innerWidth,detailHidden:document.querySelector("#detailPanel")?.classList.contains("hidden"),fps:document.querySelector("#fps")?.textContent,hasGreek:[...document.querySelectorAll(".node-label")].some(n=>n.textContent.includes("Greece")),hasMasthead:!!document.querySelector(".masthead"),hasSidebar:!!document.querySelector(".left-panel"),hasCentralHud:!!document.querySelector(".central-hud")}));
report.screens.push({name,...result});
await page.waitForFunction(()=>document.body.dataset.researchFeed==='LIVE'&&document.body.dataset.currentResearchRun,{timeout:20000});
report.transport={url:page.url(),mode:await page.evaluate(()=>document.body.dataset.researchFeed),run:await page.evaluate(()=>document.body.dataset.currentResearchRun)};
assert.equal(await page.locator("#nxDrawer").getAttribute("aria-hidden"),"true","Cinematic agent drawer must start closed");
assert.equal(await page.locator(".nx-dock [data-nx]").count(),7,"All workspace navigation destinations must exist");
await page.screenshot({path:out+"/"+name+".png",fullPage:true});
assert.equal(await page.locator("#nxMediterranean").count(),1,"Geographic Mediterranean layer must be mounted");
assert.equal(await page.locator(".nx-ops").count(),1,"Agent inspector must contain live telemetry");
assert.equal(await page.locator(".nx-dock [data-nx]").count(),7,"Cinematic menu destinations must be available");
assert.ok(result.canvasWidth>100,"Renderer must own visible canvas");
assert.match(result.fps,/^[0-9]+ FPS$/,"Frame loop must advance");
assert.equal(result.labels,17,"17 research nodes including Greek Archives must exist");
assert.equal(result.hasGreek,true,"Greece research node must exist");
assert.ok(result.bodyWidth<=result.viewport+4,"No horizontal overflow");
assert.ok(!report.errors.length,"No browser console/page errors: "+report.errors.join('; '));
assert.equal(result.hasCentralHud,false,"Central JARVIS HUD must remain removed");
if(name==="desktop"){
 assert.equal(result.hasSidebar,true,"Approved left command panel must remain");
 assert.equal(result.hasMasthead,true,"Approved masthead must remain");
 const before=await page.evaluate(()=>{const n=[...document.querySelectorAll(".node-label")].find(x=>x.textContent.includes("Greece"));const r=n.getBoundingClientRect();return Math.hypot(r.left+r.width/2-innerWidth*.5,r.top+r.height/2-innerHeight*.5)});
 await page.locator("#zoomIn").click();await page.waitForTimeout(900);
 const after=await page.evaluate(()=>{const n=[...document.querySelectorAll(".node-label")].find(x=>x.textContent.includes("Greece"));const r=n.getBoundingClientRect();return Math.hypot(r.left+r.width/2-innerWidth*.5,r.top+r.height/2-innerHeight*.5)});
 assert.ok(after>before+8,"Zoom-in must visibly increase projected node distance");
 await page.locator('.nx-dock [data-nx="agents"]').click();
 assert.equal(await page.locator("#nxDrawer").getAttribute("aria-hidden"),"false","Agent network opens on demand");
 assert.equal(await page.locator('.nx-agent').count(),17,"All 17 sectors are accessible through the cinematic menu");
 await page.locator('[data-agent="spanish_simancas"]').click();
 assert.equal(await page.locator("#nxDrawer").getAttribute("aria-hidden"),"true","Agent selection closes the menu");
 await page.waitForFunction(()=>!document.querySelector('#detailPanel').classList.contains('hidden'));
 assert.equal((await page.locator('#detailTitle').innerText()).trim(),'Spain','3D sector selection must open the selected agent');
 const liveDetail=page.locator('#detailLive');
 if(await liveDetail.count())assert.match(await liveDetail.innerText(),/RUN/,'Live run details are preserved');
 else assert.ok((await page.locator('#detailState').innerText()).trim().length>0,'Sector state must render');
 await page.locator('.nx-dock [data-nx="findings"]').click();
 await page.locator('[data-result-filter="contradictions"]').click();
 assert.ok(!(await page.locator('#resultsList').innerText()).includes('ΕΜΠΟΔΙΟ ·'),'Contradictions must not display access blockers');
 await page.locator('#closeResults').click();
 const layout=await page.evaluate(()=>{const a=document.querySelector('#operatorQuery').getBoundingClientRect(),b=document.querySelector('.exp-rail').getBoundingClientRect();return Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));});
 assert.equal(layout,0,'Command input must not overlap the experimental rail');
 report.realFeedChecked=true;
 if(await page.locator('#detailPanel').isVisible())await page.getByRole('button',{name:'Close details',exact:true}).click();
 await page.locator("#resetView").click();
}
await page.close();}
fs.writeFileSync(out+"/report.json",JSON.stringify(report,null,2));console.log("PASS",JSON.stringify(report));
}finally{fs.writeFileSync(out+"/report.json",JSON.stringify(report,null,2));await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
