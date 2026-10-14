#!/usr/bin/env node
/* Real Chromium browser interaction smoke; saves screenshot artifacts.
 * Runs against the published V3 source served locally, deterministic snapshot fallback. */
import assert from "node:assert/strict";
import {readFile,stat} from "node:fs/promises";
import {existsSync} from "node:fs";
import {resolve,extname,join} from "node:path";
import {createServer} from "node:http";
import {chromium} from "playwright";
const ROOT=resolve(".");
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".png":"image/png",".svg":"image/svg+xml"};
const server=createServer(async(req,res)=>{
try{
const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
const relative=pathname.endsWith("/")?pathname+"index.html":pathname;
const file=resolve(ROOT,"."+relative);
if(!file.startsWith(ROOT+"/")){res.writeHead(403);res.end();return;}
const data=await readFile(file);
res.writeHead(200,{"content-type":mime[extname(file)]||"application/octet-stream","cache-control":"no-store"});res.end(data);
}catch(e){res.writeHead(404);res.end("Not found");}
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const port=server.address().port;
let browser;
try{
const chrome=["/usr/bin/google-chrome","/usr/bin/google-chrome-stable","/usr/bin/chromium","/opt/google/chrome/chrome"].find(existsSync);
browser=await chromium.launch({headless:true,executablePath:chrome||undefined,args:["--no-sandbox","--disable-dev-shm-usage","--use-gl=swiftshader"]});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const pageErrors=[];page.on("pageerror",error=>pageErrors.push(error.message));
const url="http://127.0.0.1:"+port+"/command-center-v3/?api="+encodeURIComponent("http://127.0.0.1:9");
await page.goto(url,{waitUntil:"domcontentloaded"});
await page.waitForFunction(()=>document.querySelector("#theater-seek")?.max!=="1",{timeout:35000});
await page.waitForTimeout(2500);
const initial=await page.locator("#theater-step").innerText();
assert.match(initial,/\d+\s*\/\s*\d+\s*REAL EVENTS/,"Recorded research is visible, not a static template.");
assert.equal(await page.locator("#arrival").isVisible(),false,"Intro must not block entry");
assert.ok((await page.locator(".archive-node").count())>=7,"Real reference archive positions must be interactive.");
const before=await page.locator("#theater-step").innerText();
await page.locator("#theater-next").click();
const after=await page.locator("#theater-step").innerText();
assert.notEqual(before,after,"Replay control changes real data position.");
await page.locator("[data-view=evidence]").click();
await page.locator("[data-evidence-kind=blockers]").click();
assert.ok((await page.locator(".pct-record").count())>0,"Actual access blockers must be inspectable.");
await page.locator(".pct-record").first().click();
assert.match(await page.locator("#citation-strip").innerText(),/Εμπόδιο αρχειακής πρόσβασης/);
await page.locator("[data-view=timeline]").click();
assert.ok((await page.locator(".trace-row").count())>0,"Real run timeline rows must be present.");
await page.locator("#timeline-agent-filter").selectOption({index:1});
assert.ok((await page.locator(".trace-row").count())>0,"Agent filter must preserve matching records.");
await page.locator("[data-view=review]").click();
assert.equal(await page.locator(".review-actions button").first().isDisabled(),true,"Unauthenticated historical approvals stay disabled.");
await page.locator("[data-view=world]").click();
await page.screenshot({path:"/tmp/piratecartography-v3-desktop.png",fullPage:true});
const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
mobile.on("pageerror",e=>pageErrors.push("mobile: "+e.message));
await mobile.goto(url,{waitUntil:"domcontentloaded"});
await mobile.waitForFunction(()=>document.querySelector("#theater-seek")?.max!=="1",{timeout:35000});
await mobile.screenshot({path:"/tmp/piratecartography-v3-mobile.png",fullPage:true});
const clipped=await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
assert.equal(clipped,false,"No global horizontal overflow on mobile");
assert.deepEqual(pageErrors,[],"No page JS exceptions");
console.log("PASS: real Chromium loaded map UI + snapshot, replay advanced, blocker inspection, filtered timeline, read-only review, mobile responsive. Screen captures /tmp/piratecartography-v3-{desktop,mobile}.png");
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
