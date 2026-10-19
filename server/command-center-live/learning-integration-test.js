"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "nabou-learning-test-"));
process.env.PCT_KNOWLEDGE_DIR = root;
process.env.PCT_OPERATOR_TOKEN = "local-test-operator-token";
const {server} = require("./app");
const auth={authorization:"Bearer local-test-operator-token"};
function pdfFixture(text){
  const stream="BT /F1 12 Tf 50 700 Td ("+text+") Tj ET";
  const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>","<< /Length "+stream.length+" >>\nstream\n"+stream+"\nendstream"];
  let value="%PDF-1.4\n",offsets=[0];
  objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(value));value+=(i+1)+" 0 obj\n"+obj+"\nendobj\n";});
  const offset=Buffer.byteLength(value);value+="xref\n0 6\n0000000000 65535 f \n";
  for(const pos of offsets.slice(1))value+=String(pos).padStart(10,"0")+" 00000 n \n";
  value+="trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n"+offset+"\n%%EOF\n";return Buffer.from(value);
}

function request(port, method, uri, body, headers={}) {
  return new Promise((resolve,reject)=>{
    const req=http.request({hostname:"127.0.0.1", port, method, path:"/pct-api/live"+uri, headers},res=>{
      const chunks=[];res.on("data",b=>chunks.push(b));
      res.on("end",()=>{
        try{resolve({status:res.statusCode,json:JSON.parse(Buffer.concat(chunks).toString("utf8"))});}
        catch(e){reject(e);}
      });
    });
    req.on("error",reject);
    req.end(body);
  });
}
async function main(){
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const port=server.address().port;
  try {
    const pdf=pdfFixture("The ship anchored at Milo in 1674.");
    for(const uri of ["/knowledge/upload","/knowledge/review"]){
      const denied=await request(port,"POST",uri,JSON.stringify({}),{"content-type":"application/json"});
      assert.equal(denied.status,401);
    }
    const uploaded=await request(port,"POST","/knowledge/upload",pdf,{
      ...auth,"content-type":"application/pdf","x-file-name":"Milos.pdf",
      "content-length":String(pdf.length)});
    assert.equal(uploaded.status,201);
    const id=uploaded.json.source_id;
    const review={source_id:id,pages:[{page:1,text:"Forged browser text: invented assertion at Milo."}],
      items:[{id:"e1",type:"toponym",text:"Milo",page:1,status:"accepted"},
             {id:"e2",type:"claim",text:"Unquoted invented statement",page:1,status:"accepted"}]};
    const reviewed=await request(port,"POST","/knowledge/review",JSON.stringify(review),{...auth,"content-type":"application/json"});
    assert.equal(reviewed.status,200);
    assert.equal(reviewed.json.attested_quotes,1);
    assert.equal(reviewed.json.unresolved_quotes,1);
    assert.equal(reviewed.json.historically_verified,false);
    const denied=await request(port,"GET","/knowledge/evidence?source_id="+id);
    assert.equal(denied.status,401);
    const evidence=await request(port,"GET","/knowledge/evidence?source_id="+id,null,
      {authorization:"Bearer local-test-operator-token"});
    assert.equal(evidence.status,200);
    const result=evidence.json.historical_evidence;
    assert.equal(result.attestations[0].locator,"page 1");
    assert.equal(result.attestations[0].exact_excerpt,"Milo");
    assert.equal(result.attestations[0].status,"UNREVIEWED");
    assert.equal(result.attestations[0].source_basis,"SERVER_PDF_PAGE_TEXT_EXACT_MATCH");
    assert.equal(result.attestations[0].original_pdf_replayed,true);
    assert.equal(result.verified_count,0);
    assert.match(result.attestations[0].source_sha256,/^[a-f0-9]{64}$/);
    const stored=JSON.parse(fs.readFileSync(path.join(root,id+".json")));
    assert.ok(stored.pages[0].text.includes("The ship anchored at Milo in 1674."));
    assert.ok(!stored.pages[0].text.includes("Forged"));
    const forged={...review,items:[{id:"forged",text:"Forged browser text",exact_excerpt:"Forged browser text",page:1,status:"accepted"}]};
    const rejected=await request(port,"POST","/knowledge/review",JSON.stringify(forged),{...auth,"content-type":"application/json"});
    assert.equal(rejected.json.attested_quotes,0);
    assert.equal(rejected.json.unresolved_quotes,1);
    assert.equal(fs.readdirSync(path.join(root,"review-history")).length,1);
    const search=await request(port,"GET","/knowledge/search?q=Milo",null,auth);
    assert.equal(search.status,200);
    assert.ok(search.json.results.length>=1);
    console.log("NABOU LIVE PDF LEARNING -> EVIDENCE API INTEGRATION PASS");
  } finally {
    await new Promise(resolve=>server.close(resolve));
    fs.rmSync(root,{recursive:true,force:true});
  }
}
main().catch(err=>{console.error(err);process.exitCode=1;});
