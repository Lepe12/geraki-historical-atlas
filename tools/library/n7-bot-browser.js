"use strict";
async function n7LibrarySearch(query) {
  const response=await fetch("https://pct-live.piratecartography.com/pct-api/live/n7/library/search",{
    method:"POST",credentials:"include",
    headers:{"Content-Type":"application/json","X-Nabou-Agent-Room":"1"},
    body:JSON.stringify({query})
  });
  if(response.status===401)throw new Error("Χρειάζεται σύνδεση GitHub N7 για τις ιδιωτικές πηγές.");
  if(!response.ok)throw new Error("Αποτυχία βιβλιοθήκης: HTTP "+response.status);
  const result=await response.json();
  return Array.isArray(result.matches)?result.matches.slice(0,8):[];
}
window.N7Library={search:n7LibrarySearch};

document.addEventListener("DOMContentLoaded",()=>{
  const sidebar=document.querySelector(".sidebar");
  if(!sidebar)return;
  const open=document.createElement("button");
  open.type="button";open.textContent="▤ Ιστορική βιβλιοθήκη";open.className="new";
  sidebar.insertBefore(open,document.querySelector("#conversations"));
  const overlay=document.createElement("section");
  overlay.setAttribute("aria-label","Αναζήτηση ιστορικών πηγών");
  overlay.style.cssText="display:none;position:fixed;z-index:50;inset:6% 8%;overflow:auto;background:#0b1a2a;border:1px solid #4b8594;border-radius:14px;padding:22px;color:#e3f6fa;box-shadow:0 15px 60px #000b";
  const title=document.createElement("h2");title.textContent="Ιστορική βιβλιοθήκη N7";
  const close=document.createElement("button");close.textContent="Κλείσιμο";close.type="button";close.style.cssText="float:right";
  const form=document.createElement("form");
  const query=document.createElement("input");query.placeholder="Όνομα, τοπωνύμιο ή φράση πηγής";query.required=true;query.minLength=2;query.maxLength=150;
  query.style.cssText="width:min(500px,75%);padding:12px;background:#122a3c;color:white;border:1px solid #478a9e;border-radius:5px";
  const submit=document.createElement("button");submit.type="submit";submit.textContent="Αναζήτηση";submit.style.marginLeft="8px";
  const status=document.createElement("p");status.setAttribute("role","status");
  const results=document.createElement("div");
  form.append(query,submit);overlay.append(close,title,form,status,results);document.body.append(overlay);
  const auth=document.createElement("a");auth.textContent="Σύνδεση στο N7 με GitHub";
  auth.href="https://pct-live.piratecartography.com/pct-api/live/n7/auth/start";
  auth.style.cssText="display:none;color:#71d8e9";overlay.append(auth);
  open.onclick=()=>{overlay.style.display="block";query.focus()};
  close.onclick=()=>{overlay.style.display="none"};
  form.onsubmit=async(e)=>{
    e.preventDefault();results.replaceChildren();status.textContent="Αναζήτηση στη μόνιμη βιβλιοθήκη...";auth.style.display="none";
    submit.disabled=true;
    try {
      const matches=await n7LibrarySearch(query.value.trim());
      status.textContent=matches.length?matches.length+" αποσπάσματα — μη επαληθευμένο κείμενο πηγών":"Δεν βρέθηκαν αποσπάσματα στη μόνιμη βιβλιοθήκη.";
      for(const hit of matches){
        const section=document.createElement("article");section.style.cssText="padding:12px;margin:12px 0;border:1px solid #386478;border-radius:6px";
        const heading=document.createElement("strong");
        heading.textContent=String(hit.title||"Άγνωστη πηγή").slice(0,250)+" · Σάρωση "+hit.scan_index+(hit.printed_page==null?"":" · Σελίδα "+hit.printed_page);
        const excerpt=document.createElement("p");excerpt.textContent=String(hit.excerpt||"").slice(0,360);
        const use=document.createElement("button");use.textContent="Προσθήκη στη συνομιλία";use.type="button";
        use.onclick=()=>{
          const input=document.querySelector("#message");
          const cite="Πηγή: "+String(hit.title||"")+" · σαρωμένη σελίδα "+hit.scan_index+
            (hit.printed_page==null?"":" · τυπωμένη σελίδα "+hit.printed_page)+" · OCR "+String(hit.ocr_status||"UNREVIEWED");
          input.value+=(input.value?"\n\n":"")+"Παρακαλώ εξέτασε το ακόλουθο μη επαληθευμένο ιστορικό απόσπασμα, χωρίς να επινοήσεις γεγονότα.\n"+cite+"\nΑπόσπασμα: "+String(hit.excerpt||"").slice(0,360);
          overlay.style.display="none";input.focus();
        };
        section.append(heading,excerpt,use);results.append(section);
      }
    }catch(error){
      status.textContent=error.message;auth.style.display="block";
    }finally{submit.disabled=false;}
  };
});
