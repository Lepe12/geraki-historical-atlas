const {chromium}=require("playwright");
const fs=require("node:fs"),assert=require("node:assert/strict");
(async()=>{const browser=await chromium.launch({headless:true,args:["--no-sandbox","--use-gl=angle","--use-angle=swiftshader","--enable-webgl","--enable-unsafe-swiftshader"]});
const out="jarvis-intelligence-chamber/screenshots";fs.mkdirSync(out,{recursive:true});
const report={created_at:new Date().toISOString(),screens:[],errors:[]};
try{for(const [name,width,height] of [["desktop",1600,900],["mobile",390,844]]){const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});page.on("pageerror",e=>report.errors.push(name+": "+e.message));page.on("console",m=>{if(m.type()==="error")report.errors.push(name+": "+m.text())});
await page.goto(process.env.JARVIS_TEST_URL||"http://127.0.0.1:4179/jarvis-intelligence-chamber/",{waitUntil:"networkidle",timeout:60000});
await page.waitForFunction(()=>/^[0-9]+ FPS$/.test(document.querySelector("#fps")?.textContent||""),{timeout:30000});
const result=await page.evaluate(()=>({canvasWidth:document.querySelector("#universe")?.width,labels:document.querySelectorAll(".node-label").length,bodyWidth:document.body.scrollWidth,viewport:innerWidth,detailHidden:document.querySelector("#detailPanel")?.classList.contains("hidden"),fps:document.querySelector("#fps")?.textContent,hasGreek:[...document.querySelectorAll(".node-label")].some(n=>n.textContent.includes("Greek Archives")),hasMasthead:!!document.querySelector(".masthead"),hasSidebar:!!document.querySelector(".left-panel"),hasCentralHud:!!document.querySelector(".central-hud")}));
report.screens.push({name,...result});
await page.screenshot({path:out+"/"+name+".png",fullPage:true});
assert.ok(result.canvasWidth>100,"Renderer must own visible canvas");
assert.match(result.fps,/^[0-9]+ FPS$/,"Frame loop must advance");
assert.equal(result.labels,17,"17 research nodes including Greek Archives must exist");
assert.equal(result.hasGreek,true,"Greek Archives node must exist");
assert.ok(result.bodyWidth<=result.viewport+4,"No horizontal overflow");
assert.ok(!report.errors.length,"No browser console/page errors");
assert.equal(result.hasCentralHud,false,"Central JARVIS HUD must remain removed");
if(name==="desktop"){
 assert.equal(result.hasSidebar,true,"Approved left command panel must remain");
 assert.equal(result.hasMasthead,true,"Approved masthead must remain");
 const before=await page.evaluate(()=>{const n=[...document.querySelectorAll(".node-label")].find(x=>x.textContent.includes("Greek Archives"));const r=n.getBoundingClientRect();return Math.hypot(r.left+r.width/2-innerWidth*.53,r.top+r.height/2-innerHeight*.5)});
 await page.locator("#zoomIn").click();await page.waitForTimeout(900);
 const after=await page.evaluate(()=>{const n=[...document.querySelectorAll(".node-label")].find(x=>x.textContent.includes("Greek Archives"));const r=n.getBoundingClientRect();return Math.hypot(r.left+r.width/2-innerWidth*.53,r.top+r.height/2-innerHeight*.5)});
 assert.ok(after>before+8,"Zoom-in must visibly increase projected node distance");
 await page.evaluate(()=>window.__jarvisSetActiveAgents?.(["greek","venetian"]));
 await page.waitForFunction(()=>document.body.dataset.skullMode==="ACTIVE");
 await page.waitForTimeout(900);
 await page.screenshot({path:out+"/desktop-active-skull.png"});
 const mode=await page.evaluate(()=>({skull:document.body.dataset.skullMode,active:document.body.dataset.activeAgents}));
 assert.equal(mode.skull,"ACTIVE","Active agents must trigger skull mode");
 assert.equal(mode.active,"2","Active agent count must be exposed");
 report.activeMode=mode;
 await page.locator("#resetView").click();
}
await page.close();}
fs.writeFileSync(out+"/report.json",JSON.stringify(report,null,2));console.log("PASS",JSON.stringify(report));
}finally{fs.writeFileSync(out+"/report.json",JSON.stringify(report,null,2));await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});