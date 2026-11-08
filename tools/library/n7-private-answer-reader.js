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
  const supported=new Set((value.review?.supported_claim_ids||[]).filter(x=>typeof x==="string"));
  const reviewFlags=new Map((value.review?.flagged_claims||[])
    .filter(x=>x&&typeof x.claim_id==="string").map(x=>[x.claim_id,x]));
  const source_candidates=(Array.isArray(value.claims)?value.claims:[]).slice(0,12)
    .flatMap(claim=>{
      const source=(Array.isArray(claim.source_occurrences)?claim.source_occurrences:[])[0];
      if(!source||typeof claim.quote!=="string"||!claim.quote.trim())return [];
      const loc=source.locator||{};
      const printed=loc.printed_page==null?"":String(loc.printed_page).slice(0,30);
      const scanned=Array.isArray(loc.scan_indexes_0_based)?
        loc.scan_indexes_0_based.filter(n=>Number.isInteger(n)&&n>=0&&n<100000).slice(0,6).map(n=>n+1):[];
      const page=printed?"έντυπη σ. "+printed:
        scanned.length?"σαρωμένη σελίδα PDF "+scanned.join(", "):
        "δεν καταγράφηκε αριθμός σελίδας";
      const lines=Number.isInteger(loc.start_line)&&Number.isInteger(loc.end_line)?
        "γραμμές "+loc.start_line+"–"+loc.end_line:"";
      const flag=reviewFlags.get(claim.claim_id);
      const decision=supported.has(claim.claim_id)?"SUPPORTED_QUOTATION_ONLY":
        flag?.decision==="UNSUPPORTED"?"UNSUPPORTED":
        flag?.decision==="UNCERTAIN"?"UNCERTAIN":"NOT_REVIEWED";
      return [{
        claim_id:String(claim.claim_id||"").slice(0,80),
        proposed_statement:typeof claim.statement==="string"?claim.statement.slice(0,600):"",
        exact_acquired_quote:claim.quote.slice(0,1100),
        source_title:String(source.title||"Πηγή χωρίς τίτλο").slice(0,250),
        page_locator:page,source_lines:lines,
        source_text_sha256:/^[a-f0-9]{64}$/.test(source.source_text_sha256||"")?
          source.source_text_sha256:null,
        model_review_decision:decision,
        review_reason:typeof flag?.reason==="string"?flag.reason.slice(0,650):"",
        original_page_verified:false,historically_verified:false,
        source_identity_independent:false
      }];
    });
  const coverage=value.coverage||{};
  return {
    schema:"n7-private-research-owner-answer-v1",run_id:runId,
    status:String(value.status).slice(0,100),model_used:Boolean(value.model_used),
    historical_verification:"NOT_VERIFIED",historically_verified:false,
    claims_examined:Array.isArray(value.claims)?value.claims.length:0,
    selected_passages:Number.isFinite(coverage.selected_passages)?coverage.selected_passages:0,
    model_language:greekParagraphs.length?"el":"source_original",
    paragraphs,references,source_candidates,
    limitations:["Only acquired excerpts were analysed. This is not source authentication or human historical verification.",
      "Exact original-page inspection and independence assessment remain necessary."]
  };
}
module.exports={readOwnerAnswer};
