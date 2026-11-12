"use strict";
const crypto=require("node:crypto");

const GROUPS=[
  {id:"barbarossa",keys:["μπαρμπαρόσα","barbarossa","kheyr-ed-din","khair ed din","hayreddin","χαϊρεντίν","χαϊρεντίνης","χαιρεντιν"],terms:["Barbarossa","Kheyr-ed-din","Hayreddin"]},
  {id:"dragut",keys:["ντραγούτ","δραγουτ","dragut","turgut reis","turgut","ντραγκούτ"],terms:["Dragut","Turgut"]},
  {id:"lantzas",keys:["λάντζας","λαντζας","λάντζα","λαντζα","lantzas","lanza","lanzas","petros lantzas","pietro lanza"],terms:["Lantzas","Lanza","Lanzas","Λάντζας"]},
  {id:"doria",keys:["ντόρια","ντορια","doria","andrea doria","αντρέα ντόρια"],terms:["Andrea Doria","Doria"]},
  {id:"preveza",keys:["πρέβεζ","πρεβεζ","preveza","prevesa"],terms:["Prevesa","Preveza"]},
  {id:"corfu",keys:["κέρκυρ","κερκυρ","corfu","corcyra","corfù"],terms:["Corfu","Corcyra"]},
  {id:"aegean",keys:["αιγαί","αιγαι","aegean","egeo"],terms:["Aegean"]},
  {id:"ottoman",keys:["οθωμαν","ottoman"],terms:["Ottoman"]},
  {id:"corsair",keys:["κουρσάρ","κουρσαρ","πειρατ","corsair","pirat"],terms:["corsair","pirate"]},
  {id:"malta",keys:["μάλτα","μαλτα","malta"],terms:["Malta"]},
  {id:"astypalaia",keys:["αστυπάλ","αστυπαλ","astypal","astipal","stampali","astropal"],terms:["Αστυπάλαια","Astypalaia","Stampalia","Astropalia"]},
  {id:"gramvousa",keys:["γραμβούσ","γραμβουσ","gramvous","grabus","garabus","grabous"],terms:["Γραμβούσα","Gramvousa","Grabusa","Garabusa"]}
];
const HISTORICAL=/ιστορ|πηγ[ήες]|βιβλιογραφ|αρχε[ίι]|μελετ|έρευν|ερευν|πειρατ|κουρσ|αιγα|οθωμαν|βαρβαρ|μπαρμπαρ|χαιρεντιν|ντραγουτ|δραγουτ|λαντζ|barbar|dragut|lanza|lantza|doria|preves|corfu|malta|ναυμαχ|ναυτικ|τεκμηρι|χρονολογ|τουρκικ|μεσόγ|μεσογ|τι γνωρίζουμε|τι ξέρουμε/i;
function fold(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
function clean(s){return String(s||"").replace(/[\u0000-\u001f]/g," ").trim().slice(0,12000);}
function historicalIntent(q){return HISTORICAL.test(fold(clean(q)));}
function queryTerms(question){
  const normalized=fold(clean(question));
  let selected=[],matched=[];
  // Specific people/places first; broad thematic groups only fill remaining slots.
  const thematic=new Set(["corsair","ottoman","aegean"]),later=[];
  for(const group of GROUPS){
    if(group.keys.some(x=>normalized.includes(fold(x)))){(thematic.has(group.id)?later:selected).push(...group.terms);matched.push(group.id);}
  }
  selected.push(...later);
  if(!selected.length){
    const ignores=new Set(["τι","πότε","γιατί","πως","ποιος","ποια","ποιες","πηγές","βιβλία","ιστορία","ιστορικά","έρευνα","γνωρίζουμε","γνωρίζεις","about","when","where","historical","sources","the","και","από","στη","στην","των"]);
    const words=clean(question).match(/[\p{L}\p{N}-]{4,}/gu)||[];
    selected=words.filter(w=>!ignores.has(fold(w))).sort((a,b)=>b.length-a.length).slice(0,2);
  }
  return {terms:[...new Set(selected)].filter(x=>x.length>=2).slice(0,4),entities:[...new Set(matched)]};
}
function signature(key,raw,ts){return crypto.createHmac("sha256",key).update(ts+"."+raw).digest("hex");}
async function privateLibrary(key,route,body,fetcher=fetch){
  if(!Buffer.isBuffer(key)||key.length!==32)throw new Error("LIBRARY_BRIDGE_NOT_CONFIGURED");
  const raw=JSON.stringify(body);
  const ts=String(Math.floor(Date.now()/1000));
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),11000);
  try {
    const r=await fetcher("https://pct-live.piratecartography.com/pct-api/live/n7/library/"+route,{
      method:"POST",redirect:"error",signal:controller.signal,
      headers:{"Content-Type":"application/json","X-N7-Library-Ts":ts,
        "X-N7-Library-Signature":signature(key,raw,ts)},body:raw
    });
    if(!r.ok)throw new Error("LIBRARY_API_"+r.status);
    return await r.json();
  }finally{clearTimeout(timer);}
}
async function externalCatalog(question,fetcher=fetch){
  // Metadata discovery ONLY, never assert that bibliographic candidates prove an event.
  const words=queryTerms(question);
  const q=(words.terms[0]||clean(question).slice(0,70));
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6500);
  const out={crossref:[],gutenberg:[],warnings:[]};
  try {
    const u="https://api.crossref.org/works?rows=4&select=DOI,title,author,published,URL,type&query.bibliographic="+encodeURIComponent(q+" maritime history");
    const r=await fetcher(u,{signal:controller.signal,headers:{"Accept":"application/json"}});
    if(r.ok){
      const result=await r.json();
      out.crossref=(result?.message?.items||[]).slice(0,4).map(x=>({
        title:String(x?.title?.[0]||"").slice(0,240),
        author:(x?.author||[]).slice(0,2).map(y=>(y.given||"")+" "+(y.family||"")).join("; ").slice(0,160),
        year:x?.published?.["date-parts"]?.[0]?.[0]||null,
        doi:String(x.DOI||"").slice(0,160),
        url:x.DOI?"https://doi.org/"+encodeURIComponent(x.DOI):null,
        status:"BIBLIOGRAPHIC_CANDIDATE_NOT_VERIFIED"
      })).filter(x=>x.title&&x.url);
    }else out.warnings.push("CROSSREF_HTTP_"+r.status);
  }catch(_){out.warnings.push("CROSSREF_UNAVAILABLE");}
  finally{clearTimeout(timer);}
  return out;
}
function distinctEvidence(matches,limit=5){
  const unique=new Map();
  for(const x of matches){
    if(!x||typeof x.source_id!=="string"||!Number.isInteger(Number(x.scan_index)))continue;
    const k=x.source_id+":"+x.scan_index;
    if(!unique.has(k))unique.set(k,x);
  }
  const sorted=[...unique.values()].sort((a,b)=>(Number(b.relevance_score)||0)-(Number(a.relevance_score)||0));
  const selected=[],seen=new Set();
  // Prefer at least one independent bibliographic work before additional excerpts.
  for(const hit of sorted){
    if(!seen.has(hit.source_id)){selected.push(hit);seen.add(hit.source_id);}
    if(selected.length>=limit)break;
  }
  for(const hit of sorted){if(selected.length>=limit)break;if(!selected.includes(hit))selected.push(hit);}
  return selected;
}
function cite(hit){return String(hit.author||"Χωρίς συγγραφέα")+
  (hit.publication_year?" ("+hit.publication_year+")":"")+", "+String(hit.title||"Άγνωστος τίτλος")+
  (hit.printed_page?" σελ. "+hit.printed_page:" τμήμα "+hit.scan_index);
}
function evidenceSummary(hits){
  const bibliographies=new Set(hits.map(h=>h.source_id));
  const hasUnclassified=hits.some(h=>h.source_type!=="SECONDARY_HISTORIOGRAPHY");
  return {source_count:bibliographies.size,claim_status:"UNVERIFIED",
    caveat:hasUnclassified?"Περιλαμβάνονται πηγές που απαιτούν ταξινόμηση και έλεγχο. Η συμφωνία πηγών δεν αποδεικνύει ιστορική ακρίβεια.":"Οι δευτερογενείς πηγές αποτελούν ιστοριογραφικές αφηγήσεις. Η συμφωνία τους δεν αποτελεί ανεξάρτητη επαλήθευση γεγονότος."};
}
function formatEvidenceAnswer(question,hits,catalog={},errors=[]){
  const lines=[];
  if(hits.length){
    lines.push("Βρήκα "+hits.length+" σχετικά αποσπάσματα στη μόνιμη βιβλιοθήκη. Τα παρακάτω είναι κείμενα πηγών, ορισμένες από τις οποίες μπορεί να είναι αταξινόμητες. Δεν αποτελούν ανεξάρτητα επαληθευμένα γεγονότα:");
    hits.forEach((h,i)=>{
      lines.push("\n["+("S"+(i+1))+"] "+cite(h));
      lines.push("«"+String(h.excerpt||"").trim().slice(0,310)+"»");
      if(/^https:\/\/www\.gutenberg\.org\/ebooks\/[0-9]+$/.test(String(h.source_uri||"")))lines.push("Ψηφιακή πηγή: "+h.source_uri);
    });
    lines.push("\nΗ σύγκλιση αναφορών δεν αποδεικνύει ιστορική ακρίβεια. Για επαλήθευση χρειάζονται πρωτογενείς πηγές ή ανεξάρτητη κριτική αντιπαραβολή.");
  }else lines.push("Δεν βρέθηκαν τεκμήρια για το ερώτημα στη σημερινή μόνιμη βιβλιοθήκη. Δεν θα επινοήσω απάντηση ή παραπομπές.");
  if(catalog.crossref?.length){
    lines.push("\nΠιθανή πρόσθετη βιβλιογραφία (μόνο μεταδεδομένα, όχι ελεγμένο περιεχόμενο):");
    for(const x of catalog.crossref.slice(0,3))lines.push("• "+x.title+(x.year?" ("+x.year+")":"")+" — "+x.url);
  }
  if(errors.length&&hits.length===0)lines.push("\nΠεριορισμός: "+errors.map(x=>x.replace(/[^A-Z0-9_]/g,"")).join(", "));
  return lines.join("\n");
}
async function research(question,{key,fetcher=fetch,external=false}={}){
  const q=clean(question),names=queryTerms(q),warnings=[],gathered=[];
  const stages=[{agent:"TOPONYM_NORMALIZER",status:"DONE",variants:names.terms}];
  await Promise.all(names.terms.map(async term=>{
    try{
      const x=await privateLibrary(key,"search",{query:term},fetcher);
      if(x.schema!=="n7-library-read-v1"||!Array.isArray(x.matches))throw new Error("UNEXPECTED_LIBRARY_SCHEMA");
      gathered.push(...x.matches.slice(0,30));
    }catch(_){warnings.push("LIBRARY_QUERY_UNAVAILABLE");}
  }));
  const selected=distinctEvidence(gathered,5);
  stages.push({agent:"LIBRARY_RETRIEVER",status:warnings.length?"PARTIAL":"DONE",matched_pages:gathered.length,selected_pages:selected.length});
  const assessment=evidenceSummary(selected);
  stages.push({agent:"SOURCE_CRITIC",status:"DONE",...assessment});
  let catalog={crossref:[],warnings:[]};
  if(external){
    catalog=await externalCatalog(q,fetcher);
    stages.push({agent:"PUBLIC_BIBLIOGRAPHY_DISCOVERY",status:catalog.warnings.length?"PARTIAL":"DONE",candidates:catalog.crossref.length});
  }
  stages.push({agent:"EVIDENCE_SYNTHESIZER",status:"DONE",fact_verification:"NOT_PERFORMED"});
  const answer=formatEvidenceAnswer(q,selected,catalog,warnings);
  const context=selected.map((h,i)=>"[S"+(i+1)+"] "+cite(h)+" | "+String(h.excerpt||"").slice(0,650)).join("\n");
  return {answer,context,evidence:selected,assessment,catalog,stages,warnings,variants:names.terms,
    research_mode:"EVIDENCE_GROUNDED_NOT_FACT_VERIFIED"};
}
function externalRequested(q){return /έρευν|ερευν|πηγ|βιβλιογραφ|άρθρ|αρχε|search|literature|papers|find.*sources|research/i.test(fold(q));}
module.exports={GROUPS,fold,clean,historicalIntent,queryTerms,signature,privateLibrary,externalCatalog,distinctEvidence,
  evidenceSummary,formatEvidenceAnswer,research,externalRequested};
