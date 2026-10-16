"use strict";
(()=>{
  const $=id=>document.getElementById(id);
  const panel=$("learningPanel"),toggle=$("learningToggle"),close=$("closeLearning"),input=$("learningFile"),analyze=$("learningAnalyze"),status=$("learningState"),source=$("learningSource"),list=$("learningItems"),summary=$("learningSummary"),save=$("learningSave");
  if(!panel||!toggle||!close||!input||!analyze||!status||!source||!list||!summary||!save)return;

  const endpoint="https://pct-live.piratecartography.com/pct-api/live";
  let saving=false;
  let current={source_id:"",file:null,pages:[],items:[]};

  const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  const setState=(s,mode="")=>{status.textContent=s;panel.dataset.state=mode;};

  function open(){const results=$("resultsDrawer");if(results)results.classList.add("hidden");panel.classList.remove("hidden");}
  let reviewPage=0;
  const batchSize=50;
  const reader=document.createElement("section");
  reader.className="learning-source";
  reader.innerHTML='<label>PDF PAGE <input type="number" min="1" value="1" aria-label="PDF page number" style="width:80px"></label><small class="coverage"></small><pre style="white-space:pre-wrap;max-height:240px;overflow:auto;user-select:text"></pre>';
  list.before(reader);
  const pageInput=reader.querySelector("input"),pageText=reader.querySelector("pre"),coverage=reader.querySelector(".coverage");
  function showPage(){
    const n=Math.max(1,Math.min(current.pages.length,Number(pageInput.value)||1));
    pageInput.value=n;pageInput.max=current.pages.length||1;
    pageText.textContent=current.pages[n-1]?.text||"No extracted text on this page. Image-only pages require OCR.";
  }
  pageInput.addEventListener("change",showPage);
  const pager=document.createElement("div");pager.className="learning-actions";
  const previous=document.createElement("button"),next=document.createElement("button"),position=document.createElement("span");
  previous.type=next.type="button";previous.textContent="PREVIOUS 50";next.textContent="NEXT 50";
  pager.append(previous,position,next);list.after(pager);
  previous.addEventListener("click",()=>{reviewPage=Math.max(0,reviewPage-1);render();});
  next.addEventListener("click",()=>{reviewPage++;render();});
  function render(){
    reader.hidden=!current.pages.length;
    const readable=current.pages.filter(p=>p.text.trim().length>=40).length;
    coverage.textContent=current.pages.length?`${current.pages.length} / ${current.pages.length} pages read · ${readable} with text · ${current.pages.length-readable} blank or requiring OCR. PDF page numbers; printed pagination unverified.`:"";
    showPage();
    reviewPage=Math.min(reviewPage,Math.max(0,Math.ceil(current.items.length/batchSize)-1));
    const offset=reviewPage*batchSize;
    pager.hidden=!current.items.length;
    previous.disabled=reviewPage===0;next.disabled=offset+batchSize>=current.items.length;
    position.textContent=` ${offset+1}–${Math.min(offset+batchSize,current.items.length)} / ${current.items.length} `;
    const accepted=current.items.filter(x=>x.status==="accepted").length;
    const rejected=current.items.filter(x=>x.status==="rejected").length;
    const pending=current.items.length-accepted-rejected;
    summary.textContent=current.items.length?accepted+" accepted · "+rejected+" rejected · "+pending+" pending":"Δεν υπάρχουν ακόμη στοιχεία προς έλεγχο.";
    list.innerHTML=current.items.length?current.items.slice(offset,offset+batchSize).map((x,j)=>'<article class="learning-item" data-i="'+(offset+j)+'" data-status="'+esc(x.status)+'"><div class="learning-item-head"><span>'+esc(x.saved?"ΑΠΟΘΗΚΕΥΜΕΝΟ":x.extraction_kind==="excerpt"?"EXCERPT — UNVERIFIED":x.type.toUpperCase())+'</span><small>PAGE '+esc(x.page||"—")+' · '+(x.confidence==null?'CONFIDENCE UNASSESSED':Math.round(x.confidence*100)+'%')+'</small></div><div class="learning-item-text" contenteditable="'+(x.editing?"true":"false")+'">'+esc(x.text)+'</div><div class="learning-actions"><button data-act="accept">ΕΓΚΡΙΣΗ</button><button data-act="reject">ΑΠΟΡΡΙΨΗ</button><button data-act="edit">'+(x.editing?"ΤΕΛΟΣ ΕΠΕΞΕΡΓΑΣΙΑΣ":"ΕΠΕΞΕΡΓΑΣΙΑ")+'</button></div></article>').join(""):'<div class="learning-empty">Επιλέξτε PDF και πατήστε Ανάλυση. Εδώ θα εμφανιστούν τα στοιχεία για έλεγχο.</div>';
    save.disabled=saving||!current.items.some(x=>x.status==="accepted"&&!x.saved);
  }

  async function uploadPdf(file){
    const r=await fetch(endpoint+"/knowledge/upload",{method:"POST",headers:{"content-type":"application/pdf","x-file-name":encodeURIComponent(file.name)},body:file});
    let data={};try{data=await r.json()}catch(_){}
    if(!r.ok){const e=new Error(data.error||("upload_http_"+r.status));e.status=r.status;throw e;}
    return data;
  }

  async function loadPdfJs(){
    const pdfjs=await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc="https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
    return pdfjs;
  }

  async function extractPages(file){
    const pdfjs=await loadPdfJs(),bytes=new Uint8Array(await file.arrayBuffer());
    const pdf=await pdfjs.getDocument({data:bytes}).promise,pages=[];
    for(let n=1;n<=pdf.numPages;n++){
      const page=await pdf.getPage(n),tc=await page.getTextContent();
      const text=tc.items.map(x=>(x.str||"")+(x.hasEOL?"\n":" ")).join("").replace(/[ \t]+/g," ").trim();
      pages.push({page:n,text});
      page.cleanup();
      await new Promise(resolve=>setTimeout(resolve,0));
      if(n%5===0||n===pdf.numPages)setState("READING "+n+" / "+pdf.numPages,"working");
    }
    await pdf.destroy();
    return pages;
  }

  function proposals(pages){
    const items=[],seen=new Set(),add=(type,text,page,confidence)=>{
      text=String(text||"").replace(/\s+/g," ").trim();if(text.length<3)return;
      const k=type+"|"+page+"|"+text.toLowerCase();if(seen.has(k))return;seen.add(k);
      items.push({id:"k-"+items.length,type:type==="excerpt"?"claim":type,extraction_kind:type,text,page,pdf_page:page,printed_page:null,confidence,extraction_method:"text_layer_heuristic",verification_status:"UNREVIEWED",status:"pending",editing:false});
    };
    const stop=new Set("την τον της του των το τα τις τους στη στην στο στον και εις από απο για με ο η οι εν ένας μια ένα αυτό αυτή σελίδες περιεχόμενα κεφάλαιο βιβλιογραφία the this that from with there their they for and but not chapter page figure table introduction conclusion references bibliography".split(" "));
    const normalized=t=>t.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase();
    for(const pg of pages){
      const text=String(pg.text||"").replace(/\s+/g," ").trim();if(!text)continue;
      for(const m of text.matchAll(/(?<!\d)(1\d{3}|20\d{2})(?!\d)/g)) add("date",m[1],pg.page,null);
      // Conservative name candidates; capitals alone do not establish identity.
      for(const m of text.matchAll(/[\p{Lu}][\p{Ll}’'-]{2,}(?:\s+[\p{Lu}][\p{Ll}’'-]{2,}){1,3}/gu)){
        const v=m[0].trim();if(v.length>90||v.split(/\s+/).some(w=>stop.has(normalized(w))))continue;
        add("entity",v,pg.page,null);
      }
      // Preserve every passage for review, including contents and OCR noise.
      // Do not label a sentence a verified historical claim.
      const passages=text.match(/[^.!?]+(?:[.!?]+|$)/g)||[text];
      for(const passage of passages){
        const words=passage.trim().split(/\s+/);let chunk="";
        for(const word of words){
          if(chunk.length+word.length>800){add("excerpt",chunk,pg.page,null);chunk="";}
          chunk+=(chunk?" ":"")+word;
        }
        if(chunk.length>=35)add("excerpt",chunk,pg.page,null);
      }
    }
    return items;
  }

  toggle.addEventListener("click",()=>{open();});
  close.addEventListener("click",()=>panel.classList.add("hidden"));

  input.addEventListener("change",()=>{
    const file=input.files?.[0];
    open();
    current={source_id:"",file:file||null,pages:[],items:[]};
    render();
    analyze.disabled=!file;
    if(!file){source.textContent="Δεν έχει επιλεγεί αρχείο.";setState("READY");return;}
    source.textContent=file.name+" · "+(file.size/1048576).toFixed(1)+" MB";
    if(file.type!=="application/pdf"&&!file.name.toLowerCase().endsWith(".pdf")){setState("PDF REQUIRED","error");analyze.disabled=true;return;}
    if(file.size>25*1024*1024){setState("Το PDF υπερβαίνει τα 25 MB","error");analyze.disabled=true;return;}
    setState("Το PDF είναι έτοιμο — πατήστε Ανάλυση","ready");
  });

  analyze.addEventListener("click",async()=>{
    const file=current.file;if(!file)return;
    analyze.disabled=true;input.disabled=true;save.disabled=true;
    current.items=[];reviewPage=0;render();
    try{
      setState("READING PDF LOCALLY","working");
      current.pages=await extractPages(file);
      const textChars=current.pages.reduce((n,p)=>n+String(p.text||"").trim().length,0);
      if(textChars<40){
        current.items=[];
        setState("NO TEXT LAYER — OCR REQUIRED","error");
        summary.textContent="The PDF appears scanned or image-only. OCR is required before knowledge extraction.";
        list.innerHTML='<div class="learning-empty">No usable text layer was found in this PDF. NABOU//X did not invent knowledge from an unreadable source.</div>';
        return;
      }
      setState("BUILDING REVIEW","working");
      current.items=proposals(current.pages);
      setState(current.items.length?"Ελέγξτε τα στοιχεία πριν την αποθήκευση":"TEXT FOUND — EXTRACTION NEEDS REVIEW",current.items.length?"ready":"error");
      render();
      summary.textContent+=" · Automatic candidates and verbatim excerpts; OCR and historical verification pending.";
    }catch(e){
      setState("Αποτυχία ανάγνωσης — δοκιμάστε ξανά ή επιλέξτε άλλο PDF","error");
    }finally{
      analyze.disabled=false;input.disabled=false;
    }
  });

  list.addEventListener("input",e=>{const card=e.target.closest(".learning-item");if(card&&e.target.matches(".learning-item-text")){const item=current.items[Number(card.dataset.i)];if(item)item.text=e.target.textContent.trim();}});
  list.addEventListener("click",e=>{
    const b=e.target.closest("button[data-act]"),card=e.target.closest(".learning-item");if(!b||!card||saving)return;
    const i=Number(card.dataset.i),item=current.items[i];if(!item)return;
    if(item.saved)return;
    if(item.editing){item.text=card.querySelector(".learning-item-text")?.textContent?.trim()||item.text;}
    if(b.dataset.act==="accept"){item.status="accepted";item.editing=false;}
    if(b.dataset.act==="reject"){item.status="rejected";item.editing=false;}
    if(b.dataset.act==="edit"){
      if(item.editing){const t=card.querySelector(".learning-item-text");item.text=t?.textContent?.trim()||item.text;item.editing=false;}
      else item.editing=true;
    }
    render();
    if(item.editing)list.querySelector(`[data-i="${i}"] .learning-item-text`)?.focus();
  });

  save.addEventListener("click",async()=>{
    if(saving)return;
    list.querySelectorAll(".learning-item").forEach(card=>{const item=current.items[Number(card.dataset.i)];if(item?.editing){item.text=card.querySelector(".learning-item-text")?.textContent?.trim()||item.text;item.editing=false;}});
    const accepted=current.items.filter(x=>x.status==="accepted"&&!x.saved);if(!accepted.length||!current.file)return;
    saving=true;input.disabled=true;analyze.disabled=true;list.inert=true;
    save.disabled=true;setState("UPLOADING APPROVED SOURCE","working");
    try{
      if(!current.source_id){
        const uploaded=await uploadPdf(current.file);
        current.source_id=uploaded.source_id;
      }
      setState("SAVING APPROVED MEMORY","working");
      const r=await fetch(endpoint+"/knowledge/review",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({source_id:current.source_id,pages:current.pages,items:accepted})});
      const data=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(data.error||("save_http_"+r.status)),{status:r.status});
      accepted.forEach(x=>x.saved=true);
      setState("Αποθηκεύτηκαν "+data.accepted_items+" στοιχεία","learned");
      source.textContent=(source.textContent||"SOURCE")+" · MEMORY SAVED";
    }catch(e){
      setState(e.message==="Failed to fetch"?"KNOWLEDGE BACKEND UNAVAILABLE":"Αποτυχία αποθήκευσης — τα στοιχεία παραμένουν για νέα προσπάθεια","error");
    }finally{saving=false;input.disabled=false;analyze.disabled=false;list.inert=false;render();}
  });

  render();
})();
