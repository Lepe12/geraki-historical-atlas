// Shared, bounded protocol for the public atlas and the authenticated N7 window.
(function(root){
 'use strict';
 const SCHEMA='n7-voice/v1',BOT='https://bot.piratecartography.com',ATLAS='https://lepe12.github.io';
 const nonceOK=x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
 const idOK=x=>typeof x==='string'&&/^[a-f0-9-]{36}$/.test(x);
 function envelope(data,nonce){return !!data&&data.schema===SCHEMA&&nonceOK(nonce)&&data.nonce===nonce&&typeof data.type==='string';}
 function context(value){
  if(!value||typeof value.place!=='string'||!value.place.trim()||value.place.length>100||!Number.isInteger(value.from)||!Number.isInteger(value.to)||value.from<1500||value.to>1700||value.to<value.from)return null;
  const sources=[];for(const s of Array.isArray(value.sources)?value.sources:[]){try{const u=new URL(s.url);if(u.protocol!=='https:'||u.username||u.password||u.href.length>800)continue;sources.push({title:String(s.title||'').slice(0,120),url:u.href});if(sources.length===3)break;}catch{}}
  return {place:value.place,from:value.from,to:value.to,sources};
 }
 function question(text,scope){if(typeof text!=='string'||!text.trim()||text.length>6000)throw Error('Η ερώτηση πρέπει να έχει έως 6.000 χαρακτήρες.');const c=context(scope);return text.trim()+(c?'\n\nΠλαίσιο από τον χάρτη (δεδομένα και πηγές προς έλεγχο):\n'+JSON.stringify(c):'');}
 const api={SCHEMA,BOT,ATLAS,nonceOK,idOK,envelope,context,question};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.N7VoiceProtocol=api;
})(typeof window==='undefined'?globalThis:window);
