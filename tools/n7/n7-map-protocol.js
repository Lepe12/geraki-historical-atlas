// N7_MAP_PROTOCOL_V1: bounded postMessage contract. The authenticated N7 window opens NABOU
// and sends map commands; NABOU replies with the state it ACTUALLY reached. No cookies,
// conversation history or credentials cross origins. Only public excerpts the owner chose to
// display are sent with a "results" command.
(function(root){
 'use strict';
 const SCHEMA='n7-map/v1',BOT='https://bot.piratecartography.com',ATLAS='https://lepe12.github.io';
 const ATLAS_URL=ATLAS+'/geraki-historical-atlas/jarvis-intelligence-chamber/';
 const ACTIONS=new Set(['focus','sources','results','home']);
 const nonceOK=x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
 const idOK=x=>typeof x==='string'&&/^[a-f0-9-]{36}$/.test(x);
 const placeOK=x=>typeof x==='string'&&/^[a-z][a-z0-9-]{1,40}$/.test(x);
 const str=(v,max)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max):'';
 function envelope(data,nonce){return !!data&&typeof data==='object'&&data.schema===SCHEMA&&nonceOK(nonce)&&data.nonce===nonce&&typeof data.type==='string';}
 function opening(hash){
  // Parsed on the NABOU side from location.hash; refuses anything but the exact N7 origin.
  try{const raw=new URLSearchParams(String(hash||'').replace(/^#/,'')).get('n7map');if(!raw||raw.length>400)return null;
   const o=JSON.parse(raw);return o&&o.schema===SCHEMA&&o.origin===BOT&&nonceOK(o.nonce)?{nonce:o.nonce}:null;}catch{return null;}
 }
 function openUrl(nonce){if(!nonceOK(nonce))throw Error('invalid nonce');return ATLAS_URL+'#n7map='+encodeURIComponent(JSON.stringify({schema:SCHEMA,nonce,origin:BOT}));}
 function excerpt(e){
  if(!e||typeof e!=='object')return null;
  const page=Number.isSafeInteger(e.scan_index)&&e.scan_index>0?e.scan_index:null;
  const out={title:str(e.title,200),author:str(e.author,160),year:str(String(e.year??''),40),
   printed_page:str(String(e.printed_page??''),40),scan_index:page,text:str(e.text,700),
   source_id:typeof e.source_id==='string'&&/^[a-f0-9]{64}$/.test(e.source_id)?e.source_id:null,
   categories:Array.isArray(e.categories)?e.categories.filter(c=>['base','attack','refuge','piracy'].includes(c)):[]};
  return out.title&&out.text?out:null;
 }
 function results(value){
  if(!value||typeof value!=='object'||!Array.isArray(value.places))return null;
  const places=[];
  for(const p of value.places.slice(0,25)){
   if(!p||typeof p.name!=='string')continue;
   const ex=(Array.isArray(p.excerpts)?p.excerpts:[]).slice(0,6).map(excerpt).filter(Boolean);
   if(!ex.length)continue;
   places.push({place:placeOK(p.place)?p.place:null,name:str(p.name,80),method:'NAME_MATCH_IN_SOURCE_TEXT',excerpts:ex});
  }
  return {query:str(value.query,200),from:Number.isInteger(value.from)?value.from:null,to:Number.isInteger(value.to)?value.to:null,places,historically_verified:false};
 }
 function command(data){
  if(!data||data.type!=='command'||!idOK(data.id)||!ACTIONS.has(data.action))return null;
  if(data.action==='focus'||data.action==='sources'){if(data.place!=null&&!placeOK(data.place))return null;return {id:data.id,action:data.action,place:data.place??null};}
  if(data.action==='results'){const r=results(data.results);return r?{id:data.id,action:'results',results:r}:null;}
  return {id:data.id,action:data.action};
 }
 function state(value){
  if(!value||typeof value!=='object')return null;
  const v=value.view&&typeof value.view==='object'?value.view:{};
  const n=x=>typeof x==='number'&&Number.isFinite(x)?Math.round(x*1000)/1000:null;
  return {selected:placeOK(value.selected)?value.selected:null,page:str(value.page,20)||null,
   sourcesOpen:value.sourcesOpen===true,view:{x:n(v.x),y:n(v.y),s:n(v.s)},map3d:value.map3d===true};
 }
 const api={SCHEMA,BOT,ATLAS,ATLAS_URL,nonceOK,idOK,placeOK,envelope,opening,openUrl,command,results,state};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.N7MapProtocol=api;
})(typeof window==='undefined'?globalThis:window);
