import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {readFile} from "node:fs/promises";
import {chromium} from "playwright";
const root="http://127.0.0.1:4179";
const endpoint=root+"/geraki-historical-atlas/command-center-v5/";
const snapshot=JSON.parse(await readFile("../command-center/live/latest.json","utf8"));
assert.equal(snapshot.schema,"pct-command-center-live-v1");
const server=spawn("npx",["vite","preview","--host","127.0.0.1","--port","4179","--strictPort"],{stdio:"pipe"});
let browser;
try{
 let ready=false;for(let i=0;i<70;i++){try{const r=await fetch(endpoint);if(r.ok){ready=true;break}}catch(_){}await new Promise(r=>setTimeout(r,300))}
 assert.equal(ready,true,"Vite preview must start");
 browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage","--enable-unsafe-swiftshader","--use-gl=swiftshader"]});
 async function preparePage(viewport){
   const page=await browser.newPage({viewport,deviceScaleFactor:1});
   const errors=[];page.on("pageerror",error=>errors.push(error.message));
   await page.route("**/pct-api/live/**",route=>route.abort());
   await page.route("**/command-center/live/latest.json",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(snapshot)}));
   await page.goto(endpoint,{waitUntil:"domcontentloaded",timeout:40000});
   await page.waitForFunction(()=>document.querySelector(".live-tag")?.textContent?.includes("DURABLE SNAPSHOT"),{timeout:35000});
   return {page,errors};
 }
 const {page,errors}=await preparePage({width:1600,height:900});
 assert.equal(await page.locator(".live-tag").innerText(),"DURABLE SNAPSHOT");
 assert.equal(await page.locator('.network-world svg[aria-label="JARVIS research agent network"]').count(),1);
 assert.ok((await page.locator('.network-world svg[aria-label="JARVIS research agent network"] text').allTextContents()).length>=16,"All actual JARVIS agents should appear");
 assert.equal((await page.locator(".deck-data").innerText()).includes("/ 142 EVENTS"),true,"Replay uses true event count");
 await page.locator(".play-controls .play").click();await page.waitForTimeout(1100);
 assert.ok(await page.locator(".chamber.replaying").count()===1,"Actual recorded playback must activate");
 await page.locator(".play-controls .play").click();
 await page.screenshot({path:"/tmp/jarvis-v5-network-desktop.png",fullPage:true});
 await page.getByRole("button",{name:"ARCHIVES",exact:true}).click();
 await page.locator(".records-scroll .record").first().click();
 assert.match(await page.locator(".reading-body.selected .datum").first().innerText(),/.+/);
 await page.getByRole("button",{name:"SCIENTIFIC REVIEW",exact:true}).click();
 assert.equal((await page.locator(".metric-box").nth(2).innerText()).includes("0"),true,"No false verified claims");
 assert.equal(await page.locator(".gate-actions button").first().isDisabled(),true);
 await page.getByRole("button",{name:"NETWORK",exact:true}).click();
 await page.getByRole("button",{name:/NEW RESEARCH MISSION/}).click();
 assert.equal(await page.getByRole("dialog").count(),1);
 await page.getByRole("button",{name:/PREPARE AUDITABLE DRAFT/}).click();
 assert.match(await page.getByRole("dialog").locator("pre").innerText(),/DRAFT_NOT_DISPATCHED/);
 assert.deepEqual(errors,[],"Browser JS errors");
 const mobile=await preparePage({width:390,height:844});
 await mobile.page.screenshot({path:"/tmp/jarvis-v5-network-mobile.png",fullPage:true});
 assert.equal(await mobile.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+4),false,"Mobile should not overflow");
 assert.deepEqual(mobile.errors,[]);
 console.log("PASS: APEX original SVG network, 16 JARVIS agent nodes, 142 real replay events, evidence, scientific review, mission draft, mobile.");
}finally{if(browser)await browser.close();server.kill("SIGTERM");}
