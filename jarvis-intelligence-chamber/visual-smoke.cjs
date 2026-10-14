const {chromium}=require("playwright");
const fs=require("node:fs"),assert=require("node:assert/strict");
(async()=>{const browser=await chromium.launch({headless:true,args:["--no-sandbox","--use-gl=angle","--use-angle=swiftshader","--enable-webgl","--enable-unsafe-swiftshader"]});
const out="jarvis-intelligence-chamber/screenshots";fs.mkdirSync(out,{recursive:true});
const report={created_at:new Date().toISOString(),screens:[],errors:[]};
try{for(const [name,width,height] of [["desktop",1600,900],["mobile",390,844]]){const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});page.on("pageerror",e=>report.errors.push(name+": "+e.message));page.on("console",m=>{if(m.type()==="error")report.errors.push(name+": "+m.text())});
await page.goto("http://127.0.0.1:4179/jarvis-intelligence-chamber/",{waitUntil:"networkidle",timeout:60000});
await page.waitForTimeout(1500);
const result=await page.evaluate(()=>({canvasWidth:document.querySelector("#universe")?.width,labels:document.querySelectorAll(".node-label").length,bodyWidth:document.body.scrollWidth,viewport:innerWidth,detailHidden:document.querySelector("#detailPanel")?.classList.contains("hidden"),fps:document.querySelector("#fps")?.textContent}));
report.screens.push({name,...result});
await page.screenshot({path:out+"/"+name+".png",fullPage:true});
assert.ok(result.canvasWidth>100,"3D renderer must own visible canvas");
assert.equal(result.labels,16,"16 agent labels must exist");
assert.ok(result.bodyWidth<=result.viewport+4,"No horizontal overflow");
assert.ok(!report.errors.length,"No browser console/page errors");
if(name==="desktop"){await page.locator("#zoomIn").click();await page.locator("#resetView").click();await page.locator('[data-view="archives"]').click();assert.equal(await page.locator("#detailTitle").innerText(),"Spanish / Simancas");await page.screenshot({path:out+"/desktop-focused.png"});}
await page.close();}
fs.writeFileSync(out+"/report.json",JSON.stringify(report,null,2));console.log("PASS",JSON.stringify(report));
}finally{fs.writeFileSync(out+"/report.json",JSON.stringify(report,null,2));await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
