"use strict";
const assert=require("node:assert/strict");
const {chromium}=require("playwright-core");
(async()=>{
 const target=new URL(process.env.N7_VISUAL_URL||"http://127.0.0.1:4173/n7-apex-step5-hacker/");
 target.searchParams.set("face","hacker");target.searchParams.set("controls","1");
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||"/usr/bin/chromium",args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  const page=await browser.newPage({viewport:{width:1140,height:820}});
  const errors=[];page.on("pageerror",e=>errors.push(String(e)));
  const response=await page.goto(target.href,{waitUntil:"domcontentloaded"});
  assert.ok(response?.ok(),"Hacker visual route failed HTTP");
  const figure=page.getByRole("img",{name:"N7 Hacker visual trial"});
  await figure.waitFor({state:"visible"});
  await page.waitForFunction(()=>document.querySelector('[aria-label="N7 Hacker visual trial"]')?.dataset.ready==="true",{timeout:12000});
  const count=Number(await figure.getAttribute("data-particles"));
  assert.ok(count>300,"Hacker art did not produce particles: "+count);
  await page.getByRole("button",{name:"Original",exact:true}).click();
  const img=page.getByRole("img",{name:"Approved N7 idle reference"});
  await img.waitFor({state:"visible"});
  assert.ok((await img.getAttribute("src")).includes("n7-hacker-v1.webp"),"Original shows old avatar");
  await page.getByRole("button",{name:"Particles",exact:true}).click();
  await page.getByRole("button",{name:"Listening",exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="N7 Hacker visual trial"]')?.dataset.mood==="listening");
  await page.getByRole("button",{name:"Speaking",exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="N7 Hacker visual trial"]')?.dataset.mood==="speaking");
  const encoded=await figure.locator("canvas").evaluate(c=>c.toDataURL("image/png"));
  assert.ok(encoded.length>3000,"Hacker preview canvas blank");
  await page.getByRole("button",{name:"Assembly",exact:true}).click();
  await page.waitForFunction(()=>Number(document.querySelector('[aria-label="N7 Hacker visual trial"]')?.dataset.assembly)<100);
  assert.deepEqual(errors,[],"Hacker route JS exceptions");
  console.log("N7_HACKER_PREVIEW_VERIFIED=true particles="+count+" canvasPng="+encoded.length);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});