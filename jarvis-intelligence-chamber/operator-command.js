"use strict";
(()=>{
  const form=document.getElementById("operatorCommand");
  const input=document.getElementById("operatorQuery");
  const state=document.getElementById("commandState");
  const button=document.getElementById("executeQuery");
  if(!form||!input||!state||!button)return;

  function setState(text,mode=""){
    state.textContent=text;
    form.classList.remove("is-pending","is-error");
    if(mode)form.classList.add(mode);
  }

  input.addEventListener("input",()=>{
    setState(input.value.trim()?"QUERY READY":"READY");
  });

  form.addEventListener("submit",e=>{
    e.preventDefault();
    const query=input.value.trim();
    if(!query){
      setState("ENTER A QUERY","is-error");
      input.focus();
      return;
    }
    document.body.dataset.operatorQuery=query;
    window.dispatchEvent(new CustomEvent("jarvis:operator-query",{detail:{query}}));
    setState("COMMAND LINK REQUIRED","is-pending");
  });
})();