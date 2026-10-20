// Real browser smoke with SYNTHETIC polygons, never fabricated historical claims.
const {chromium}=require("playwright");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const http=require("node:http");
const path=require("node:path");

const root=path.resolve(__dirname,"..");
const sample={type:"FeatureCollection",schema:"nabou-historical-map-features-v1",
  metadata:{source_id:"synthetic:fixture",source_url:"https://example.org/nonhistoric-fixture",
    title:"Synthetic Fixture",rights:"test-fixture",crs:"EPSG:4326"},
  features:[{type:"Feature",id:"maplabel_test",
    geometry:{type:"Polygon",coordinates:[[[24,37],[24.2,37],[24.2,37.2],[24,37]]]},
    properties:{label:"Milo",raw_ocr_label:"MILO",map_title:"Synthetic Fixture",
      source_id:"synthetic:fixture",source_url:"https://example.org/nonhistoric-fixture",
      source_rights:"test-fixture",start_year:1650,end_year:1700,
      geometry_role:"MAP_TEXT_FOOTPRINT_NOT_ATTESTED_PLACE_GEOMETRY",
      historical_claim_verified:false,ocr_score:0.9}}]};
const matches={schema:"nabou-historical-map-candidates-v1",historically_verified:0,operator_approved:0,
  candidates:[{map_feature_id:"maplabel_test",candidate_place_id:"place:whg:synthetic",
    candidate_name:"Milo",candidate_status:"SUGGESTED",historically_verified:false,
    score_relative:100,name_confidence_absolute:100}]};

(async()=>{
 const server=http.createServer((req,res)=>{
   const u=new URL(req.url,"http://localhost");
   const file=path.resolve(root,"."+decodeURIComponent(u.pathname));
   if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
   try {
     const type=file.endsWith(".mjs")?"text/javascript":file.endsWith(".css")?"text/css":"text/html";
     res.setHeader("content-type",type);res.end(fs.readFileSync(file));
   }catch(_){res.writeHead(404);res.end();}
 });
 await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 let browser;
 try {
   browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
   const page=await browser.newPage({viewport:{width:1440,height:900}});
   const errors=[];page.on("pageerror",e=>errors.push(e.message));
   await page.route("**/cdn.jsdelivr.net/**",r=>r.abort()); // coast optional; grid must work offline
   // The published site bundles the authentic chart. Stub only the transport here;
   // this browser test validates default visibility without making external requests.
   await page.route("**/assets/ollive-aegean-1662-preview.jpg",route=>route.fulfill({
     status:200,contentType:"image/png",
     body:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==","base64")
   }));
   await page.goto("http://127.0.0.1:"+server.address().port+"/jarvis-intelligence-chamber/historical-map-lab.html");
   const sourceImage=page.locator("#historicalMapPreview");
   assert.equal(await sourceImage.isVisible(),true);
   await page.waitForFunction(()=>document.querySelector("#historicalMapPreview")?.naturalWidth>0);
   await page.locator("#rawOcrFile").setInputFiles({
     name:"unlocated-realistic-ocr-fixture.json",mimeType:"application/json",
     buffer:Buffer.from(JSON.stringify({
       schema:"nabou-unlocated-historical-map-ocr-v1",
       source:{id:"synthetic",title:"Synthetic OCR fixture"},
       georeferencing_status:"NOT_GEOREFERENCED",historically_verified:0,
       labels:[{text_raw:"TERMIA",pixel_bbox:[10,20,30,12],
         ocr_confidence:0.82,geolocation:null,historically_verified:false}]
     }))
   });
   assert.match(await page.locator("#rawOcrReport").innerText(),/TERMIA/);
   assert.match(await page.locator("#mapCount").innerText(),/0 γεωαναφερμένες/);
   await page.locator("#featuresFile").setInputFiles({
     name:"synthetic.geojson",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(sample))
   });
   await page.waitForFunction(()=>document.querySelector("#mapCount")?.textContent?.includes("1 γεωαναφερμένες"));
   const map=page.locator("#mapCanvas"),b=await map.boundingBox();
   const x=35+(24.1+18)/66*(b.width-70),y=35+(48-37.05)/24*(b.height-70);
   await map.click({position:{x,y}});
   assert.match(await page.locator("#details").innerText(),/Milo/);
   assert.match(await page.locator("#details").innerText(),/ΜΗ ΕΠΑΛΗΘΕΥΜΕΝΗ/);
   await page.locator("#candidatesFile").setInputFiles({
     name:"whg-synthetic.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(matches))
   });
   await page.waitForFunction(()=>document.querySelector("#status")?.textContent?.includes("1 υποψήφιες"));
   await map.click({position:{x,y}});
   assert.match(await page.locator("#details").innerText(),/place:whg:synthetic/);
   await page.locator("#year").evaluate(el=>{el.value="1800";el.dispatchEvent(new Event("input",{bubbles:true}));});
   assert.match(await page.locator("#mapCount").innerText(),/0 γεωαναφερμένες/);
   await page.locator("#year").evaluate(el=>{el.value="1670";el.dispatchEvent(new Event("input",{bubbles:true}));});
   assert.match(await page.locator("#mapCount").innerText(),/1 γεωαναφερμένες/);
   assert.deepEqual(errors,[]);
   console.log("HISTORICAL_MAP_BROWSER_SMOKE_PASS");
 } finally {
   await browser?.close();await new Promise(ok=>server.close(ok));
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
