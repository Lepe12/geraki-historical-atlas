"use strict";
(function(){
  const navParent=document.querySelector(".sidebar");
  const main=document.querySelector("main"),messages=document.getElementById("messages");
  if(!navParent||!main||!messages)return;
  const el=(tag,label)=>{const x=document.createElement(tag);if(label!==undefined)x.textContent=label;return x;};
  const button=el("button","⌕ Ιστορική έρευνα");
  button.type="button";button.id="missionview";button.className="new";
  (document.getElementById("taskview")||document.getElementById("new"))?.after(button);
  const panel=el("section");panel.id="missions";panel.className="taskpanel hidden";
  panel.append(el("h2","Ερευνητικές αποστολές N7"),
    el("p","Ο JARVIS αναζητά πηγές, διαβάζει αποκτημένο υλικό και δημιουργεί τεκμηριωμένη αναφορά. Η ολοκλήρωση δεν ισοδυναμεί με ιστορική επαλήθευση."));
  const form=el("form");form.id="missionform";
  function field(id,label,value="",multi=false){
    const lbl=el("label",label);lbl.htmlFor=id;
    const box=el(multi?"textarea":"input");
    box.id=id;box.name=id;box.required=(id==="missiontarget"||id==="missionpurpose");
    if(multi)box.rows=3;else box.type="text";
    box.value=value;box.maxLength=id==="missionpurpose"?1000:id==="missiontarget"?250:220;
    form.append(lbl,box);
  }
  field("missiontarget","Τόπος ή πρόσωπο","Νάξος");
  field("missionpurpose","Ερευνητικό ερώτημα",
    "Χρησιμοποιήθηκε η Νάξος ως πειρατικό ορμητήριο τον 17ο αιώνα; Εντόπισε πηγές και αντίθετες αναφορές.",true);
  field("missiondates","Περίοδος","1600-1700");
  field("missionaliases","Ιστορικά ονόματα με |","Naxos | Nasso");
  const submit=el("button","Εκκίνηση αποστολής");submit.type="submit";form.append(submit);
  const status=el("div","Δεν έχει ξεκινήσει ακόμη αποστολή.");
  status.id="missionstatus";status.setAttribute("role","status");status.setAttribute("aria-live","polite");
  panel.append(form,status);main.insertBefore(panel,messages);
  const safeId=/^n7mission-[a-f0-9]{24}$/;
  let id="";
  try{id=localStorage.getItem("n7-last-mission")||"";}catch(_){}
  async function request(url,options={}){
    const r=await fetch(url,{credentials:"same-origin",...options,
      headers:{"Content-Type":"application/json",...(options.headers||{})}});
    const x=await r.json();
    if(!r.ok)throw Error(x.error||"HTTP "+r.status);
    return x;
  }
  function link(value,label){
    try{
      const u=new URL(String(value));
      if(u.protocol!=="https:"||u.hostname!=="github.com"||
        !/^\/Lepe12\/geraki-historical-atlas\/actions\/runs\/[0-9]+$/.test(u.pathname))return;
      const a=el("a",label);a.href=u.href;a.target="_blank";a.rel="noopener noreferrer";status.append(a);
    }catch(_){}
  }
  function render(data){
    status.replaceChildren();
    const labels={DISPATCH_NOT_OBSERVED:"Η αποστολή έγινε δεκτή και αναμένεται στο GitHub",
      WAITING_FOR_RESEARCH:"Ο JARVIS αναθέτει τις εργασίες",PIPELINE_QUEUED:"Η αποστολή είναι στην ουρά",
      PIPELINE_IN_PROGRESS:"Οι agents εργάζονται",PIPELINE_COMPLETED:"Η ερευνητική εκτέλεση ολοκληρώθηκε",
      PIPELINE_FAILED:"Η ερευνητική εκτέλεση απέτυχε",DISPATCH_FAILED:"Η ανάθεση απέτυχε"};
    status.append(el("p",labels[data.status]||"Κατάσταση: "+String(data.status||"άγνωστη")),
      el("p","Αποστολή: "+(data.request_id||id)),
      el("p","Οι πληροφορίες απαιτούν έλεγχο πρωτότυπων πηγών. Δεν είναι αυτόματα επιβεβαιωμένες."));
    link(data.planner_url,"Πλάνο JARVIS");
    link(data.research_url,"Ερευνητική εκτέλεση");
    if(data.preview&&typeof data.preview==="object"){
      status.append(el("h3","Σύνθεση υπό έλεγχο"));
      status.append(el("p","Κατάσταση αναφοράς: "+String(data.preview.report_status||"άγνωστη")));
      for(const s of (Array.isArray(data.preview.paragraphs)?data.preview.paragraphs:[]).slice(0,8)){
        if(typeof s==="string")status.append(el("p",s));
      }
      if(Array.isArray(data.preview.sources)&&data.preview.sources.length){
        status.append(el("h3","Βιβλιογραφικές αναφορές"));
        const ul=el("ul");
        for(const s of data.preview.sources.slice(0,10))ul.append(el("li",String(s)));
        status.append(ul);
      }
    }
  }
  async function refresh(){
    if(!safeId.test(id)||panel.classList.contains("hidden"))return;
    try{render(await request("/api/research/missions/"+encodeURIComponent(id)));}
    catch(e){status.textContent="Αδυναμία ανάκτησης κατάστασης: "+e.message;}
  }
  button.addEventListener("click",()=>{
    panel.classList.remove("hidden");
    document.getElementById("tasks")?.classList.add("hidden");
    messages.classList.add("hidden");
    document.getElementById("chat")?.classList.add("hidden");
    if(safeId.test(id))refresh();
  });
  function leave(){panel.classList.add("hidden");}
  document.getElementById("taskview")?.addEventListener("click",leave,true);
  document.getElementById("new")?.addEventListener("click",leave,true);
  document.getElementById("conversations")?.addEventListener("click",leave,true);
  form.addEventListener("submit",async e=>{
    e.preventDefault();if(submit.disabled)return;
    submit.disabled=true;status.textContent="Ανάθεση στον JARVIS...";
    try{
      const payload={target:document.getElementById("missiontarget").value.trim(),
        purpose:document.getElementById("missionpurpose").value.trim(),
        date_range:document.getElementById("missiondates").value.trim(),
        aliases:document.getElementById("missionaliases").value.trim()};
      const result=await request("/api/research/missions",{method:"POST",body:JSON.stringify(payload)});
      if(!safeId.test(result.request_id))throw Error("Μη έγκυρη απάντηση");
      id=result.request_id;
      try{localStorage.setItem("n7-last-mission",id);}catch(_){}
      render({status:"DISPATCH_NOT_OBSERVED",request_id:id});
      await refresh();
    }catch(e){status.textContent="Αποτυχία ανάθεσης: "+e.message;}
    finally{submit.disabled=false;}
  });
  setInterval(()=>{if(!panel.classList.contains("hidden"))refresh();},15000);
})();