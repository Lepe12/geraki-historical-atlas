// Browser-only synthetic image, prevents anyone calling the test source historical.
const {chromium}=require("playwright");
const assert=require("node:assert/strict");
const http=require("node:http");
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const root=path.resolve(__dirname,"..");
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==","base64");
const hash=crypto.createHash("sha256").update(png).digest("hex");
const ocr={
  schema:"nabou-unlocated-historical-map-ocr-v1",
  source:{id:"synthetic:source-only",title:"SYNTHETIC PIXEL TEST",image_sha256:hash},
  georeferencing_status:"NOT_GEOREFERENCED",historically_verified:0,
  labels:[{id:"raw_label_1",text_raw:"MILO",pixel_bbox:[0,0,1,1],
    ocr_confidence:.91,geolocation:null,historically_verified:false}]
};

(async()=>{
 const server=http.createServer((req,res)=>{
   const u=new URL(req.url,"http://localhost");
   let f=path.resolve(root,"."+decodeURIComponent(u.pathname));
   if(f.endsWith(path.sep))f=path.join(f,"index.html");
   if(!f.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
   try{
     res.setHeader("content-type",f.endsWith(".mjs")?"text/javascript":
       f.endsWith(".css")?"text/css":f.endsWith(".js")?"text/javascript":"text/html");
     res.end(fs.readFileSync(f));
   }catch{res.writeHead(404);res.end();}
 });
 await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 let browser;
 try{
   browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
   const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
   const errors=[];page.on("pageerror",e=>errors.push(e.message));
   // The published site bundles the authentic chart. Stub only the transport here;
   // this browser test validates default visibility without making external requests.
   await page.route("**/assets/ollive-aegean-1662-preview.jpg",route=>route.fulfill({
     status:200,contentType:"image/png",
     body:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==","base64")
   }));
   await page.goto("http://127.0.0.1:"+server.address().port+"/jarvis-intelligence-chamber/historical-map-review.html");
   const defaultPreview=page.locator("#defaultPortolanPreview");
   assert.equal(await defaultPreview.isVisible(),true);
   await page.waitForFunction(()=>document.querySelector("#defaultPortolanImage")?.naturalWidth>0);
   assert.equal(await page.locator("#reviewCanvas").isVisible(),false);

   await page.locator("#originalImage").setInputFiles({name:"synthetic.png",mimeType:"image/png",buffer:png});
   assert.equal(await defaultPreview.isVisible(),false);
   assert.equal(await page.locator("#reviewCanvas").isVisible(),true);
   await page.locator("#ocrInput").setInputFiles({name:"synthetic.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(ocr))});
   await page.waitForFunction(()=>document.querySelector("#reviewStatus")?.textContent?.includes("SHA-256 εικόνας: MATCH"));
   await page.locator("#reviewer").fill("Researcher Test");
   await page.locator("#nextLabel").click();
   await page.locator("#correctedReading").fill("Milo");
   await page.locator("#acceptReading").click();
   assert.match(await page.locator("#reviewStats").innerText(),/readings_accepted.*1/s);
   await page.locator("#gcpX").fill("0.5");
   await page.locator("#gcpY").fill("0.5");
   await page.locator("#gcpLon").fill("24.4");
   await page.locator("#gcpLat").fill("36.7");
   await page.locator("#gcpPlace").fill("Synthetic Point — DO NOT USE FOR RESEARCH");
   await page.locator("#gcpReference").fill("https://example.org/synthetic");
   await page.locator("#addGcp").click();
   assert.match(await page.locator("#gcpCount").innerText(),/1 προτεινόμενα GCP/);
   const [event]=await Promise.all([page.waitForEvent("download"),page.locator("#exportReview").click()]);
   const stream=await event.createReadStream(),chunks=[];
   for await(const chunk of stream)chunks.push(chunk);
   const record=JSON.parse(Buffer.concat(chunks));
   assert.equal(record.schema,"nabou-manual-map-review-v1");
   assert.equal(record.historically_verified,0);
   assert.equal(record.map_georeferenced,false);
   assert.equal(record.gcps[0].state,"GCP_PROPOSED_NOT_VERIFIED");
   assert.equal(record.labels[0].final_reading,"Milo");
   assert.equal(record.labels[0].geolocation,null);
   assert.deepEqual(errors,[]);
   console.log("HISTORICAL_MAP_HUMAN_REVIEW_BROWSER_PASS");
 }finally{await browser?.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1;});
