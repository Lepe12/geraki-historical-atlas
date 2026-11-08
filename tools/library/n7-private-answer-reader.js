"use strict";
/** Session-only N7 research answer reader. Never serves the raw corpus or sealed bytes. */
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const {open}=require("./n7_private_aead");
const ID=/^[0-9]{8,20}$/;

function readOwnerAnswer(dataDir,runId,keyFile=path.join(__dirname,".n7-library-bridge-key")){
  if(typeof runId!=="string"||!ID.test(runId))throw Error("INVALID_PRIVATE_RESEARCH_RUN");
  const dir=path.join(dataDir,"n7-corpora",runId);
  const statusFile=path.join(dir,"answer-index.json");
  const sealedFile=path.join(dir,"answer.json.enc");
  if(!fs.existsSync(statusFile)||!fs.existsSync(sealedFile))throw Error("PRIVATE_ANSWER_NOT_READY");
  const index=JSON.parse(fs.readFileSync(statusFile,"utf8"));
  if(index.schema!=="n7-private-answer-index-v1"||index.run_id!==runId||
     index.historically_verified!==false||!/^[a-f0-9]{64}$/.test(index.sealed_sha256))
    throw Error("PRIVATE_ANSWER_INDEX_INVALID");
  if(fs.statSync(sealedFile).size>8_000_100)throw Error("PRIVATE_ANSWER_TOO_LARGE");
  const ciphertext=fs.readFileSync(sealedFile);
  const check=crypto.createHash("sha256").update(ciphertext).digest("hex");
  if(check!==index.sealed_sha256)throw Error("PRIVATE_ANSWER_CIPHERTEXT_CHANGED");
  const key=fs.readFileSync(keyFile);
  if(key.length!==32)throw Error("PRIVATE_RESEARCH_KEY_MISSING");
  let value;
  try{
    value=JSON.parse(open(ciphertext,key,"research:"+runId+":answer").toString("utf8"));
  }finally{key.fill(0);}
  if(!value||typeof value!=="object"||Array.isArray(value)||
     typeof value.status!=="string"||value.historically_verified===true||
     value.verified===true)throw Error("PRIVATE_ANSWER_INVALID");
  const greek=value.greek_narrative||{};
  const greekParagraphs=greek.status==="COMPLETED"&&Array.isArray(greek.paragraphs)?greek.paragraphs:[];
  const sections=greekParagraphs.length?
    greekParagraphs.map(x=>x.text_el):
    (Array.isArray(value.answer_sections)?value.answer_sections.map(x=>x.text):[]);
  const paragraphs=sections.filter(x=>typeof x==="string"&&x.trim()).slice(0,10)
    .map(x=>x.slice(0,1500));
  const references=Array.isArray(value.claims)?
    value.claims.flatMap(claim=>(Array.isArray(claim.source_occurrences)?claim.source_occurrences:[])
      .slice(0,1).map(source=>[
        String(source.title||"Χωρίς τίτλο").slice(0,300),
        source.locator?.printed_page?"σ. "+String(source.locator.printed_page).slice(0,30):"",
        typeof source.url==="string"&&source.url.startsWith("https://")?
          source.url.slice(0,500):""
      ].filter(Boolean).join(" · "))).filter(Boolean).slice(0,12):[];
  const coverage=value.coverage||{};
  return {
    schema:"n7-private-research-owner-answer-v1",run_id:runId,
    status:String(value.status).slice(0,100),model_used:Boolean(value.model_used),
    historical_verification:"NOT_VERIFIED",historically_verified:false,
    claims_examined:Array.isArray(value.claims)?value.claims.length:0,
    selected_passages:Number.isFinite(coverage.selected_passages)?coverage.selected_passages:0,
    model_language:greekParagraphs.length?"el":"source_original",
    paragraphs,references,
    limitations:["Only acquired excerpts were analysed. This is not source authentication or human historical verification.",
      "Exact original-page inspection and independence assessment remain necessary."]
  };
}
module.exports={readOwnerAnswer};
