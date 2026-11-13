// N7_ATLAS_MAP_LINK_V1 — NABOU side of n7-map/v1. Active only when this page was opened by the
// authenticated N7 window with a valid #n7map fragment. Uses only the existing public atlas APIs
// (NABOU_PRO_ATLAS.select / NABOU_ATLAS.setPage); renderers, camera and zoom are untouched.
(()=>{
 'use strict';
 const P=window.N7MapProtocol;if(!P||!window.opener)return;
 const opened=P.opening(location.hash);if(!opened)return;
 const opener=window.opener,seen=new Set();let nonce=opened.nonce;
 history.replaceState(null,'',location.pathname+location.search);
 const post=data=>{try{if(!opener.closed)opener.postMessage({schema:P.SCHEMA,nonce,...data},P.BOT);}catch{}};
 const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
 const atlas=()=>window.NABOU_PRO_ATLAS;
 function current(){
  const a=atlas(),card=document.querySelector('#proPlaceInfo details.n7-sources');
  let view=null;try{view=a?.view?.()||null;}catch{}
  return P.state({selected:a?.selected||null,page:window.NABOU_ATLAS?.page?.()||null,
   sourcesOpen:!!card?.open,view,map3d:!!window.NABOU_MAP3D?.enabled});
 }
 // Results panel: textContent only; places without a NABOU reference point stay unlocated.
 const panel=el('aside',null,'n7-map-results');panel.id='n7MapResults';panel.hidden=true;
 panel.setAttribute('aria-label','Αποτελέσματα N7 από τη βιβλιοθήκη');
 const back=el('button','← N7','n7-map-back');back.setAttribute('aria-label','Επιστροφή στον Humanoid N7');back.title='Επιστροφή στον Humanoid N7';back.type='button';back.id='n7MapBack';
 back.addEventListener('click',()=>{post({type:'return'});try{opener.focus();}catch{}});
 const css=el('style','.n7-map-back{position:fixed;left:18px;bottom:84px;z-index:9000;padding:8px 14px;border:1px solid #2b6d7d;border-radius:999px;background:rgba(6,14,20,.92);color:#bff6ff;font:600 13px system-ui,sans-serif;letter-spacing:.04em;cursor:pointer;box-shadow:0 0 18px rgba(0,214,240,.18)}.n7-map-back:focus-visible,.n7-map-results button:focus-visible{outline:2px solid #5be7f6;outline-offset:2px}.n7-map-results{position:fixed;right:12px;top:60px;bottom:12px;z-index:8999;width:min(380px,calc(100vw - 24px));overflow:auto;padding:14px 16px;border:1px solid #24525e;border-radius:12px;background:rgba(5,11,16,.96);color:#dfeef2;font:14px/1.5 system-ui,sans-serif}.n7-map-results-head{display:flex;justify-content:space-between;align-items:center}.n7-map-results h2{font-size:15px;margin:0;color:#7fe9f6;letter-spacing:.05em}.n7-map-results h3{font-size:12px;margin:16px 0 6px;color:#8aa3ad;text-transform:uppercase;letter-spacing:.08em}.n7-map-results button{background:none;border:1px solid #2b5562;border-radius:7px;color:#bff6ff;cursor:pointer;padding:3px 9px}.n7-map-place{border-top:1px solid #1d3740;padding:10px 0}.n7-map-place-name{font-weight:600;font-size:14px}.n7-map-note{color:#8aa3ad;font-size:12px;margin:4px 0}.n7-map-results blockquote{margin:8px 0 2px;padding-left:9px;border-left:2px solid #2fc6dc;white-space:pre-wrap}.n7-map-results cite{display:block;color:#93aab3;font-size:12px;font-style:normal}@media(max-width:640px){.n7-map-back{left:auto;right:10px;bottom:auto;top:64px}.n7-map-results{left:8px;right:8px;width:auto;top:auto;max-height:55vh}}');
 function mount(){if(!css.isConnected)document.head.append(css);if(!panel.isConnected)document.body.append(panel);if(!back.isConnected)document.body.append(back);}
 function cite(x){return [x.author,x.title,x.year].filter(Boolean).join(', ')+(x.printed_page?', σ. '+x.printed_page:'')+(x.scan_index?' (σάρωση '+x.scan_index+')':'');}
 function renderResults(r){
  panel.replaceChildren();
  const head=el('div',null,'n7-map-results-head');
  head.append(el('h2','N7 · Ευρήματα βιβλιοθήκης'));
  const close=el('button','×');close.type='button';close.setAttribute('aria-label','Κλείσιμο');close.onclick=()=>{panel.hidden=true;post({type:'state',state:current()});};
  head.append(close);panel.append(head);
  panel.append(el('p','Ερώτημα: '+(r.query||'—')+(r.from?' · '+r.from+'–'+r.to:''),'n7-map-note'));
  panel.append(el('p','Αυτούσια αποσπάσματα από τη βιβλιοθήκη. Η αντιστοίχιση τόπου είναι ταύτιση ονόματος στο κείμενο, όχι ιστορική επαλήθευση.','n7-map-note'));
  const located=r.places.filter(p=>p.place&&atlas()?.places?.some(x=>x.id===p.place));
  const unlocated=r.places.filter(p=>!located.includes(p));
  const section=(title,list,mapped)=>{
   if(!list.length)return;panel.append(el('h3',title));
   for(const p of list){
    const box=el('section',null,'n7-map-place');
    const name=mapped?el('button',p.name,'n7-map-place-name'):el('strong',p.name,'n7-map-place-name');
    if(mapped){name.type='button';name.onclick=()=>{atlas().select(p.place);post({type:'state',state:current()});};}
    box.append(name,el('p',mapped?'Γεωεντοπισμός: σημείο αναφοράς NABOU (σύγχρονη θέση)':'Γεωεντοπισμός: δεν υπάρχει εγκεκριμένο σημείο — δεν τοποθετείται στον χάρτη','n7-map-note'));
    for(const x of p.excerpts){const q=el('blockquote',x.text);const c=el('cite',cite(x));box.append(q,c);}
    panel.append(box);
   }
  };
  section('Με σημείο στον χάρτη',located,true);section('Χωρίς γεωεντοπισμό',unlocated,false);
  if(!r.places.length)panel.append(el('p','Δεν υπάρχουν ευρήματα με τεκμηριωμένο απόσπασμα.','n7-map-note'));
  panel.hidden=false;return {located:located.length,unlocated:unlocated.length};
 }
 function run(c){
  const a=atlas();
  if(!a)return {ok:false,error:'NABOU_ATLAS_NOT_READY'};
  if(c.action==='home'){window.NABOU_ATLAS?.setPage?.('home');return {ok:true};}
  if(c.action==='results'){const n=renderResults(c.results);if(n.located)a.select(c.results.places.find(p=>p.place&&a.places.some(x=>x.id===p.place)).place);return {ok:true,...n};}
  const id=c.place||a.selected;
  if(!a.places.some(x=>x.id===id))return {ok:false,error:'PLACE_NOT_IN_NABOU_GAZETTEER'};
  window.NABOU_ATLAS?.setPage?.('home');a.select(id);
  if(c.action==='sources'){const d=document.querySelector('#proPlaceInfo details.n7-sources');if(!d)return {ok:false,error:'SOURCES_PANEL_UNAVAILABLE'};d.open=true;d.scrollIntoView?.({block:'nearest'});}
  return {ok:a.selected===id};
 }
 window.addEventListener('message',event=>{
  if(event.origin!==P.BOT||event.source!==opener||!P.envelope(event.data,nonce))return;
  const c=P.command(event.data);if(!c||seen.has(c.id))return;
  if(seen.size>=500){post({type:'closed'});return;}
  seen.add(c.id);mount();
  let out;try{out=run(c);}catch(e){out={ok:false,error:'NABOU_COMMAND_FAILED'};}
  // Reported after the command so N7 receives the state NABOU actually reached.
  requestAnimationFrame(()=>post({type:'ack',id:c.id,...out,state:current()}));
 });
 let last='';
 setInterval(()=>{const s=current(),k=JSON.stringify(s);if(k!==last){last=k;post({type:'state',state:s});}if(opener.closed)back.hidden=true;},1000);
 const ready=()=>{mount();post({type:'ready',places:(atlas()?.places||[]).map(({id,name})=>({id,name})),state:current()});};
 if(atlas())ready();else{let n=0;const t=setInterval(()=>{if(atlas()||++n>100){clearInterval(t);if(atlas())ready();else post({type:'error',message:'NABOU_ATLAS_NOT_READY'});}},100);}
 window.addEventListener('pagehide',()=>post({type:'closed'}));
 // A reloaded N7 window re-targets this same named window: re-bind without reloading the map.
 window.addEventListener('hashchange',()=>{const o=P.opening(location.hash);if(!o)return;nonce=o.nonce;seen.clear();last='';
  history.replaceState(null,'',location.pathname+location.search);ready();});
})();
