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
    const pdf=Buffer.from("%PDF-1.4\n% minimal integration fixture\n");
    const uploaded=await request(port,"POST","/knowledge/upload",pdf,{
      "content-type":"application/pdf","x-file-name":"Milos.pdf",
      "content-length":String(pdf.length)});
    assert.equal(uploaded.status,201);
    const id=uploaded.json.source_id;
    const review={source_id:id,pages:[{page:12,text:"The ship anchored at Milo in 1674."}],
      items:[{id:"e1",type:"toponym",text:"Milo",page:12,status:"accepted"},
             {id:"e2",type:"claim",text:"Unquoted invented statement",page:12,status:"accepted"}]};
    const reviewed=await request(port,"POST","/knowledge/review",JSON.stringify(review),{"content-type":"application/json"});
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
    assert.equal(result.attestations[0].locator,"page 12");
    assert.equal(result.attestations[0].exact_excerpt,"Milo");
    assert.equal(result.attestations[0].status,"UNREVIEWED");
    assert.equal(result.attestations[0].source_basis,"CLIENT_SUPPLIED_PAGE_TEXT_EXACT_MATCH");
    assert.equal(result.attestations[0].original_pdf_replayed,false);
    assert.equal(result.verified_count,0);
    const search=await request(port,"GET","/knowledge/search?q=Milo");
    assert.equal(search.status,200);
    assert.ok(search.json.results.length>=1);
    console.log("NABOU LIVE PDF LEARNING -> EVIDENCE API INTEGRATION PASS");
  } finally {
    await new Promise(resolve=>server.close(resolve));
    fs.rmSync(root,{recursive:true,force:true});
  }
}
main().catch(err=>{console.error(err);process.exitCode=1;});
