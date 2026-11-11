"use strict";
// Tests for the public site chat («Ρώτα τον Καπετάνιο»). Run: node server/command-center-live/site-chat.test.js
const assert=require("assert"),http=require("http"),fs=require("fs"),path=require("path"),os=require("os");
const {createSiteChat}=require("./site-chat");
const {createAsk}=require("./site-ask-core");
(async()=>{
  // 1. Search core on a tiny fixture: Greek accents/inflection, links, and the honest "not found".
  const fx={items:[
    {id:1,type:"άρθρο",title:"Πέτρος Λάντζας – Ο Πειρατής Κατάσκοπος",url:"https://www.piratecartography.com/archives/114",text:"Ο Πέτρος Λάντζας ήταν Κερκυραίος κουρσάρος και κατάσκοπος του 16ου αιώνα."},
    {id:2,type:"άρθρο",title:"Γαλέρα",url:"https://www.piratecartography.com/archives/4065",text:"Η γαλέρα υπήρξε το κατ’ εξοχήν κωπήλατο σκάφος της εποχής."},
    {id:3,type:"βιβλίο / έντυπο",title:"Το Ρεσάλτο",url:"https://www.piratecartography.com/product/to-resalto",text:"Μυθιστόρημα για τον Λάντζα."}]};
  const ask=createAsk(fx);
  let r=ask("Ποιος ήταν ο ΠΕΤΡΟΣ ΛΑΝΤΖΑ;");assert.equal(r.found,true);assert.equal(r.links[0].url,fx.items[0].url);
  r=ask("Τι ήταν η γαλέρα;");assert.equal(r.links[0].title,"Γαλέρα");
  r=ask("Πόσο κοστίζει ένα iPhone;");assert.equal(r.found,false);assert.match(r.answer,/Δεν βρήκα κάτι στο site/);
  r=ask("Ποια βιβλία έχει το site;");assert.equal(r.found,true);assert.ok(r.links.some(l=>l.url.endsWith("/product/to-resalto")));
  // 2. The committed index holds only public piratecartography.com pages (no library PDFs/OCR, no private hosts).
  const idx=JSON.parse(fs.readFileSync(path.join(__dirname,"site-index.json"),"utf8"));
  assert.ok(idx.items.length>=40,"index too small");
  for(const it of idx.items){assert.match(it.url,/^https:\/\/www\.piratecartography\.com\//);assert.ok(it.text.length<=8000);}
  const assets=JSON.parse(fs.readFileSync(path.join(__dirname,"site-chat-assets.json"),"utf8"));
  assert.ok(Buffer.from(assets.captain,"base64").subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff])),"captain must be a JPEG");
  assert.ok(fs.statSync(path.join(__dirname,"site-chat-assets.json")).size<3_000_000,"assets too large");
  // 3. Handler: answers with links + images, rate limit 20 per 10 minutes per visitor, static files.
  let clock=0;const chat=createSiteChat({now:()=>clock});
  const app=http.createServer(async(req,res)=>{
    const json=(res,s,o,extra={})=>{res.writeHead(s,{"content-type":"application/json; charset=utf-8",...extra});res.end(JSON.stringify(o));};
    const readBody=(req,max)=>new Promise((ok,no)=>{let b="";req.on("data",c=>{b+=c;if(b.length>max)no(new Error("big"));});req.on("end",()=>ok(b));});
    if(!(await chat.handle(req,res,new URL(req.url,"http://x").pathname,{json,readBody}))){res.writeHead(404);res.end();}
  });
  await new Promise(ok=>app.listen(0,"127.0.0.1",ok));const port=app.address().port;
  const call=(method,p,body,headers={})=>new Promise((ok,no)=>{const q=http.request({port,host:"127.0.0.1",method,path:p,headers:{"content-type":"application/json",...headers}},res=>{const c=[];res.on("data",d=>c.push(d));res.on("end",()=>ok({status:res.statusCode,headers:res.headers,body:Buffer.concat(c)}));});q.on("error",no);if(body)q.write(body);q.end();});
  r=await call("POST","/site/ask",JSON.stringify({question:"Ποιος ήταν ο Πέτρος Λάντζας;"}),{"x-forwarded-for":"1.1.1.1"});
  assert.equal(r.status,200);let j=JSON.parse(r.body);assert.equal(j.found,true);
  assert.ok(j.links.length>=1&&j.links.every(l=>/^https:\/\/www\.piratecartography\.com\//.test(l.url)&&l.title));
  assert.ok(j.links.some(l=>/Λάντζα/i.test(l.title)));
  for(let i=1;i<20;i++)assert.equal((await call("POST","/site/ask",JSON.stringify({question:"γαλέρα"}),{"x-forwarded-for":"1.1.1.1"})).status,200);
  assert.equal((await call("POST","/site/ask",JSON.stringify({question:"γαλέρα"}),{"x-forwarded-for":"1.1.1.1"})).status,429);
  assert.equal((await call("POST","/site/ask",JSON.stringify({question:"γαλέρα"}),{"x-forwarded-for":"2.2.2.2"})).status,200);
  clock+=10*60*1000+1;
  assert.equal((await call("POST","/site/ask",JSON.stringify({question:"γαλέρα"}),{"x-forwarded-for":"1.1.1.1"})).status,200);
  assert.equal((await call("POST","/site/ask","not json",{"x-forwarded-for":"3.3.3.3"})).status,400);
  for(const p of ["/site/captain","/site/captain.jpg"]){r=await call("GET",p);assert.equal(r.status,200);assert.equal(r.headers["content-type"],"image/jpeg");}
  // Live image URLs must be extensionless (Plesk nginx serves *.jpg/*.js itself and returns 404).
  assert.ok(j.links.filter(l=>l.image).every(l=>/\/site\/thumbs\/\d+$/.test(l.image)),"thumb URLs must be extensionless");
  r=await call("GET","/site/widget");assert.equal(r.status,200);assert.match(r.headers["content-type"],/javascript/);
  assert.ok(!/site\/captain\.jpg/.test(r.body.toString()),"widget must use the extensionless portrait URL");
  r=await call("GET","/site/widget.js");assert.equal(r.status,200);assert.match(r.body.toString(),/Ρώτα τον Καπετάνιο/);assert.match(r.body.toString(),/pct-live\.piratecartography\.com\/site\/ask/);
  const someThumb=idx.items.find(x=>x.thumb);if(someThumb){r=await call("GET","/site/thumbs/"+someThumb.thumb);assert.equal(r.status,200);r=await call("GET","/site/thumbs/"+someThumb.thumb.split(".")[0]);assert.equal(r.status,200);assert.match(r.headers["content-type"],/^image\//);}
  assert.equal((await call("GET","/site/thumbs/999999999.jpg")).status,404);
  assert.equal((await call("GET","/site/thumbs/../../app.js")).status,404);
  app.close();
  // 4. app.js allows the WordPress site origins for CORS.
  const src=fs.readFileSync(path.join(__dirname,"app.js"),"utf8");
  assert.match(src,/"https:\/\/www\.piratecartography\.com"/);assert.match(src,/"https:\/\/piratecartography\.com"/);
  // 5. The deployment uploads every file the chat needs.
  const deploy=fs.readFileSync(path.join(__dirname,"../../tools/gateway/deploy_ftps.py"),"utf8");
  for(const f of ["site-ask-core.js","site-chat.js","site-widget.js","site-index.json","site-chat-assets.json"])assert.ok(deploy.includes('"'+f+'"'),f+" missing from deploy_ftps.py");
  console.log("SITE CHAT TESTS PASS");process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
