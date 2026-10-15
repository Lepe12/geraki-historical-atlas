"use strict";
(()=>{
  const $=id=>document.getElementById(id);
  const panel=$("learningPanel"),toggle=$("learningToggle"),close=$("closeLearning"),input=$("learningFile"),status=$("learningState"),source=$("learningSource"),list=$("learningItems"),summary=$("learningSummary"),save=$("learningSave");
  if(!panel||!toggle||!close||!input||!status||!source||!list||!summary||!save)return;

  const endpoint="https://pct-live.piratecartography.com/pct-api/live";
  let current={source_id:"",file:null,pages:[],items:[]};

  const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  const setState=(s,mode="")=>{status.textContent=s;panel.dataset.state=mode;};

  function open(){const results=$("resultsDrawer");if(results)results.classList.add("hidden");panel.classList.remove("hidden");}
  function render(){
    const accepted=current.items.filter(x=>x.status==="accepted").length;
    const rejected=current.items.filter(x=>x.status==="rejected").length;
    const pending=current.items.length-accepted-rejected;
    summary.textContent=current.items.length?accepted+" accepted · "+rejected+" rejected · "+pending+" pending":"No extracted knowledge yet.";
    list.innerHTML=current.items.length?current.items.map((x,i)=>'<article class="learning-item" data-i="'+i+'" data-status="'+esc(x.status)+'"><div class="learning-item-head"><span>'+esc(x.type.toUpperCase())+'</span><small>PAGE '+esc(x.page||"—")+' · '+Math.round((x.confidence||.5)*100)+'%</small></div><div class="learning-item-text" contenteditable="'+(x.editing?"true":"false")+'">'+esc(x.text)+'</div><div class="learning-actions"><button data-act="accept">ACCEPT</button><button data-act="reject">REJECT</button><button data-act="edit">'+(x.editing?"DONE":"EDIT")+'</button></div></article>').join(""):'<div class="learning-empty">Upload a PDF to inspect what NABOU//X extracts before anything enters memory.</div>';
    save.disabled=accepted===0;
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
      const text=tc.items.map(x=>x.str||"").join(" ").replace(/\s+/g," ").trim();
      pages.push({page:n,text});
      if(n%5===0||n===pdf.numPages)setState("READING "+n+" / "+pdf.numPages,"working");
    }
    return pages;
  }

  function proposals(pages){
    const items=[],seen=new Set(),add=(type,text,page,confidence)=>{
      text=String(text||"").replace(/\s+/g," ").trim();if(text.length<3)return;
      const k=type+"|"+text.toLowerCase();if(seen.has(k))return;seen.add(k);
      items.push({id:"k-"+items.length,type,text,page,confidence,status:"pending",editing:false});
    };
    const stop=new Set(["The","This","That","From","With","There","Their","They","For","And","But","Not","Chapter","Page","Figure","Table","Introduction","Conclusion","References","Bibliography"]);
    for(const pg of pages){
      const text=pg.text||"";
      for(const m of text.matchAll(/\b(1[45-9]\d{2}|20\d{2})\b/g)) add("date",m[1],pg.page,.96);
      for(const m of text.matchAll(/\b[\p{Lu}][\p{L}’'.-]{2,}(?:\s+[\p{Lu}][\p{L}’'.-]{2,}){0,3}\b/gu)){
        const v=m[0].trim();if(stop.has(v)||v.length>90)continue;add("entity",v,pg.page,.68);
      }
      const sentences=text.split(/(?<=[.!?;])\s+/).filter(s=>s.length>=45&&s.length<=420);
      for(const s of sentences){
        if(/\b(1[45-9]\d{2}|20\d{2})\b/.test(s)||/\b[\p{Lu}][\p{L}’'.-]{2,}\s+[\p{Lu}][\p{L}’'.-]{2,}\b/u.test(s)) add("claim",s,pg.page,.62);
        if(items.filter(x=>x.type==="claim").length>=80)break;
      }
      if(items.length>=220)break;
    }
    return items.slice(0,220);
  }

  toggle.addEventListener("click",()=>{open();});
  close.addEventListener("click",()=>panel.classList.add("hidden"));

  input.addEventListener("change",async()=>{
    const file=input.files?.[0];if(!file)return;
    open();current={source_id:"",file,pages:[],items:[]};render();
    source.textContent=file.name+" · "+(file.size/1048576).toFixed(1)+" MB";
    if(file.type!=="application/pdf"&&!file.name.toLowerCase().endsWith(".pdf")){setState("PDF REQUIRED","error");return;}
    if(file.size>25*1024*1024){setState("PDF TOO LARGE","error");return;}
    try{
      setState("READING PDF LOCALLY","working");
      current.pages=await extractPages(file);
      setState("BUILDING REVIEW","working");
      current.items=proposals(current.pages);
      setState("REVIEW REQUIRED","ready");render();
    }catch(e){
      setState("PDF READ FAILED","error");
    }
  });

  list.addEventListener("click",e=>{
    const b=e.target.closest("button[data-act]"),card=e.target.closest(".learning-item");if(!b||!card)return;
    const i=Number(card.dataset.i),item=current.items[i];if(!item)return;
    if(b.dataset.act==="accept"){item.status="accepted";item.editing=false;}
    if(b.dataset.act==="reject"){item.status="rejected";item.editing=false;}
    if(b.dataset.act==="edit"){
      if(item.editing){const t=card.querySelector(".learning-item-text");item.text=t?.textContent?.trim()||item.text;item.editing=false;}
      else item.editing=true;
    }
    render();
  });

  save.addEventListener("click",async()=>{
    const accepted=current.items.filter(x=>x.status==="accepted");if(!accepted.length||!current.file)return;
    save.disabled=true;setState("UPLOADING APPROVED SOURCE","working");
    try{
      if(!current.source_id){
        const uploaded=await uploadPdf(current.file);
        current.source_id=uploaded.source_id;
      }
      setState("SAVING APPROVED MEMORY","working");
      const r=await fetch(endpoint+"/knowledge/review",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({source_id:current.source_id,pages:current.pages,items:accepted})});
      const data=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(data.error||("save_http_"+r.status)),{status:r.status});
      setState("LEARNED · "+data.accepted_items+" ITEMS","learned");
      source.textContent=(source.textContent||"SOURCE")+" · MEMORY SAVED";
    }catch(e){
      setState(e.message==="Failed to fetch"?"KNOWLEDGE BACKEND UNAVAILABLE":"MEMORY SAVE FAILED","error");
    }finally{save.disabled=false;}
  });

  render();
})();