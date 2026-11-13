// N7_SPLIT_MAP_V1 — NABOU side panel for the atlas embedded below N7 (html.n7-embed only).
// Left bar: Χάρτης / Ιστορία / Μνημεία / Χρονολόγιο / Πηγές, a parchment place cartouche (Greek name from
// historicalNames when the record has one) and the "Αποτέλεσμα από το N7" badge (owner's design). Every value comes from an existing data.json field of the selected
// record; a missing field stays empty. Nothing is geocoded, added or inferred. textContent only.
(()=>{
 'use strict';
 if(!document.documentElement.classList.contains('n7-embed'))return;
 const M=()=>window.NABOU_MAP?.ready?.()?window.NABOU_MAP:null;
 const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
 const fold=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
 const STATUS={VERIFIED:'Επαληθευμένο σημείο',APPROXIMATE:'Σημείο κατά προσέγγιση','NEEDS RESEARCH':'Σημείο που χρειάζεται έρευνα'};
 const TABS=[['map','Χάρτης','⌖'],['history','Ιστορία','❦'],['monuments','Μνημεία','♜'],['timeline','Χρονολόγιο','⧗'],['sources','Πηγές','✎']];
 let current=null,tab='map',fromN7=false;

 const bar=el('aside',null,'n7e-bar');bar.setAttribute('aria-label','NABOU · στοιχεία τόπου');
 const brand=el('div',null,'n7e-brand');brand.append(el('span','❧','n7e-brand-mark'),el('span','NABOU','n7e-brand-name'),el('span','Ιστορικός Άτλας της Μεσογείου','n7e-brand-sub'));
 const tabs=el('div',null,'n7e-tabs');tabs.setAttribute('role','tablist');
 const body=el('div',null,'n7e-body');body.id='n7eBody';body.setAttribute('role','tabpanel');
 for(const [id,label,icon] of TABS){const b=el('button',null,'n7e-tab');b.type='button';b.dataset.tab=id;b.setAttribute('role','tab');
  b.append(el('span',icon,'n7e-tab-icon'),el('span',label,'n7e-tab-label'));b.addEventListener('click',()=>{tab=id;paint();});tabs.append(b);}
 bar.append(brand,tabs,body);
 const placeHead=el('section',null,'n7e-cartouche');placeHead.id='n7ePlace';placeHead.setAttribute('aria-live','polite');placeHead.hidden=true;
 const badge=el('div','✓ Αποτέλεσμα από το N7','n7e-badge');badge.id='n7eBadge';badge.hidden=true;

 const rows=list=>{const dl=el('dl',null,'n7e-rows');let n=0;
  for(const [k,v] of list){const t=Array.isArray(v)?v.join(', '):String(v??'').trim();if(!t)continue;dl.append(el('dt',k),el('dd',t));n++;}
  return n?dl:null;};
 const empty=text=>el('p',text,'n7e-empty');
 // Records whose modern name places them inside this place (e.g. "Kassiopi, Corfu" for Corfu).
 function related(r){
  const key=fold(String(r.modernName||r.place).split(/[(,]/)[0]);if(key.length<3)return [];
  return M().records.filter(x=>x.id!==r.id&&String(x.modernName||'').split(',').slice(1).some(part=>fold(part).replace(/\s*\(.*$/,'')===key));
 }
 // The Greek form already stored in historicalNames (e.g. "Corfù / Κέρκυρα" -> Κέρκυρα); none is invented.
 function greekName(r){return String(r.historicalNames||'').split('/').map(x=>x.trim()).find(x=>/[\u0370-\u03ff]/.test(x))||'';}
 function section(r){
  if(!r)return [empty('Ζήτησε έναν τόπο από το N7 ή επίλεξε σημείο στον χάρτη.')];
  if(tab==='map')return [rows([['Συντεταγμένες',STATUS[r.coordinateStatus]||r.coordinateStatus],['Τύπος',r.type],['Σύγχρονη ονομασία',r.modernName],['Σημείωση',r.notes]])||empty('Δεν υπάρχουν στοιχεία.')];
  if(tab==='history'){const out=[];
   out.push(r.historicalContext?el('p',r.historicalContext,'n7e-text'):empty('Δεν υπάρχει καταχωρημένο ιστορικό πλαίσιο για αυτή την εγγραφή.'));
   const d=rows([['Ρόλος',r.trilogyRole],['Εξουσία / έλεγχος',r.authority],['Πρόσωπα',r.characters],['Ιστορική κατάσταση',r.historicalStatus]]);if(d)out.push(d);return out;}
  if(tab==='monuments'){const list=related(r);if(!list.length)return [empty('Δεν υπάρχουν ακόμα επαληθευμένα σημεία.')];
   const ul=el('ul',null,'n7e-list');
   for(const x of list){const b=el('button',null,'n7e-link');b.type='button';b.append(el('strong',x.place),el('span',' · '+(x.type||'')+' · '+(STATUS[x.coordinateStatus]||''),'n7e-meta'));
    b.addEventListener('click',()=>{fromN7=false;Promise.resolve(M().focus(x.id)).then(()=>show(x.id));});const li=el('li');li.append(b);ul.append(li);}
   return [ul];}
  if(tab==='timeline')return [rows([['Περίοδος',r.period],['Βιβλία',r.books]])||empty('Δεν υπάρχει καταχωρημένη χρονολόγηση.')];
  if(tab==='sources')return [r.sources?el('p',r.sources,'n7e-text'):empty('Δεν υπάρχουν καταχωρημένες πηγές για αυτή την εγγραφή.')];
  return [];
 }
 function paint(){
  for(const b of tabs.children){const on=b.dataset.tab===tab;b.setAttribute('aria-selected',String(on));b.classList.toggle('n7e-active',on);}
  body.replaceChildren(...section(current));
  placeHead.hidden=!current;badge.hidden=!(current&&fromN7);
  if(current){const greek=greekName(current);
   placeHead.replaceChildren(el('span','❦','n7e-orn'),el('h2',greek||current.place,'n7e-place'),el('p',greek?current.place:(current.modernName||''),'n7e-alt'),
    el('span',STATUS[current.coordinateStatus]||'','n7e-status '+(current.coordinateStatus==='VERIFIED'?'ok':'approx')));}
 }
 function show(id,n7=false){const m=M();if(!m)return;current=m.records.find(r=>r.id===id)||null;if(n7){fromN7=true;tab='map';}paint();}
 function mount(){
  if(bar.isConnected)return;
  // The chamber moves unknown direct children of <body> away; its shell is a stable parent.
  const host=document.getElementById('n7Shell')||document.querySelector('main')||document.body;host.append(bar,placeHead,badge);
  const compact=()=>bar.classList.toggle('n7e-compact',innerHeight<680);compact();addEventListener('resize',compact);
  const pad=()=>{const w=innerWidth>640?bar.getBoundingClientRect().width+12:0;M()?.padding?.({left:w,bottom:innerWidth>640?0:Math.round(innerHeight*.42)});};
  pad();addEventListener('resize',pad);paint();
 }
 // The existing link reports a focus done on N7's request; marker clicks inside the map select locally.
 document.addEventListener('n7:map-focus',e=>show(e.detail?.placeId,true));
 document.addEventListener('click',e=>{const m=e.target.closest?.('[data-place-id]');if(m&&m.dataset.placeId){fromN7=false;show(m.dataset.placeId);}},true);
 // The bar appears at once (empty state); record data is read when the map reports it is ready.
 mount();let n=0;const t=setInterval(()=>{if(M()||++n>1200){clearInterval(t);if(M())M().padding?.({left:innerWidth>640?bar.getBoundingClientRect().width+12:0,bottom:innerWidth>640?0:Math.round(innerHeight*.42)});}},100);
})();
