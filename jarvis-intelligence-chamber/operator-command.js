"use strict";
(()=>{
  const form=document.getElementById("operatorCommand");
  const input=document.getElementById("operatorQuery");
  const state=document.getElementById("commandState");
  const button=document.getElementById("executeQuery");
  if(!form||!input||!state||!button)return;
  const endpoint="https://pct-live.piratecartography.com/pct-api/live/dispatch";

  function setState(text,mode=""){
    state.textContent=text;
    form.classList.remove("is-pending","is-error");
    if(mode)form.classList.add(mode);
  }
  function operatorKey(){
    let key=sessionStorage.getItem("jarvis_operator_key")||"";
    if(!key){
      key=window.prompt("JARVIS operator key")||"";
      if(key)sessionStorage.setItem("jarvis_operator_key",key);
    }
    return key;
  }
  async function dispatch(query,key){
    const r=await fetch(endpoint,{
      method:"POST",
      headers:{"content-type":"application/json","authorization":"Bearer "+key},
      body:JSON.stringify({query})
    });
    let data={};try{data=await r.json()}catch(_){}
    if(!r.ok){const err=new Error(data.error||("dispatch_http_"+r.status));err.status=r.status;throw err;}
    return data;
  }

  input.addEventListener("input",()=>setState(input.value.trim()?"QUERY READY":"READY"));

  form.addEventListener("submit",async e=>{
    e.preventDefault();
    const query=input.value.trim();
    if(!query){setState("ENTER A QUERY","is-error");input.focus();return;}
    const key=operatorKey();
    if(!key){setState("OPERATOR KEY REQUIRED","is-error");return;}
    button.disabled=true;input.disabled=true;setState("DISPATCHING","is-pending");
    try{
      document.body.dataset.operatorQuery=query;
      window.dispatchEvent(new CustomEvent("jarvis:operator-query",{detail:{query}}));
      const result=await dispatch(query,key);
      document.body.dataset.dispatchRequest=result.request_id||"";
      setState("DISPATCHED","is-pending");
      input.value="";
      setTimeout(()=>setState("READY"),3500);
    }catch(err){
      if(err.status===401){sessionStorage.removeItem("jarvis_operator_key");setState("INVALID OPERATOR KEY","is-error");}
      else if(err.status===503)setState("SERVER CONFIG REQUIRED","is-error");
      else if(err.status===429)setState("WAIT — TRY AGAIN","is-error");
      else setState("DISPATCH FAILED","is-error");
    }finally{button.disabled=false;input.disabled=false;}
  });
})();