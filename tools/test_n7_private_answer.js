"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const os=require("node:os");
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const {seal,open}=require("./n7_private_aead");
// Test the exact production layout (reader + envelope in the same app directory).
const moduleDir=fs.mkdtempSync(path.join(os.tmpdir(),"n7-prod-modules-"));
fs.copyFileSync(path.join(__dirname,"n7_private_aead.js"),path.join(moduleDir,"n7_private_aead.js"));
fs.copyFileSync(path.join(__dirname,"library/n7-private-answer-reader.js"),path.join(moduleDir,"n7-private-answer-reader.js"));
const {readOwnerAnswer}=require(path.join(moduleDir,"n7-private-answer-reader.js"));
const ID="42434462262";

function fixture(){
  const base=fs.mkdtempSync(path.join(os.tmpdir(),"n7-private-reader-"));
  const dir=path.join(base,"n7-corpora",ID);
  fs.mkdirSync(dir,{recursive:true});
  const key=crypto.randomBytes(32);
  const keyFile=path.join(base,"key");fs.writeFileSync(keyFile,key);
  const body=Buffer.from(JSON.stringify({
    status:"MODEL_ASSISTED_REQUIRES_REVIEW",model_used:true,historically_verified:false,
    claims:[{claim_id:"c1",source_occurrences:[{
      title:"Test historical source",url:"https://example.org/document",
      locator:{printed_page:42}
    }]}],
    answer_sections:[{text:"The source mentions an anchorage, subject to original-page review."}],
    coverage:{selected_passages:12}
  }));
  const envelope=seal(body,key,"research:"+ID+":answer");
  fs.writeFileSync(path.join(dir,"answer.json.enc"),envelope);
  const receipt={schema:"n7-private-answer-index-v1",run_id:ID,
    sealed_sha256:crypto.createHash("sha256").update(envelope).digest("hex"),
    historically_verified:false};
  fs.writeFileSync(path.join(dir,"answer-index.json"),JSON.stringify(receipt));
  return {base,dir,keyFile,envelope,receipt,cleanup:()=>fs.rmSync(base,{recursive:true,force:true})};
}

test("private owner answer decrypts and preserves citations without asserting verification",()=>{
  const f=fixture();
  try{
    const result=readOwnerAnswer(f.base,ID,f.keyFile);
    assert.equal(result.schema,"n7-private-research-owner-answer-v1");
    assert.equal(result.historically_verified,false);
    assert.equal(result.model_used,true);
    assert.equal(result.claims_examined,1);
    assert.equal(result.selected_passages,12);
    assert.match(result.paragraphs[0],/anchorage/);
    assert.match(result.references[0],/42/);
    assert.equal(result.historical_verification,"NOT_VERIFIED");
    assert.equal(result.raw_source_text,undefined);
  }finally{f.cleanup();}
});

test("reader fails closed on ID confusion, absent data or altered encrypted bytes",()=>{
  const f=fixture();
  try{
    assert.throws(()=>readOwnerAnswer(f.base,"../outside",f.keyFile));
    assert.throws(()=>readOwnerAnswer(f.base,"12345678901",f.keyFile));
    const encrypted=path.join(f.dir,"answer.json.enc");
    const changed=Buffer.from(f.envelope);changed[19]^=1;
    fs.writeFileSync(encrypted,changed);
    assert.throws(()=>readOwnerAnswer(f.base,ID,f.keyFile),/CIPHERTEXT_CHANGED/);
  }finally{f.cleanup();}
});

test("AES-GCM forbids wrong purpose and tampering",()=>{
  const secret=crypto.randomBytes(32),source=Buffer.from("A private Naxos source quotation");
  const sealed=seal(source,secret,"research:"+ID+":greek:archive");
  assert.deepEqual(open(sealed,secret,"research:"+ID+":greek:archive"),source);
  assert.throws(()=>open(sealed,secret,"research:"+ID+":ottoman:archive"));
  const bad=Buffer.from(sealed);bad[bad.length-20]^=1;
  assert.throws(()=>open(bad,secret,"research:"+ID+":greek:archive"));
});

test("model cannot mark its result as historically verified",()=>{
  const f=fixture();
  try{
    const original=JSON.parse(open(f.envelope,fs.readFileSync(f.keyFile),"research:"+ID+":answer").toString());
    original.historically_verified=true;
    const sealed=seal(Buffer.from(JSON.stringify(original)),fs.readFileSync(f.keyFile),"research:"+ID+":answer");
    fs.writeFileSync(path.join(f.dir,"answer.json.enc"),sealed);
    f.receipt.sealed_sha256=crypto.createHash("sha256").update(sealed).digest("hex");
    fs.writeFileSync(path.join(f.dir,"answer-index.json"),JSON.stringify(f.receipt));
    assert.throws(()=>readOwnerAnswer(f.base,ID,f.keyFile),/PRIVATE_ANSWER_INVALID/);
  }finally{f.cleanup();}
});
