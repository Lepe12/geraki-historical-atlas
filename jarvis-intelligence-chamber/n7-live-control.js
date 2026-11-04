(function () {
  "use strict";
  if (document.getElementById("n7-live-test-button")) return;
  const API="https://pct-live.piratecartography.com/pct-api/live/n7/code";
  const el=(tag,attrs={},text="")=>{
    const node=document.createElement(tag);
    for(const [key,value] of Object.entries(attrs)){
      if(key==="style")node.style.cssText=value;
      else node.setAttribute(key,value);
    }
    if(text)node.textContent=text;
    return node;
  };
  const button=el("button",{id:"n7-live-test-button",type:"button",style:"position:fixed;bottom:18px;right:18px;z-index:2147480000;padding:10px 15px;border:1px solid #55d5df;border-radius:8px;color:#e6ffff;background:#102b3b;font:600 13px sans-serif;cursor:pointer;box-shadow:0 6px 20px #0009;"},"N7 · Δοκιμή Qwen");
  const panel=el("section",{role:"dialog","aria-label":"Δοκιμή σύνδεσης N7 με Qwen 7B",style:"position:fixed;right:18px;bottom:66px;z-index:2147480000;width:min(350px,calc(100vw - 36px));padding:16px;box-sizing:border-box;color:#e6ffff;background:#10202e;border:1px solid #55d5df;border-radius:10px;font:14px/1.5 sans-serif;box-shadow:0 10px 28px #000a;display:none;"});
  const title=el("strong",{},"N7 → GitHub → Qwen 7B");
  const details=el("p",{},"Μοναδική δοκιμή προεπισκόπησης. Δεν αλλάζει αρχεία ή production.");
  details.style.margin="10px 0";
  const token=el("input",{type:"password",autocomplete:"off",placeholder:"PCT_OPERATOR_TOKEN","aria-label":"Operator token",style:"width:100%;box-sizing:border-box;padding:9px;border:1px solid #7b9aab;border-radius:5px;color:#122;background:#f3ffff;"});
  const send=el("button",{type:"button",style:"margin-top:10px;padding:9px 12px;border:0;border-radius:5px;background:#56ccd9;color:#092331;font-weight:700;cursor:pointer;"},"Εκτέλεση δοκιμής");
  const close=el("button",{type:"button",style:"margin:10px 0 0 10px;padding:9px;border:1px solid #7b9aab;border-radius:5px;color:white;background:transparent;cursor:pointer;"},"Κλείσιμο");
  const status=el("p",{role:"status","aria-live":"polite",style:"margin:12px 0 0;overflow-wrap:anywhere;"},"Αναμονή δοκιμής.");
  const workflow=el("a",{href:"https://github.com/Lepe12/geraki-historical-atlas/actions/workflows/nabou-coder-v03.yml",target:"_blank",rel:"noopener noreferrer",style:"display:none;color:#9ceff8;text-decoration:underline;margin-top:8px;"},"Έλεγχος εκτέλεσης στο GitHub");
  panel.append(title,details,token,send,close,status,workflow);
  document.body.append(panel,button);
  button.addEventListener("click",()=>{panel.style.display="block";token.focus();});
  close.addEventListener("click",()=>{token.value="";panel.style.display="none";});
  send.addEventListener("click",async()=>{
    const operatorToken=token.value.trim();
    token.value="";
    workflow.style.display="none";
    if(!operatorToken){status.textContent="Εισήγαγε το token μόνο εδώ, όχι στη συνομιλία.";return;}
    send.disabled=true;
    status.textContent="Αποστολή δοκιμαστικής εργασίας...";
    try{
      const res=await fetch(API,{
        method:"POST",
        headers:{"Authorization":"Bearer "+operatorToken,"Content-Type":"application/json"},
        body:JSON.stringify({
          task:"Review mobile readability of the NABOU side rail and photon windows. Preview only; do not modify production.",
          target_files:["jarvis-intelligence-chamber/navigation-rail.css","jarvis-intelligence-chamber/photon-windows.css"],
          apply_changes:false
        }),
        signal:AbortSignal.timeout(25000)
      });
      const data=await res.json().catch(()=>({}));
      if(res.status===202 && data.status==="ACCEPTED"){
        status.textContent="HTTP 202 · Η εντολή έγινε δεκτή. Έλεγξε το GitHub για την εκτέλεση του Qwen 7B.";
        workflow.style.display="block";
      }else{
        status.textContent="HTTP "+res.status+" · "+String(data.error||"Το αίτημα δεν εγκρίθηκε.").slice(0,120);
      }
    }catch(e){
      status.textContent="Σφάλμα σύνδεσης: "+(e.name==="AbortError"||e.name==="TimeoutError"?"χρονικό όριο":e.name==="TypeError"?"δίκτυο ή περιορισμός Origin":"αποτυχία αιτήματος");
    }finally{send.disabled=false;}
  });
})();
