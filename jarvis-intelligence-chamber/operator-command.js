"use strict";
(()=>{
  const form=document.getElementById("operatorCommand"),input=document.getElementById("operatorQuery"),state=document.getElementById("commandState"),button=document.getElementById("executeQuery");
  if(!form||!input||!state||!button)return;
  const api="https://pct-live.piratecartography.com/pct-api/live";
  const endpoint=api+"/dispatch";
  let waitingForRun=false,previousRun="";
  const setState=(text,mode="")=>{state.textContent=text;form.classList.remove("is-pending","is-error");if(mode)form.classList.add(mode);window.dispatchEvent(new CustomEvent("jarvis:mission-state",{detail:{state:text}}));};
  async function dispatch(query){const r=await fetch(endpoint,{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({query})});let data={};try{data=await r.json()}catch(_){}if(!r.ok){const err=new Error(data.error||("dispatch_http_"+r.status));err.status=r.status;throw err;}return data;}
  window.addEventListener("jarvis:research-state",e=>{const d=e.detail||{};if(waitingForRun&&d.request_id&&d.request_id===document.body.dataset.dispatchRequest){waitingForRun=false;document.body.dataset.operatorRun=d.run_id;setState(d.state||"RUN RECEIVED");}else if(!waitingForRun&&document.body.dataset.operatorRun&&d.run_id===document.body.dataset.operatorRun){setState(d.state||"RUN RECEIVED");}});
  input.addEventListener("input",()=>setState(input.value.trim()?"QUERY READY":"READY"));
  window.addEventListener("jarvis:reuse-query",e=>{input.value=e.detail?.query||"";setState(input.value?"QUERY READY":"READY");input.focus();});
  form.addEventListener("submit",async e=>{e.preventDefault();const query=input.value.trim();if(!query){setState("ENTER A QUERY","is-error");input.focus();return;}button.disabled=true;input.disabled=true;previousRun=document.body.dataset.currentResearchRun||"";setState("SENDING REQUEST","is-pending");try{document.body.dataset.operatorQuery=query;window.dispatchEvent(new CustomEvent("jarvis:operator-query",{detail:{query}}));const result=await dispatch(query);document.body.dataset.dispatchRequest=result.request_id||"";waitingForRun=true;setState("REQUEST ACCEPTED — WAITING FOR RUN","is-pending");input.value="";}catch(err){if(err.status===403)setState("REQUEST ORIGIN BLOCKED","is-error");else if(err.status===503)setState("SERVER CONFIG REQUIRED","is-error");else if(err.status===429)setState("WAIT — TRY AGAIN","is-error");else setState("DISPATCH FAILED","is-error");}finally{button.disabled=false;input.disabled=false;}});
})();
