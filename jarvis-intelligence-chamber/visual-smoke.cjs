const {chromium}=require("playwright");
const fs=require("node:fs"),assert=require("node:assert/strict");
(async()=>{const browser=await chromium.launch({headless:true,args:["--no-sandbox","--use-gl=angle","--use-angle=swiftshader","--enable-webgl","--enable-unsafe-swiftshader"]});
const out="jarvis-intelligence-chamber/screenshots";fs.mkdirSync(out,{recursive:true});
const report={created_at:new Date().toISOString(),screens:[],errors:[]};
try{for(const [name,width,height] of [["desktop",1600,900],["mobile",390,844]]){const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});page.on("pageerror",e=>report.errors.push(name+": "+e.message));page.on("console",m=>{if(m.type()==="error")report.errors.push(name+": "+m.text())});
await page.goto(process.env.JARVIS_TEST_URL||"https://lepe12.github.io/geraki-historical-atlas/jarvis-intelligence-chamber/",{waitUntil:"networkidle",timeout:60000});
await page.waitForFunction(()=>/^[0-9]+ FPS$/.test(document.querySelector("#fps")?.textContent||""),{timeout:30000});
const result=await page.evaluate(()=>({canvasWidth:document.querySelector("#universe")?.width,labels:document.querySelectorAll(".node-label").length,bodyWidth:document.body.scrollWidth,viewport:innerWidth,detailHidden:document.querySelector("#detailPanel")?.classList.contains("hidden"),fps:document.querySelector("#fps")?.textContent}));
report.screens.push({name,...result});
await page.screenshot({path:out+"/"+name+".png",fullPage:true});
if(name==="desktop"){
 await page.waitForFunction(()=>["DURABLE SNAPSHOT","LIVE BOOTSTRAP","LIVE EVENT"].includes(document.body.dataset.evidenceSource),{timeout:12000});
 const evidence=await page.evaluate(()=>({source:document.body.dataset.evidenceSource,count:Number(document.body.dataset.evidenceRecords),run:document.body.dataset.evidenceRun}));
 assert.ok(evidence.count>=0&&evidence.run,"Recorded evidence nodes must have a durable run ID");
 report.evidence=evidence;
}
assert.ok(result.canvasWidth>100,"3D renderer must own visible canvas");
assert.match(result.fps,/^[0-9]+ FPS$/,"3D frame loop must advance");
assert.equal(result.labels,23,"7 regions and 16 agents must exist");
assert.ok(result.bodyWidth<=result.viewport+4,"No horizontal overflow");
assert.ok(!report.errors.length,"No browser console/page errors");
if(name==="desktop"){await page.locator("#zoomIn").click();await page.locator("#resetView").click();assert.equal(await page.locator(".left-panel").count(),0,"No sidebar dashboard");assert.equal(await page.locator(".masthead").count(),0,"No top dashboard");assert.equal(await page.getByText("PIRATECARTOGRAPHY").count(),0,"No unsolicited branding");// Verify real spatial fly-to navigation instead of screenshot-only smoke.
const regionXY=await page.evaluate(()=>{
 const label=[...document.querySelectorAll(".node-label")].find(n=>n.textContent==="WESTERN ARCHIVES");
 return {x:parseFloat(label.style.left),y:parseFloat(label.style.top)};
});
assert.ok(Number.isFinite(regionXY.x)&&Number.isFinite(regionXY.y),"Region projection exists");
await page.mouse.click(regionXY.x,regionXY.y);
await page.waitForTimeout(400);
const region=await page.evaluate(()=>document.body.dataset.activeRegion);
assert.ok(region&&region!=="OVERVIEW","Clicking the Western region must initiate 3D navigation");
await page.waitForTimeout(1450);
await page.screenshot({path:out+"/desktop-region-exploration.png"});
await page.keyboard.press("Escape");
await page.waitForFunction(()=>document.body.dataset.activeRegion==="OVERVIEW");
await page.screenshot({path:out+"/desktop-focused.png"});}
await page.close();}
fs.writeFileSync(out+"/report.json",JSON.stringify(report,null,2));console.log("PASS",JSON.stringify(report));
}finally{fs.writeFileSync(out+"/report.json",JSON.stringify(report,null,2));await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
