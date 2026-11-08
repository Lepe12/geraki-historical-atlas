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
  const recovered=el("button","Ανάγνωση ιδιωτικής έρευνας Νάξου (1600–1700)");
  recovered.type="button";
  recovered.id="n7-private-naxos-result";
  panel.append(form,recovered,status);main.insertBefore(panel,messages);
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
  function linkRecovery(value){
    try{
      if(!value)return;
      const u=new URL(String(value));
      if(u.protocol!=="https:"||u.hostname!=="github.com"||
         !/^\/Lepe12\/geraki-historical-atlas\/blob\/main\/evidence\/runs\/[0-9]+\/RECOVERY_SUMMARY\.json$/.test(u.pathname))return;
      const a=el("a","Αναφορά διασωθέντων τεκμηρίων");
      a.href=u.href;a.target="_blank";a.rel="noopener noreferrer";
      status.append(a);
    }catch(_){}
  }
  function render(data){
    status.replaceChildren();
    const labels={DISPATCH_NOT_OBSERVED:"Η αποστολή έγινε δεκτή και αναμένεται στο GitHub",
      WAITING_FOR_RESEARCH:"Ο JARVIS αναθέτει τις εργασίες",PIPELINE_QUEUED:"Η αποστολή είναι στην ουρά",
      PIPELINE_IN_PROGRESS:"Οι agents εργάζονται",PIPELINE_COMPLETED:"Η ερευνητική εκτέλεση ολοκληρώθηκε",
      PIPELINE_FAILED:"Η ερευνητική εκτέλεση απέτυχε",DISPATCH_FAILED:"Η ανάθεση απέτυχε",EVIDENCE_PRESERVED_REVIEW_REQUIRED:"Τα ερευνητικά τεκμήρια διασώθηκαν· η σύνθεση παραμένει εκκρεμής.",
      PRIVATE_SYNTHESIS_IN_PROGRESS:"Το N7 διαβάζει τις κρυπτογραφημένες πηγές και εκτελεί σύνθεση",
      PRIVATE_SYNTHESIS_COMPLETED:"Η επεξεργασία ολοκληρώθηκε στον ιδιωτικό χώρο· απαιτείται ιστορικός έλεγχος",
      PRIVATE_SYNTHESIS_FAILED:"Η ιδιωτική σύνθεση απέτυχε· οι πηγές παραμένουν αποθηκευμένες με ασφάλεια"};
    status.append(el("p",labels[data.status]||"Κατάσταση: "+String(data.status||"άγνωστη")),
      el("p","Αποστολή: "+(data.request_id||id)),
      el("p","Οι πληροφορίες απαιτούν έλεγχο πρωτότυπων πηγών. Δεν είναι αυτόματα επιβεβαιωμένες."));
    link(data.planner_url,"Πλάνο JARVIS");
    link(data.research_url,"Ερευνητική εκτέλεση");
    link(data.private_synthesis_url,"Ιδιωτική ανάλυση πηγών");
    linkRecovery(data.recovery_summary_url);
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
  async function showPrivateSynthesis(originalRunId){
    if(!/^[0-9]{8,20}$/.test(String(originalRunId)))return;
    const section=el("section");
    section.className="n7-private-analysis";
    try{
      const answer=await request("/api/research/corpus/"+encodeURIComponent(String(originalRunId)));
      if(answer.schema!=="n7-private-research-owner-answer-v1"||
         answer.run_id!==String(originalRunId)||answer.historically_verified!==false)return;
      section.append(el("h3","Ιδιωτική ανάλυση αποθηκευμένων πηγών"));
      section.append(el("p","Κατάσταση: "+String(answer.status||"άγνωστη")+
        " · Τοπικό μοντέλο: "+(answer.model_used?"ενεργοποιήθηκε":"δεν ολοκλήρωσε σύνθεση")));
      section.append(el("p","Επεξεργασμένοι ισχυρισμοί: "+String(answer.claims_examined||0)+
        " · Δεν έχει ολοκληρωθεί ανθρώπινη ιστορική επαλήθευση."));
      for(const paragraph of (Array.isArray(answer.paragraphs)?answer.paragraphs:[]).slice(0,10)){
        if(typeof paragraph==="string")section.append(el("p",paragraph));
      }
      if(Array.isArray(answer.references)&&answer.references.length){
        section.append(el("h4","Παραπομπές προς επιθεώρηση πρωτοτύπου"));
        const ul=el("ul");
        for(const entry of answer.references.slice(0,12))
          if(typeof entry==="string")ul.append(el("li",entry));
        section.append(ul);
      }
      if(Array.isArray(answer.source_candidates)&&answer.source_candidates.length){
        section.append(el("h4","Αυτούσια αποσπάσματα για έλεγχο πηγής και σελίδας"));
        section.append(el("p","Οι εγγραφές είναι προτεινόμενες παραπομπές σε αποκτημένο κείμενο, όχι ιστορικά επαληθευμένα γεγονότα. Ο έλεγχος της πρωτότυπης σελίδας και της ανεξαρτησίας των πηγών εκκρεμεί."));
        const labels={
          SUPPORTED_QUOTATION_ONLY:"Το απόσπασμα στηρίζει την απόδοση στην πηγή — όχι την ιστορική αλήθεια",
          UNSUPPORTED:"Ο ισχυρισμός δεν υποστηρίχθηκε από το απόσπασμα",
          UNCERTAIN:"Η στήριξη παραμένει αβέβαιη",
          NOT_REVIEWED:"Δεν ολοκληρώθηκε ακόμη ο έλεγχος"
        };
        for(const candidate of answer.source_candidates.slice(0,12)){
          if(!candidate||typeof candidate!=="object")continue;
          const detail=el("details");
          detail.append(el("summary",String(candidate.source_title||"Πηγή")+" · "+String(candidate.page_locator||"σελίδα μη διαθέσιμη")));
          detail.append(el("p","Προτεινόμενος ισχυρισμός μοντέλου: "+String(candidate.proposed_statement||"")));
          detail.append(el("blockquote",String(candidate.exact_acquired_quote||"")));
          detail.append(el("p","Θέση: "+String(candidate.page_locator||"σελίδα μη διαθέσιμη")+
            (candidate.source_lines?" · "+String(candidate.source_lines):"")));
          detail.append(el("p",labels[candidate.model_review_decision]||"Δεν έχει αποδειχθεί η τεκμηρίωση."));
          if(candidate.review_reason)detail.append(el("p","Αιτιολόγηση ελέγχου: "+String(candidate.review_reason)));
          if(candidate.source_text_sha256)detail.append(el("p","SHA-256 κειμένου: "+String(candidate.source_text_sha256)));
          section.append(detail);
        }
      }
      if(!answer.paragraphs?.length)
        section.append(el("p","Δεν υπάρχει ακόμη τελική τεκμηριωμένη σύνθεση από μοντέλο."));
    }catch(e){
      if(e.message==="PRIVATE_ANSWER_NOT_READY"||e.message.includes("404")){
        section.append(el("p","Τα πρωτογενή τεκμήρια διατηρούνται. Η ιδιωτική σύνθεση δεν έχει ολοκληρωθεί ακόμη."));
      }else{
        section.append(el("p","Η ιδιωτική αναφορά δεν είναι διαθέσιμη: "+e.message));
      }
    }
    status.querySelector(".n7-private-analysis")?.remove();
    status.append(section);
  }
  recovered.addEventListener("click",()=>{
    status.replaceChildren(el("p","Ανάκτηση ιδιωτικής αναφοράς Νάξου..."));
    showPrivateSynthesis("42434462262");
  });
  async function refresh(){
    if(!safeId.test(id)||panel.classList.contains("hidden"))return;
    try{
      const mission=await request("/api/research/missions/"+encodeURIComponent(id));
      render(mission);
      if(/^[0-9]{8,20}$/.test(String(mission.research_run_id||"")))
        await showPrivateSynthesis(String(mission.research_run_id));
    }
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