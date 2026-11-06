"use strict";
async function n7LibrarySearch(query) {
  const response=await fetch("/api/library/search",{
    method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({query})
  });
  if(response.status===401)throw new Error("Χρειάζεται σύνδεση στο N7 για την ιστορική βιβλιοθήκη.");
  if(!response.ok)throw new Error("Αποτυχία βιβλιοθήκης: HTTP "+response.status);
  const result=await response.json();
  return {matches:Array.isArray(result.matches)?result.matches.slice(0,20):[],source_count:result.source_count,page_count:result.page_count};
}
async function n7LibraryPage(hit){
  const response=await fetch("/api/library/page",{method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({source_id:hit.source_id,scan_index:Number(hit.scan_index)})});
  if(!response.ok)throw new Error("Αδυναμία ανάγνωσης πλήρους σελίδας: HTTP "+response.status);
  const value=await response.json();
  if(value.schema!=="n7-library-page-v1"||!value.page)throw new Error("Μη έγκυρη σελίδα πηγής");
  return value.page;
}
window.N7Library={search:n7LibrarySearch,page:n7LibraryPage};

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
  const pagePanel=document.createElement("section");
  pagePanel.style.cssText="display:none;margin:16px 0;border:1px solid #6b9aab;border-radius:8px;padding:16px;background:#102536;white-space:pre-wrap;line-height:1.7";
  const back=document.createElement("button");back.type="button";back.textContent="← Επιστροφή στα αποτελέσματα";
  const pageTitle=document.createElement("h3");
  const pageMeta=document.createElement("p");
  const pageText=document.createElement("div");
  pageText.style.cssText="white-space:pre-wrap;line-height:1.75;max-height:65vh;overflow:auto";
  const pageSource=document.createElement("a");pageSource.target="_blank";pageSource.rel="noopener noreferrer";pageSource.textContent="Ψηφιακή έκδοση της πηγής";
  pagePanel.append(back,pageTitle,pageMeta,pageSource,pageText);
  back.onclick=()=>{pagePanel.style.display="none";results.style.display="block";form.style.display="block";};

  const uploadArea=document.createElement("div");
  uploadArea.style.cssText="margin:16px 0;padding:12px;border:1px solid #386478;border-radius:8px";
  const uploadLabel=document.createElement("label");uploadLabel.textContent="Προσθήκη ιδιωτικού ιστορικού PDF (έως 25 MB, έως 500 σελίδες· OCR περιορισμένο σε 30 σελίδες)";
  const pdfFile=document.createElement("input");pdfFile.type="file";pdfFile.accept=".pdf,application/pdf";
  pdfFile.style.cssText="display:block;margin:10px 0";
  const uploadButton=document.createElement("button");uploadButton.type="button";uploadButton.textContent="Εισαγωγή PDF στη βιβλιοθήκη";
  const pdfHint=document.createElement("p");pdfHint.style.cssText="font-size:12px;opacity:.82";
  pdfHint.textContent="Το PDF παραμένει στον ιδιωτικό χώρο του N7. Η αυτόματη μεταγραφή δεν σημαίνει ιστορική επαλήθευση.";
  uploadButton.onclick=async()=>{
    const file=pdfFile.files?.[0];
    if(!file){status.textContent="Επίλεξε πρώτα ένα αρχείο PDF.";return;}
    if(file.size>25*1024*1024){status.textContent="Το PDF υπερβαίνει το όριο 25 MB.";return;}
    uploadButton.disabled=true;status.textContent="Εισαγωγή και επεξεργασία PDF στη μόνιμη βιβλιοθήκη...";
    try{
      const response=await fetch("/api/library/upload",{
        method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/pdf","X-File-Name":encodeURIComponent(file.name)},
        body:file
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||"HTTP "+response.status);
      status.textContent="Εισήχθησαν "+result.imported_pages+" σελίδες στη μόνιμη βιβλιοθήκη. Οι μεταγραφές απαιτούν έλεγχο.";
      pdfFile.value="";
    }catch(error){status.textContent="Αποτυχία εισαγωγής PDF: "+error.message;}
    finally{uploadButton.disabled=false;}
  };
  uploadArea.append(uploadLabel,pdfFile,uploadButton,pdfHint);
  form.append(query,submit);overlay.append(close,title,form,uploadArea,status,results,pagePanel);document.body.append(overlay);
  open.onclick=()=>{overlay.style.display="block";query.focus()};
  close.onclick=()=>{overlay.style.display="none"};
  form.onsubmit=async(e)=>{
    e.preventDefault();pagePanel.style.display="none";results.style.display="block";form.style.display="block";results.replaceChildren();status.textContent="Αναζήτηση στη μόνιμη βιβλιοθήκη...";
    submit.disabled=true;
    try {
      const found=await n7LibrarySearch(query.value.trim());
      const matches=found.matches;
      status.textContent=matches.length?matches.length+" αποσπάσματα — μη επαληθευμένο κείμενο πηγών":found.source_count===0?"Η μόνιμη βιβλιοθήκη είναι κενή: δεν έχει εισαχθεί ακόμη καμία πηγή.":found.page_count===0?"Έχουν καταχωριστεί πηγές, αλλά δεν υπάρχουν ακόμη αναζητήσιμες σελίδες.":typeof found.page_count==="number"?"Δεν βρέθηκε η φράση σε "+found.page_count+" καταχωρισμένες σελίδες ("+found.source_count+" πηγές).":"Δεν βρέθηκαν αποσπάσματα. Δεν έχει επιβεβαιωθεί ο αριθμός καταχωρισμένων πηγών.";
      for(const hit of matches){
        const section=document.createElement("article");section.style.cssText="padding:12px;margin:12px 0;border:1px solid #386478;border-radius:6px";
        const heading=document.createElement("strong");
        heading.textContent=String(hit.title||"Άγνωστη πηγή").slice(0,250)+(hit.printed_page==null?"":" · Τυπωμένη σελίδα "+hit.printed_page)+" · Τμήμα ψηφιακού κειμένου "+hit.scan_index;
        const excerpt=document.createElement("p");excerpt.textContent=String(hit.excerpt||"");
        const sourceDetails=document.createElement("p");sourceDetails.style.cssText="font-size:12px;opacity:.85";
        sourceDetails.textContent=(hit.author||"Άγνωστος συγγραφέας")+(hit.publication_year?" ("+hit.publication_year+")":"")+" · Δευτερογενής ιστοριογραφία · μη επαληθευμένη ιστορικά";
        const showPage=document.createElement("button");showPage.type="button";showPage.textContent="Πλήρες κείμενο σελίδας";
        showPage.onclick=async()=>{
          showPage.disabled=true;
          try{
            const pg=await n7LibraryPage(hit);
            pageTitle.textContent=pg.title+(pg.printed_page?" · Τυπωμένη σελίδα "+pg.printed_page:"");
            pageMeta.textContent=(pg.author||"Άγνωστος συγγραφέας")+" · Δευτερογενής ιστορική μελέτη · ψηφιακή μεταγραφή χωρίς ανεξάρτητη επαλήθευση";
            const uri=String(pg.source_uri||"");
            pageSource.style.display=uri.startsWith("https://www.gutenberg.org/ebooks/")?"inline":"none";
            if(pageSource.style.display!=="none")pageSource.href=uri;
            pageText.textContent=String(pg.ocr_text||"");
            pagePanel.style.display="block";results.style.display="none";form.style.display="none";
            pagePanel.scrollIntoView({block:"start"});
          }catch(error){status.textContent=error.message;}
          finally{showPage.disabled=false;}
        };
        const use=document.createElement("button");use.textContent="Προσθήκη στη συνομιλία";use.type="button";
        use.onclick=()=>{
          const input=document.querySelector("#message");
          const cite="Δευτερογενής ιστοριογραφία, μη επαληθευμένη: "+String(hit.author||"")+" · "+String(hit.title||"")+" · ψηφιακό τμήμα "+hit.scan_index+
            (hit.printed_page==null?"":" · τυπωμένη σελίδα "+hit.printed_page)+" · OCR "+String(hit.ocr_status||"UNREVIEWED");
          input.value+=(input.value?"\n\n":"")+"Παρακαλώ εξέτασε το ακόλουθο μη επαληθευμένο ιστορικό απόσπασμα, χωρίς να επινοήσεις γεγονότα.\n"+cite+"\nΑπόσπασμα: "+String(hit.excerpt||"").slice(0,360);
          overlay.style.display="none";input.focus();
        };
        section.append(heading,sourceDetails,excerpt,showPage,use);results.append(section);
      }
    }catch(error){
      status.textContent=error.message;
    }finally{submit.disabled=false;}
  };
});
