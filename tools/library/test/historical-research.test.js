"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const r=require("../n7-historical-research");
const key=Buffer.alloc(32,7);
const hit=(title,id,scan,score)=>({title,author:"Historian",publication_year:"1890",source_uri:"https://www.gutenberg.org/ebooks/22169",source_id:id.repeat(64),scan_index:scan,printed_page:String(scan),excerpt:"Barbarossa led a fleet near Prevesa.",relevance_score:score,source_type:"SECONDARY_HISTORIOGRAPHY"});
function fakeFetch(url,opts){
  if(url.includes("crossref"))return Promise.resolve({ok:true,json:async()=>({message:{items:[{DOI:"10.1000/test",title:["Historical study"],published:{"date-parts":[[2019]]}}]}})});
  const query=JSON.parse(opts.body).query;
  return Promise.resolve({ok:true,json:async()=>({schema:"n7-library-read-v1",source_count:2,page_count:646,
    matches:query==="Barbarossa"?[hit("A","a",44,30),hit("B","b",99,20),hit("A","a",45,10)]:[]})});
}
test("Greek and Latin aliases and historical intent",()=>{
 assert.deepEqual(r.queryTerms("Τι γνωρίζουμε για τον Χαϊρεντίν Μπαρμπαρόσα;").entities,["barbarossa"]);
 assert.ok(r.queryTerms("Πέτρος Λάντζας").terms.includes("Lantzas"));
 assert.ok(r.queryTerms("Η Κέρκυρα και η ναυμαχία της Πρέβεζας").terms.includes("Corfu"));
 assert.equal(r.historicalIntent("Τι γνωρίζουμε για τον Dragut;"),true);
 assert.equal(r.historicalIntent("γράψε μου μια λίστα για το σπίτι"),false);
});
test("retrieval produces source citation and independent source count without invented verification",async()=>{
 const v=await r.research("Πες μου για τον Barbarossa",{key,fetcher:fakeFetch});
 assert.equal(v.evidence.length,3);
 assert.equal(v.assessment.source_count,2);
 assert.equal(v.assessment.claim_status,"UNVERIFIED");
 assert.match(v.answer,/σελ\. 44/);
 assert.match(v.answer,/δεν αποδεικνύει/);
 assert.ok(v.context.includes("[S1]"));
});
test("external search is metadata-only and not historical proof",async()=>{
 const v=await r.research("Βρες πηγές για τον Barbarossa",{key,external:true,fetcher:fakeFetch});
 assert.equal(v.catalog.crossref.length,1);
 assert.equal(v.catalog.crossref[0].status,"BIBLIOGRAPHIC_CANDIDATE_NOT_VERIFIED");
 assert.equal(v.assessment.claim_status,"UNVERIFIED");
});
test("malformed or absent bridge key never authenticates",async()=>{
 await assert.rejects(()=>r.privateLibrary(Buffer.alloc(4),"search",{query:"Barbarossa"},fakeFetch),/LIBRARY_BRIDGE_NOT_CONFIGURED/);
});
test("no hits yields explicit limits rather than invented bibliography",async()=>{
 const v=await r.research("Πέτρος Λάντζας",{key,fetcher:fakeFetch});
 assert.equal(v.evidence.length,0);
 assert.match(v.answer,/Δεν βρέθηκαν τεκμήρια/);
});
