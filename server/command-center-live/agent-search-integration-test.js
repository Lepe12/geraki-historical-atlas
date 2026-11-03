"use strict";
// End-to-end test of POST /knowledge/agent-search (normalised, stemmed, ranked) against a local server.
// GitHub's JWKS endpoint is replaced by a locally generated key: no network, nothing is sent anywhere.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const crypto = require("node:crypto");
const {EventEmitter} = require("node:events");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "nabou-agent-search-test-"));
process.env.PCT_KNOWLEDGE_DIR = root;
process.env.PCT_EVIDENCE_STORAGE_CLI = path.join(root,"test-storage-disabled.php");
process.env.PCT_OPERATOR_TOKEN = "local-test-operator-token";
const {publicKey, privateKey} = crypto.generateKeyPairSync("rsa", {modulusLength: 2048});
const jwk = {...publicKey.export({format: "jwk"}), kid: "local-test", alg: "RS256", use: "sig"};
https.get = (url, opts, cb) => {          // only the OIDC JWKS lookup is answered, locally
  assert.match(String(url), /token\.actions\.githubusercontent\.com\/\.well-known\/jwks$/);
  const res = new EventEmitter(); res.statusCode = 200; res.setEncoding = () => {}; res.destroy = () => {};
  const req = new EventEmitter(); req.setTimeout = () => {}; req.destroy = () => {};
  setImmediate(() => { cb(res); res.emit("data", JSON.stringify({keys: [jwk]})); res.emit("end"); });
  return req;
};
const b64 = x => Buffer.from(typeof x === "string" ? x : JSON.stringify(x)).toString("base64url");
function oidc(claims) {
  const head = b64({alg: "RS256", kid: "local-test", typ: "JWT"});
  const body = b64({iss: "https://token.actions.githubusercontent.com", aud: "piratecartography-command-center",
    repository: "Lepe12/geraki-historical-atlas", ref: "refs/heads/main", exp: Math.floor(Date.now()/1000) + 600, ...claims});
  const sig = crypto.sign("RSA-SHA256", Buffer.from(head + "." + body), privateKey).toString("base64url");
  return head + "." + body + "." + sig;
}
const {server} = require("./app");
const auth = {authorization: "Bearer local-test-operator-token"};
function pdfFixture(text){
  const stream="BT /F1 3 Tf 50 700 Td ("+text+") Tj ET";
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
    const sentence = Array.from({length: 14}, (_, i) => "Pirates Milos " + String(i + 1).padStart(2, "0")).join(" ") + ". The ships anchored at Milos in 1674.";
    const pdf=pdfFixture(sentence);
    const uploaded=await request(port,"POST","/knowledge/upload",pdf,{...auth,"content-type":"application/pdf","x-file-name":"Milos.pdf","content-length":String(pdf.length)});
    assert.equal(uploaded.status,201);
    const id=uploaded.json.source_id;
    const items=Array.from({length: 14}, (_, i) => ({id:"p"+i,type:"claim",text:"Pirates Milos "+String(i+1).padStart(2,"0"),
      exact_excerpt:"Pirates Milos "+String(i+1).padStart(2,"0"),page:1,status:"accepted"}));
    items.push({id:"s",type:"claim",text:"The ships anchored at Milos in 1674.",exact_excerpt:"The ships anchored at Milos in 1674.",page:1,status:"accepted"});
    const reviewed=await request(port,"POST","/knowledge/review",JSON.stringify({source_id:id,pages:[{page:1,text:"x"}],items}),{...auth,"content-type":"application/json"});
    assert.equal(reviewed.status,200,JSON.stringify(reviewed.json));
    assert.equal(reviewed.json.attested_quotes,15);
    const search=(query,token)=>request(port,"POST","/knowledge/agent-search",JSON.stringify({query}),{authorization:"Bearer "+(token||oidc({})),"content-type":"application/json"});
    assert.equal((await request(port,"POST","/knowledge/agent-search",JSON.stringify({query:"milos"}),{"content-type":"application/json"})).status,401);
    assert.notEqual((await search("milos",oidc({ref:"refs/heads/other"}))).status,200);
    // Stemmed + accent/case-folded + capped at 12
    const capped=await search("PIRATE Milos");
    assert.equal(capped.status,200);
    assert.equal(capped.json.schema,"nabou-agent-learning-evidence-v1");
    assert.equal(capped.json.query,"pirate milos");
    assert.equal(capped.json.hits.length,12);
    assert.equal(capped.json.count,12);
    assert.equal(capped.json.verified_count,0);
    assert.equal(capped.json.acquisition_basis,"PER_HIT_SOURCE_BASIS");
    for(const hit of capped.json.hits){
      assert.equal(hit.stage,"INGESTED_UNREVIEWED");
      assert.equal(hit.historically_verified,false);
      assert.deepEqual(Object.keys(hit),["source_id","source_name","attestation_id","page","locator","exact_excerpt","stage","original_pdf_replayed","source_sha256","historically_verified"]);
    }
    // Plural/singular and ranking: the sentence with both tokens in a tight window beats single-token excerpts
    const ships=await search("ship anchor");
    assert.equal(ships.json.hits.length,1);
    assert.equal(ships.json.hits[0].exact_excerpt,"The ships anchored at Milos in 1674.");
    const none=await search("completely absent term");
    assert.equal(none.status,200);
    assert.equal(none.json.hits.length,0);
    assert.equal((await search("ab")).status,400);
    console.log("NABOU LIVE AGENT-SEARCH INTEGRATION PASS");
  } finally {
    await new Promise(resolve=>server.close(resolve));
    fs.rmSync(root,{recursive:true,force:true});
  }
}
main().catch(err=>{console.error(err);process.exitCode=1;});
