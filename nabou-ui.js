// NABOU_INTERFACE_V2 — interface logic for the MapLibre atlas (index.html).
// Reads the existing globals of the map script (DATA, state, atlasMap, byId, render, fitAll, focusPlace,
// placeVisible, routeVisible, routePoints, routePaint). It never edits records, coordinates, the camera
// set-up, terrain or renderer: it shows stored fields, filters what is already drawn and calls the
// existing functions. Missing fields stay unavailable; nothing is geocoded or inferred. textContent only.
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const root=document.documentElement;
const embedded=()=>root.classList.contains('nb-embedded')||root.classList.contains('n7-embed');
function h(tag,attrs,...kids){
  const e=document.createElement(tag);
  if(attrs)for(const [k,v] of Object.entries(attrs)){
    if(v==null||v===false)continue;
    if(k==='class')e.className=v;else if(k==='text')e.textContent=v;
    else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);
    else if(k==='dataset')Object.assign(e.dataset,v);
    else e.setAttribute(k,v===true?'':v);
  }
  for(const c of kids.flat()){if(c==null||c===false)continue;e.append(c instanceof Node?c:document.createTextNode(String(c)));}
  return e;
}
const icon=cls=>h('i',{class:cls,'aria-hidden':'true'});
const fold=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
const txt=v=>Array.isArray(v)?v.join(', '):String(v??'').trim();

const TYPE={City:['Πόλη','fa-city'],Port:['Λιμάνι','fa-anchor'],Island:['Νησί','fa-mountain-sun'],Fortress:['Οχυρό','fa-chess-rook'],
  Region:['Περιοχή','fa-map'],Village:['Χωριό','fa-house-chimney'],'Sea / Strait':['Θάλασσα / πορθμός','fa-water']};
const typeLabel=t=>(TYPE[t]||[t||'Τόπος'])[0];
const typeIcon=t=>'fa-solid '+((TYPE[t]||[0,'fa-location-dot'])[1]);
const STATUS={VERIFIED:['Επαληθευμένο σημείο','ok'],APPROXIMATE:['Σημείο κατά προσέγγιση','warn'],'NEEDS RESEARCH':['Χρειάζεται έρευνα','risk']};
const statusChip=s=>{const [l,c]=STATUS[s]||[s||'Άγνωστη κατάσταση',''];return h('span',{class:'nb-chip '+c},h('span',{class:'nb-dot '+c}),l);};
const ROUTE_TYPE={'DEPICTED TRAVEL':'Αποτυπωμένο ταξίδι','STRONG RECONSTRUCTION':'Ισχυρή ανασύνθεση',
  'INTELLIGENCE / NETWORK':'Δίκτυο πληροφοριών (μη φυσική)','PLANNED — NOT EXECUTED':'Σχεδιασμένο — δεν εκτελέστηκε'};
const NON_PHYSICAL=new Set(['INTELLIGENCE / NETWORK','PLANNED — NOT EXECUTED']);
const MEDIUM={sea:['Θαλάσσια','fa-sailboat'],land:['Χερσαία','fa-person-walking']};
const bookLabel=b=>String(b).replace(/^Book /,'Βιβλίο ');
const greekName=p=>String(p?.historicalNames||'').split('/').map(x=>x.trim()).find(x=>/[Ͱ-Ͽ]/.test(x))||'';
const yearsIn=s=>[...String(s||'').matchAll(/\b(1[5-6]\d\d)\b/g)].map(m=>+m[1]);
const people=s=>String(s||'').split(';').map(x=>x.trim()).filter(Boolean);

const PANELS=[['history','Ιστορία','fa-book-open'],['settlements','Οικισμοί','fa-city'],['monuments','Μνημεία','fa-chess-rook'],
  ['people','Πρόσωπα','fa-user-group'],['routes','Διαδρομές','fa-route'],['sources','Πηγές','fa-scroll']];
const ui={panel:null,sel:null,typeFilter:'all',scope:'filtered',personOpen:null,peopleQ:'',sourcesQ:'',settleQ:'',
  layers:{settlements:true,labels:true,routes:true,ships:true,morph:true,approxMark:true},
  status:{VERIFIED:true,APPROXIMATE:true,'NEEDS RESEARCH':true},routeTypes:null};

const ready=()=>typeof DATA!=='undefined'&&DATA.places.length>0;
const mapReady=()=>typeof atlasMap!=='undefined'&&atlasMap&&typeof n7MapLoaded!=='undefined'&&n7MapLoaded;
const placeById=id=>ready()?byId.get(id)||null:null;
const routeById=id=>ready()?DATA.routes.find(r=>r.id===id)||null:null;
const placesInView=()=>DATA.places.filter(p=>bookHit(p)&&yearHit(p));
const routesInView=()=>DATA.routes.filter(r=>routeVisible(r));

/* ───────── status toast ───────── */
let toastT=0;
function toast(msg,ms=2600){const s=$('nbStatus');if(!s)return;s.textContent=msg;s.classList.add('show');clearTimeout(toastT);if(ms)toastT=setTimeout(()=>s.classList.remove('show'),ms);}

/* ───────── dock ───────── */
const stage=$('nbStage'),dock=$('nbDock'),dockBody=$('nbDockBody');
function buildTabs(){
  const bar=dock.querySelector('.nb-dock-tabs');bar.replaceChildren();
  for(const [id,label,ic] of PANELS){
    bar.append(h('button',{type:'button',class:'nb-dock-tab',role:'tab','aria-selected':'false',dataset:{panel:id},title:label,onclick:()=>openPanelView(id)},
      icon('fa-solid '+ic),h('span',{class:'nb-t-label',text:label})));
  }
}
// The dock floats over the right edge; the camera keeps its own padding (no setPadding here, which
// would interrupt the atlas's flyTo/fitBounds animations). Focused places are centred left of the dock.
function syncPadding(){}
function openPanelView(id){
  if(embedded())return;
  ui.panel=id;dock.hidden=false;stage.classList.add('nb-dock-open');
  for(const b of document.querySelectorAll('.nb-nc-btn[data-panel]'))b.classList.toggle('nb-active',b.dataset.panel===id);
  for(const b of dock.querySelectorAll('.nb-dock-tab'))b.setAttribute('aria-selected',String(b.dataset.panel===id));
  paint();syncPadding();
}
function closeDock(){
  ui.panel=null;dock.hidden=true;stage.classList.remove('nb-dock-open');
  for(const b of document.querySelectorAll('.nb-nc-btn[data-panel]'))b.classList.remove('nb-active');
  syncPadding();
}
function setHead(kicker,title){$('nbDockKicker').textContent=kicker||'';const t=$('nbDockTitle');t.textContent=title||'';t.hidden=!title;}
function paint(){
  if(dock.hidden||!ui.panel)return;
  const keep=dockBody.scrollTop;
  const f={history:viewHistory,settlements:viewSettlements,monuments:viewMonuments,people:viewPeople,routes:viewRoutes,sources:viewSources}[ui.panel];
  if(!ready()){setHead('NABOU','Φόρτωση δεδομένων…');dockBody.replaceChildren(empty('fa-solid fa-spinner fa-spin','Φόρτωση των εγγραφών του άτλαντα…'));return;}
  dockBody.replaceChildren(...f());
  if(ui.panel===paint.last)dockBody.scrollTop=keep;else dockBody.scrollTop=0;paint.last=ui.panel;
}
const empty=(ic,t)=>h('div',{class:'nb-empty'},icon(ic),t);
const section=(title,...kids)=>h('section',{class:'nb-section'},h('h3',{class:'nb-section-h',text:title}),...kids);
function dl(rows){const d=h('dl',{class:'nb-dl'});let n=0;for(const [k,v] of rows){const t=v instanceof Node?v:txt(v);if(!(v instanceof Node)&&!t)continue;d.append(h('dt',{text:k}),h('dd',null,t));n++;}return n?d:null;}
function filterLine(){
  const parts=[];if(state.book!=='All')parts.push(bookLabel(state.book));if(state.year!=='All')parts.push('έτος '+state.year);
  return parts.length?'Φίλτρο: '+parts.join(' · '):'Χωρίς χρονικό φίλτρο';
}

/* selection */
function markSelected(){
  document.querySelectorAll('[data-nb-selected]').forEach(e=>e.removeAttribute('data-nb-selected'));
  if(ui.sel?.kind==='place')document.querySelectorAll('[data-place-id="'+CSS.escape(ui.sel.id)+'"]').forEach(e=>e.setAttribute('data-nb-selected','1'));
  try{if(mapReady()&&atlasMap.getLayer('nb-route-focus'))atlasMap.setFilter('nb-route-focus',['==',['get','id'],ui.sel?.kind==='route'?ui.sel.id:'']);}catch{}
  updateN7Link();
}
function selectPlace(p){
  if(!p)return;ui.sel={kind:'place',id:p.id};markSelected();
  if(embedded())return;
  if(!(bookHit(p)&&yearHit(p)))toast('Ο τόπος βρίσκεται εκτός του ενεργού φίλτρου βιβλίου/έτους.');
  openPanelView('history');
}
function selectRoute(r){if(!r)return;ui.sel={kind:'route',id:r.id};markSelected();if(!embedded())openPanelView('history');}
function goPlace(id){const p=placeById(id);if(!p)return;if(typeof focusPlace==='function')focusPlace(id);else selectPlace(p);}
function goRoute(r){
  selectRoute(r);
  if(!mapReady())return;
  const pts=routePoints(r);if(pts.length<2)return;
  const b=new maplibregl.LngLatBounds();pts.forEach(([lat,lon])=>b.extend([lon,lat]));
  // Same framing parameters as the atlas's own fitAll(); only the bounds differ.
  atlasMap.fitBounds(b,{padding:90,maxZoom:7.5,duration:900,pitch:48,bearing:-9});
  if(!routeVisible(r))toast('Η διαδρομή δεν σχεδιάζεται με το ενεργό φίλτρο ή είναι κρυφή στον άτλαντα.');
}

/* ───────── views ───────── */
function viewHistory(){
  const s=ui.sel;
  if(s?.kind==='place'){const p=placeById(s.id);if(p)return placeView(p);}
  if(s?.kind==='route'){const r=routeById(s.id);if(r)return routeView(r);}
  setHead('Επισκόπηση','Ιστορικός Άτλας');
  const P=placesInView(),R=routesInView();
  const out=[h('div',{class:'nb-stat-grid'},
    h('div',{class:'nb-stat'},h('b',{text:P.length}),h('span',{text:'τόποι'})),
    h('div',{class:'nb-stat'},h('b',{text:P.filter(p=>p.coordinateStatus==='VERIFIED').length}),h('span',{text:'επαληθευμένα σημεία'})),
    h('div',{class:'nb-stat'},h('b',{text:R.length}),h('span',{text:'διαδρομές'}))),
    h('p',{class:'nb-meta',text:filterLine()}),
    empty('fa-regular fa-hand-pointer','Επίλεξε έναν οικισμό στον χάρτη, αναζήτησε ένα τοπωνύμιο ή ζήτησε από τον N7 να εντοπίσει έναν τόπο.')];
  const pol=DATA.policy||{};
  out.push(section('Κανόνες δεδομένων',h('ul',{class:'nb-list'},
    pol.noGeocoding?h('li',{class:'nb-meta',text:'• Καμία αυτόματη γεωκωδικοποίηση.'}):null,
    pol.noInventedCoordinates?h('li',{class:'nb-meta',text:'• Καμία επινοημένη συντεταγμένη· όσα λείπουν μένουν μη διαθέσιμα.'}):null,
    h('li',{class:'nb-meta',text:'• Οι γραμμές διαδρομών είναι σχηματικές και δεν αποτελούν βεβαιωμένες ιστορικές πορείες.'}))));
  return out;
}
function placeView(p){
  const gr=greekName(p);setHead('Ιστορία τόπου','');
  const card=h('div',{class:'nb-card'},
    h('div',{class:'nb-kicker',text:typeLabel(p.type)}),
    h('h3',{class:'nb-card-name',text:gr||p.place}),
    h('p',{class:'nb-card-alt',text:[gr?p.place:'',p.historicalNames&&!gr?p.historicalNames:'',p.modernName?'Σήμερα: '+p.modernName:''].filter(Boolean).join(' · ')}),
    h('div',{class:'nb-chips'},statusChip(p.coordinateStatus),...(p.books||[]).map(b=>h('span',{class:'nb-chip cy',text:bookLabel(b)}))));
  const out=[card];
  const lead=p.historicalContext||p.trilogyRole;
  if(lead)out.push(h('p',{class:'nb-lead',text:lead}));
  const ppl=people(p.characters);
  const pplNode=ppl.length?h('div',null,...ppl.map(n=>h('button',{type:'button',class:'nb-person',text:n,onclick:()=>{ui.personOpen=n;openPanelView('people');}}))):'';
  const d=dl([['Περίοδος',p.period],['Ρόλος',p.historicalContext?p.trilogyRole:''],['Εξουσία / έλεγχος',p.authority],['Πρόσωπα',pplNode],['Ιστορική κατάσταση',p.historicalStatus]]);
  if(d)out.push(section('Ιστορικά στοιχεία',d));
  if(p.sources)out.push(section('Πηγές',h('p',{class:'nb-quote',text:p.sources})));
  const geo=dl([['Κατάσταση σημείου',STATUS[p.coordinateStatus]?.[0]||p.coordinateStatus],
    ['Συντεταγμένες',Number.isFinite(p.lat)&&Number.isFinite(p.lon)?p.lat.toFixed(4)+', '+p.lon.toFixed(4):''],['Σημείωση',p.notes],['Σημείωση χάρτη',p.atlasDisplayNote]]);
  if(geo)out.push(section('Γεωγραφία',geo));
  const rr=DATA.routes.filter(r=>[...(r.from||[]),...(r.to||[])].some(x=>x.id===p.id));
  if(rr.length)out.push(section('Διαδρομές από / προς',routeList(rr)));
  const rel=relatedPlaces(p);
  if(rel.length)out.push(section('Σημεία μέσα στον τόπο',placeList(rel)));
  const missing=[['historicalContext','ιστορικό πλαίσιο'],['sources','πηγές'],['authority','εξουσία'],['characters','πρόσωπα']].filter(([k])=>!txt(p[k])).map(([,l])=>l);
  if(missing.length)out.push(h('p',{class:'nb-missing',text:'Δεν έχουν καταχωριστεί: '+missing.join(', ')+'.'}));
  out.push(h('div',{class:'nb-actions'},
    h('button',{type:'button',class:'nb-btn primary',onclick:()=>goPlace(p.id)},icon('fa-solid fa-location-crosshairs'),'Εστίαση'),
    h('a',{class:'nb-btn',href:n7Href(p),target:'_blank',rel:'noopener'},h('b',{text:'N7'}),'Ρώτησε τον N7')));
  return out;
}
function routeView(r){
  setHead('Διαδρομή · '+(ROUTE_TYPE[r.type]||r.type||''),'');
  const [mLabel,mIcon]=MEDIUM[r.medium]||[r.medium||'',''];
  const card=h('div',{class:'nb-card'},h('div',{class:'nb-kicker',text:'Διαδρομή'+(r.sequence!=null?' · #'+r.sequence:'')}),
    h('h3',{class:'nb-card-name',style:'font-size:22px',text:r.name||'Διαδρομή'}),
    h('p',{class:'nb-card-alt',text:r.character||''}),
    h('div',{class:'nb-chips'},mLabel?h('span',{class:'nb-chip'},mIcon?icon('fa-solid '+mIcon):null,mLabel):null,
      h('span',{class:'nb-chip '+(r.status==='VERIFIED'?'ok':'warn'),text:r.status==='VERIFIED'?'Τεκμηριωμένη':(r.status||'')}),
      ...(r.books||[]).map(b=>h('span',{class:'nb-chip cy',text:bookLabel(b)}))));
  const placeBtns=list=>(list||[]).length?h('div',null,...list.map(x=>byId.has(x.id)?h('button',{type:'button',class:'nb-person',text:x.name,onclick:()=>goPlace(x.id)}):h('span',{class:'nb-person',text:x.name}))):'';
  const out=[card];
  if(r.story)out.push(h('p',{class:'nb-lead',text:r.story}));
  const d=dl([['Πρόσωπο',r.character],['Περίοδος',r.period],['Από',placeBtns(r.from)],['Προς',placeBtns(r.to)],['Σκάφος',r.vessel],['Τύπος',ROUTE_TYPE[r.type]||r.type],['Γεωμετρία',r.routeGeometry]]);
  if(d)out.push(section('Στοιχεία διαδρομής',d));
  if(r.evidence)out.push(section('Τεκμηρίωση',h('p',{class:'nb-quote',text:r.evidence})));
  if(r.note)out.push(section('Σημείωση',h('p',{text:r.note,style:'margin:0'})));
  out.push(h('p',{class:'nb-note',text:NON_PHYSICAL.has(r.type)?'Μη φυσική σύνδεση: η γραμμή δείχνει σχέση πληροφόρησης ή σχέδιο, όχι ταξίδι.':'Η γραμμή στον χάρτη είναι σχηματική και δεν ισχυρίζεται την ακριβή ιστορική πορεία.'}));
  out.push(h('div',{class:'nb-actions'},h('button',{type:'button',class:'nb-btn primary',onclick:()=>goRoute(r)},icon('fa-solid fa-route'),'Προβολή διαδρομής')));
  return out;
}
function placeItem(p){
  const cur=ui.sel?.kind==='place'&&ui.sel.id===p.id;
  return h('li',null,h('button',{type:'button',class:'nb-item'+(cur?' nb-current':''),onclick:()=>goPlace(p.id)},
    h('span',{class:'nb-item-ico'},icon(typeIcon(p.type))),
    h('span',{class:'nb-item-main'},h('div',{class:'nb-item-name',text:greekName(p)?greekName(p)+' · '+p.place:p.place}),h('div',{class:'nb-item-sub',text:[typeLabel(p.type),p.modernName].filter(Boolean).join(' · ')})),
    h('span',{class:'nb-item-aside',title:STATUS[p.coordinateStatus]?.[0]||''},h('span',{class:'nb-dot '+(STATUS[p.coordinateStatus]?.[1]||'')}))));
}
const placeList=list=>h('ul',{class:'nb-list'},...list.map(placeItem));
function routeItem(r){
  const pt=routePaint(r),dash=NON_PHYSICAL.has(r.type),cur=ui.sel?.kind==='route'&&ui.sel.id===r.id;
  return h('li',null,h('button',{type:'button',class:'nb-item'+(cur?' nb-current':''),onclick:()=>goRoute(r)},
    h('span',{class:'nb-item-ico'},icon('fa-solid '+((MEDIUM[r.medium]||[])[1]||'fa-route'))),
    h('span',{class:'nb-item-main'},h('div',{class:'nb-item-name',text:r.name}),h('div',{class:'nb-item-sub',text:[r.character,r.period].filter(Boolean).join(' · ')})),
    h('span',{class:'nb-item-aside'},h('span',{class:'nb-swatch'+(dash?' dash':''),style:'--c:'+pt.color+';background-color:'+(dash?'transparent':pt.color)}))));
}
const routeList=list=>h('ul',{class:'nb-list'},...list.map(routeItem));
function relatedPlaces(r){
  const key=fold(String(r.modernName||r.place).split(/[(,]/)[0]);if(key.length<3)return [];
  return DATA.places.filter(x=>x.id!==r.id&&String(x.modernName||'').split(',').slice(1).some(part=>fold(part).replace(/\s*\(.*$/,'')===key));
}
function scopeToggle(){
  return h('div',{class:'nb-toolbar'},
    h('button',{type:'button',class:'nb-filter','aria-pressed':String(ui.scope==='filtered'),onclick:()=>{ui.scope='filtered';paint();}},'Ενεργό φίλτρο'),
    h('button',{type:'button',class:'nb-filter','aria-pressed':String(ui.scope==='all'),onclick:()=>{ui.scope='all';paint();}},'Όλες οι εγγραφές'));
}
function viewSettlements(){
  setHead('Γαζετέερ NABOU','Οικισμοί & τόποι');
  const base=ui.scope==='all'?DATA.places:placesInView();
  const counts={};for(const p of base)counts[p.type]=(counts[p.type]||0)+1;
  const types=Object.keys(counts).sort((a,b)=>counts[b]-counts[a]);
  if(ui.typeFilter!=='all'&&!counts[ui.typeFilter])ui.typeFilter='all';
  const chips=h('div',{class:'nb-toolbar'},h('button',{type:'button',class:'nb-filter','aria-pressed':String(ui.typeFilter==='all'),onclick:()=>{ui.typeFilter='all';paint();}},'Όλοι',h('span',{class:'n',text:base.length})),
    ...types.map(t=>h('button',{type:'button',class:'nb-filter','aria-pressed':String(ui.typeFilter===t),onclick:()=>{ui.typeFilter=t;paint();}},typeLabel(t),h('span',{class:'n',text:counts[t]}))));
  const q=fold(ui.settleQ);
  const list=base.filter(p=>(ui.typeFilter==='all'||p.type===ui.typeFilter)&&(!q||[p.place,p.historicalNames,p.modernName].some(v=>fold(v).includes(q))))
    .sort((a,b)=>String(greekName(a)||a.place).localeCompare(String(greekName(b)||b.place),'el'));
  const input=h('input',{class:'nb-input',type:'search',placeholder:'Φιλτράρισμα λίστας…','aria-label':'Φιλτράρισμα οικισμών',value:ui.settleQ});
  input.addEventListener('input',()=>{ui.settleQ=input.value;const l=dockBody.querySelector('#nbSettleList');const n=viewSettlementsList();l.replaceWith(n);});
  viewSettlementsList.base=()=>list;
  return [scopeToggle(),chips,input,h('p',{class:'nb-meta',text:filterLine()+' · '+list.length+' εγγραφές'}),viewSettlementsList(list)];
}
function viewSettlementsList(list){
  if(!list){const base=ui.scope==='all'?DATA.places:placesInView();const q=fold(ui.settleQ);
    list=base.filter(p=>(ui.typeFilter==='all'||p.type===ui.typeFilter)&&(!q||[p.place,p.historicalNames,p.modernName].some(v=>fold(v).includes(q))))
      .sort((a,b)=>String(greekName(a)||a.place).localeCompare(String(greekName(b)||b.place),'el'));}
  const l=list.length?placeList(list):empty('fa-regular fa-folder-open','Καμία εγγραφή με αυτά τα κριτήρια.');l.id='nbSettleList';return l;
}
function viewMonuments(){
  setHead('Οχυρώσεις & σημεία','Μνημεία');
  const forts=DATA.places.filter(p=>p.type==='Fortress');
  const within=DATA.places.map(p=>[p,relatedPlaces(p)]).filter(([,l])=>l.length);
  const out=[h('p',{class:'nb-note',style:'margin-top:0',text:'Τα δεδομένα NABOU δεν έχουν ξεχωριστή κατηγορία μνημείων. Εμφανίζονται οι εγγραφές τύπου «Οχυρό» και τα σημεία που ανήκουν σε μεγαλύτερο τόπο. Δεν προστίθεται κανένα σημείο.'})];
  out.push(section('Οχυρά',forts.length?placeList(forts):empty('fa-regular fa-folder-open','Δεν υπάρχουν ακόμα επαληθευμένα σημεία.')));
  for(const [p,l] of within)out.push(section('Μέσα σε: '+(greekName(p)||p.place),placeList(l)));
  return out;
}
function peopleIndex(){
  const m=new Map();
  const add=(n,kind,x)=>{if(!m.has(n))m.set(n,{name:n,places:[],routes:[]});m.get(n)[kind].push(x);};
  for(const p of DATA.places)for(const n of people(p.characters))add(n,'places',p);
  for(const r of DATA.routes)for(const n of people(r.character))add(n,'routes',r);
  return [...m.values()].sort((a,b)=>(b.places.length+b.routes.length)-(a.places.length+a.routes.length)||a.name.localeCompare(b.name));
}
function viewPeople(){
  setHead('Ιστορικά & αφηγηματικά πρόσωπα','Πρόσωπα');
  const all=peopleIndex(),q=fold(ui.peopleQ);
  const list=all.filter(x=>!q||fold(x.name).includes(q));
  const input=h('input',{class:'nb-input',type:'search',placeholder:'Αναζήτηση προσώπου…','aria-label':'Αναζήτηση προσώπου',value:ui.peopleQ});
  input.addEventListener('input',()=>{ui.peopleQ=input.value;clearTimeout(viewPeople.t);viewPeople.t=setTimeout(()=>{paint();const i=dockBody.querySelector('input');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length);}},180);});
  const cards=list.map(x=>{
    const ini=x.name.replace(/[^\p{L}\s]/gu,'').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'·';
    const d=h('details',{class:'nb-person-card',open:ui.personOpen===x.name},
      h('summary',null,h('span',{class:'nb-avatar',text:ini}),h('span',{class:'nb-item-main'},h('div',{class:'nb-item-name',text:x.name}),
        h('div',{class:'nb-item-sub',text:[x.places.length?x.places.length+' τόποι':'',x.routes.length?x.routes.length+' διαδρομές':''].filter(Boolean).join(' · ')}))),
      h('div',{class:'nb-person-body'},x.places.length?placeList(x.places):null,x.routes.length?routeList(x.routes):null));
    d.addEventListener('toggle',()=>{if(d.open)ui.personOpen=x.name;});
    return d;});
  const out=[input,h('p',{class:'nb-meta',text:list.length+' πρόσωπα όπως καταγράφονται στα πεδία «characters» των εγγραφών'})];
  out.push(...(cards.length?cards:[empty('fa-regular fa-user','Κανένα πρόσωπο δεν ταιριάζει.')]));
  if(ui.personOpen)requestAnimationFrame(()=>dockBody.querySelector('.nb-person-card[open]')?.scrollIntoView({block:'nearest'}));
  return out;
}
function viewRoutes(){
  setHead('Ταξίδια, ανασυνθέσεις, δίκτυα','Διαδρομές');
  const base=ui.scope==='all'?DATA.routes:routesInView();
  const groups=new Map();for(const r of [...base].sort((a,b)=>(a.sequence??99)-(b.sequence??99)))(groups.get(r.type)||groups.set(r.type,[]).get(r.type)).push(r);
  const out=[scopeToggle(),h('p',{class:'nb-meta',text:filterLine()+' · '+base.length+' διαδρομές'})];
  for(const [t,list] of groups)out.push(h('div',{class:'nb-group-h'},h('span',{class:'nb-swatch'+(NON_PHYSICAL.has(t)?' dash':''),style:'--c:'+routePaint(list[0]).color+';background-color:'+(NON_PHYSICAL.has(t)?'transparent':routePaint(list[0]).color)}),ROUTE_TYPE[t]||t,h('span',{class:'n',text:'('+list.length+')'})),routeList(list));
  if(!base.length)out.push(empty('fa-solid fa-route','Καμία διαδρομή με το ενεργό φίλτρο.'));
  out.push(h('p',{class:'nb-note',text:'Οι γραμμές είναι σχηματικές· οι διαδρομές πληροφοριών και τα σχέδια που δεν εκτελέστηκαν φαίνονται διακριτά και δεν είναι φυσικά ταξίδια.'}));
  return out;
}
function viewSources(){
  setHead('Τεκμηρίωση εγγραφών','Ιστορικές πηγές');
  const q=fold(ui.sourcesQ);
  const items=[...DATA.places.filter(p=>p.sources).map(p=>({kind:'place',x:p,title:greekName(p)||p.place,text:p.sources})),
    ...DATA.routes.filter(r=>r.evidence).map(r=>({kind:'route',x:r,title:r.name,text:r.evidence}))]
    .filter(it=>!q||fold(it.title+' '+it.text).includes(q));
  const input=h('input',{class:'nb-input',type:'search',placeholder:'Αναζήτηση στις πηγές…','aria-label':'Αναζήτηση στις πηγές',value:ui.sourcesQ});
  input.addEventListener('input',()=>{ui.sourcesQ=input.value;clearTimeout(viewSources.t);viewSources.t=setTimeout(()=>{paint();const i=dockBody.querySelector('input');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length);}},180);});
  const out=[input,h('p',{class:'nb-meta',text:items.length+' τεκμηριωμένες εγγραφές (πεδία sources / evidence)'})];
  for(const it of items)out.push(h('div',{class:'nb-source'},h('div',{class:'nb-source-h'},
    h('span',{class:'nb-chip '+(it.kind==='place'?'cy':'')},icon(it.kind==='place'?typeIcon(it.x.type):'fa-solid fa-route'),it.kind==='place'?'Τόπος':'Διαδρομή'),
    h('button',{type:'button',text:it.title,onclick:()=>it.kind==='place'?goPlace(it.x.id):goRoute(it.x)})),h('p',{text:it.text})));
  if(!items.length)out.push(empty('fa-solid fa-scroll','Καμία πηγή δεν ταιριάζει.'));
  out.push(section('Προέλευση δεδομένων',dl([['Πηγή',DATA.generatedFrom],['Ημερομηνία',DATA.generatedAt],['Γεωμετρία',DATA.policy?.routeGeometry],['Κανόνας',DATA.routeGeometryRule]])));
  return out;
}

/* ───────── search ───────── */
const sInput=$('searchInput'),sBox=$('searchResults');let sItems=[],sHl=-1;
function highlight(text,q){
  const t=String(text||''),f=fold(t);const i=q?f.indexOf(q):-1;
  if(i<0)return [t];
  // fold() keeps one character per base letter for Greek/Latin, so indexes line up for these names.
  return [t.slice(0,i),h('mark',{text:t.slice(i,i+q.length)}),t.slice(i+q.length)];
}
function search(raw){
  if(!sBox)return;
  const q=fold(raw);
  if(!q||!ready()){sBox.classList.add('hidden');sBox.replaceChildren();sInput?.setAttribute('aria-expanded','false');sItems=[];return;}
  const score=p=>{const n=[p.place,greekName(p),p.historicalNames,p.modernName].map(fold);if(n.some(v=>v===q))return 0;if(n.some(v=>v.startsWith(q)))return 1;if(n.some(v=>v.includes(q)))return 2;if(fold(p.characters).includes(q))return 3;return 9;};
  const places=DATA.places.map(p=>[score(p),p]).filter(([s])=>s<9).sort((a,b)=>a[0]-b[0]).slice(0,9).map(([,p])=>p);
  const routes=DATA.routes.filter(r=>fold(r.name).includes(q)||fold(r.character).includes(q)).slice(0,4);
  sItems=[];const frag=[];
  if(places.length){frag.push(h('div',{class:'nb-sr-group',text:'Τόποι'}));
    for(const p of places){const i=sItems.length;sItems.push(()=>{goPlace(p.id);closeSearch();});
      const gr=greekName(p);
      frag.push(h('button',{type:'button',class:'nb-sr-item',role:'option',dataset:{i},onclick:()=>sItems[i]()},
        h('span',{class:'nb-sr-ico'},icon(typeIcon(p.type))),
        h('span',{class:'nb-sr-main'},h('div',{class:'nb-sr-name'},...highlight(gr&&fold(gr).includes(q)?gr:p.place,q)),
          h('div',{class:'nb-sr-sub',text:[gr&&!fold(gr).includes(q)?gr:p.place!==(gr||p.place)?p.place:'',typeLabel(p.type),p.modernName].filter(Boolean).join(' · ')})),
        h('span',{class:'nb-dot '+(STATUS[p.coordinateStatus]?.[1]||''),title:STATUS[p.coordinateStatus]?.[0]||''})));}}
  if(routes.length){frag.push(h('div',{class:'nb-sr-group',text:'Διαδρομές'}));
    for(const r of routes){const i=sItems.length;sItems.push(()=>{goRoute(r);closeSearch();});
      frag.push(h('button',{type:'button',class:'nb-sr-item',role:'option',dataset:{i},onclick:()=>sItems[i]()},
        h('span',{class:'nb-sr-ico'},icon('fa-solid fa-route')),h('span',{class:'nb-sr-main'},h('div',{class:'nb-sr-name'},...highlight(r.name,q)),h('div',{class:'nb-sr-sub',text:[r.character,r.period].filter(Boolean).join(' · ')}))));}}
  if(!sItems.length)frag.push(h('div',{class:'nb-sr-empty',text:'Δεν βρέθηκε τόπος στον γαζετέερ NABOU. Δεν γίνεται αυτόματη γεωκωδικοποίηση.'}));
  sBox.replaceChildren(...frag);sBox.classList.remove('hidden');sInput.setAttribute('aria-expanded','true');sHl=sItems.length?0:-1;paintHl();
}
function paintHl(){sBox.querySelectorAll('.nb-sr-item').forEach(b=>b.classList.toggle('nb-hl',+b.dataset.i===sHl));sBox.querySelector('.nb-hl')?.scrollIntoView({block:'nearest'});}
function closeSearch(){sBox.classList.add('hidden');sInput.setAttribute('aria-expanded','false');sInput.blur();}
if(sInput){
  let t=0;sInput.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(()=>search(sInput.value),90);});
  sInput.addEventListener('focus',()=>{if(sInput.value.trim())search(sInput.value);});
  sInput.addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'&&sItems.length){e.preventDefault();sHl=(sHl+1)%sItems.length;paintHl();}
    else if(e.key==='ArrowUp'&&sItems.length){e.preventDefault();sHl=(sHl-1+sItems.length)%sItems.length;paintHl();}
    else if(e.key==='Enter'){if(sHl>=0&&sItems[sHl]){e.preventDefault();sItems[sHl]();}}
    else if(e.key==='Escape'){sInput.value='';search('');sInput.blur();}
  });
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('.nb-search'))sBox.classList.add('hidden');});
}

/* ───────── timeline (book/year filters keep the atlas's own semantics) ───────── */
function applyFilter(){render();fitAll();afterFilter();}
function afterFilter(){
  document.querySelectorAll('.book-btn').forEach(x=>x.classList.toggle('active',x.dataset.book===state.book));
  buildTimeline();paint();markSelected();applyRouteFilter();
  const chip=$('nbPeriodChip'),t=$('nbPeriodText');
  if(t)t.textContent=state.year==='All'?'Όλες οι περίοδοι':'Έτος '+state.year;
  chip?.classList.toggle('nb-on',state.year!=='All');
}
function buildTimeline(){
  const track=$('nbTlTrack');if(!track||!ready())return;buildTimeline.done=true;
  const all=[...DATA.places.map(p=>p.period),...DATA.routes.map(r=>r.period)].flatMap(yearsIn);
  const years=[...new Set(all)].sort((a,b)=>a-b);if(!years.length){track.replaceChildren();return;}
  const lo=years[0]-1,hi=years[years.length-1]+1,pos=y=>((y-lo)/(hi-lo)*100).toFixed(2)+'%';
  const bh=x=>state.book==='All'||(x.books||[]).includes(state.book);
  const count=y=>DATA.places.filter(p=>bh(p)&&String(p.period||'').includes(String(y))).length+DATA.routes.filter(r=>bh(r)&&!r.atlasHidden&&String(r.period||'').includes(String(y))).length;
  const kids=[h('div',{class:'nb-tl-axis'}),
    h('button',{type:'button',class:'nb-tl-all'+(state.year==='All'?' active':''),onclick:()=>{state.year='All';applyFilter();}},'Όλα')];
  // Book bands: span of years in each book's records (display only).
  if(state.book!=='All'){const ys=[...DATA.places.filter(bh).map(p=>p.period),...DATA.routes.filter(bh).map(r=>r.period)].flatMap(yearsIn);
    if(ys.length){const a=Math.min(...ys),b=Math.max(...ys);kids.push(h('div',{class:'nb-tl-band',style:'left:'+pos(a)+';width:calc('+pos(b)+' - '+pos(a)+')',title:bookLabel(state.book)}));}}
  const counts=new Map(years.map(y=>[y,count(y)])),max=Math.max(1,...counts.values());
  const span=track.getBoundingClientRect().width||800,step=span/(hi-lo),w=Math.max(18,Math.min(40,step-3));
  for(const y of years){const n=counts.get(y),on=state.year===String(y);
    kids.push(h('button',{type:'button',class:'year-btn'+(on?' active':'')+(n?'':' dim'),style:'left:'+pos(y)+';width:'+w+'px',dataset:{year:String(y)},'aria-pressed':String(on),
      'aria-label':y+': '+n+' εγγραφές',title:y+' · '+n+' εγγραφές'+(state.book!=='All'?' στο '+bookLabel(state.book):''),onclick:()=>{state.year=on?'All':String(y);applyFilter();}},
      h('span',{class:'bar',style:'height:'+Math.round(3+15*n/max)+'px'}),h('span',{class:'y',text:step<30?String(y).slice(2):String(y)})));}
  track.replaceChildren(...kids);
  const P=placesInView(),R=routesInView();
  $('nbTlSummary').textContent=filterLine()+' · '+P.length+' τόποι · '+R.length+' διαδρομές';
}

new ResizeObserver(()=>{if(buildTimeline.done)buildTimeline();}).observe($('nbTlTrack'));

/* ───────── layers & filters ───────── */
function applyLayers(){
  const L=ui.layers;
  stage.classList.toggle('nb-hide-settlements',!L.settlements);stage.classList.toggle('nb-hide-labels',!L.labels);
  stage.classList.toggle('nb-hide-ships',!L.ships);stage.classList.toggle('nb-hide-morph',!L.morph);stage.classList.toggle('nb-mark-approx',L.approxMark);
  stage.classList.toggle('nb-hide-st-verified',!ui.status.VERIFIED);stage.classList.toggle('nb-hide-st-approximate',!ui.status.APPROXIMATE);
  stage.classList.toggle('nb-hide-st-needs',!ui.status['NEEDS RESEARCH']);
  if(mapReady()&&!embedded()){try{if(atlasMap.getLayer('atlas-routes'))atlasMap.setLayoutProperty('atlas-routes','visibility',L.routes?'visible':'none');}catch{}}
  applyRouteFilter();
}
function applyRouteFilter(){
  if(!mapReady()||!ui.routeTypes)return;
  const all=[...ui.routeTypes.values()].every(Boolean);
  const ids=DATA.routes.filter(r=>ui.routeTypes.get(r.type)!==false).map(r=>r.id);
  try{if(atlasMap.getLayer('atlas-routes'))atlasMap.setFilter('atlas-routes',all?null:['in',['get','id'],['literal',ids]]);}catch{}
}
function buildLayers(){
  const body=$('nbLayersBody');if(!body||!ready())return;
  if(!ui.routeTypes)ui.routeTypes=new Map([...new Set(DATA.routes.map(r=>r.type))].map(t=>[t,true]));
  const sw=(label,sub,checked,on,extra)=>{const i=h('input',{type:'checkbox',role:'switch'});i.checked=checked;i.addEventListener('change',()=>{on(i.checked);applyLayers();});
    return h('label',{class:'nb-switch'},i,h('span',null,label,sub?h('span',{class:'sub',text:sub}):null),extra||null);};
  const L=ui.layers;
  body.replaceChildren(
    h('h3',{class:'nb-section-h',text:'Στρώματα χάρτη'}),
    sw('Οικισμοί','Πόλεις, λιμάνια, χωριά',L.settlements,v=>L.settlements=v),
    sw('Τοπωνύμια','Νησιά, περιοχές, θάλασσες',L.labels,v=>L.labels=v),
    sw('Διαδρομές','Γραμμές ταξιδιών και δικτύων',L.routes,v=>L.routes=v),
    sw('Πλοία','Κινούμενα σκάφη στις θαλάσσιες διαδρομές',L.ships,v=>L.ships=v),
    sw('Σύμβολα ανάγλυφου','Βουνά, βράχοι, δάση (διακοσμητικά)',L.morph,v=>L.morph=v),
    h('h3',{class:'nb-section-h',style:'margin-top:14px',text:'Κατάσταση σημείων'}),
    ...Object.entries(STATUS).map(([k,[l,c]])=>sw(l,null,ui.status[k],v=>ui.status[k]=v,h('span',{class:'nb-dot '+c,style:'margin-left:auto'}))),
    sw('Σήμανση ≈ / ? στις ετικέτες','Για σημεία κατά προσέγγιση ή υπό έρευνα',L.approxMark,v=>L.approxMark=v),
    h('h3',{class:'nb-section-h',style:'margin-top:14px',text:'Τύποι διαδρομών'}),
    ...[...ui.routeTypes.keys()].map(t=>{const c=routePaint(DATA.routes.find(r=>r.type===t)).color,d=NON_PHYSICAL.has(t);
      return sw(ROUTE_TYPE[t]||t,null,ui.routeTypes.get(t),v=>ui.routeTypes.set(t,v),h('span',{class:'nb-swatch'+(d?' dash':''),style:'--c:'+c+';background-color:'+(d?'transparent':c)}));}),
    h('p',{class:'nb-note',text:'Τα φίλτρα κρύβουν ή δείχνουν ό,τι σχεδιάζει ήδη ο άτλαντας. Το τρισδιάστατο ανάγλυφο και οι θέσεις δεν αλλάζουν.'}));
}
function toggleLayers(force){
  const p=$('nbLayers'),b=$('nbLayersToggle'),open=force??p.hidden;
  p.hidden=!open;b.setAttribute('aria-expanded',String(open));if(open)buildLayers();
}

/* ───────── N7 handoff (existing n7-atlas-handoff/v1 entry of the N7 window) ───────── */
function n7Href(p){
  const base='https://bot.piratecartography.com/';
  if(!p)return base;
  let from=1500,to=1700;
  if(state.year!=='All'){from=to=+state.year;}
  else{const ys=yearsIn(p.period).filter(y=>y>=1500&&y<=1700);if(ys.length){from=Math.min(...ys);to=Math.max(...ys);}}
  const payload={schema:'n7-atlas-handoff/v1',place:String(greekName(p)||p.place).slice(0,100),from,to,sources:[]};
  return base+'#atlas='+encodeURIComponent(JSON.stringify(payload));
}
function updateN7Link(){
  const a=$('nbN7Link');if(!a)return;
  const p=ui.sel?.kind==='place'?placeById(ui.sel.id):null;
  a.href=n7Href(p);a.classList.toggle('nb-has-place',!!p);
  const t=p?'Ρώτησε τον N7 για: '+(greekName(p)||p.place):'Άνοιγμα του N7';a.dataset.tip=t;a.setAttribute('aria-label',t);
}

/* ───────── wiring ───────── */
buildTabs();
document.querySelectorAll('.nb-nc-btn[data-panel]').forEach(b=>b.addEventListener('click',()=>ui.panel===b.dataset.panel&&!dock.hidden?closeDock():openPanelView(b.dataset.panel)));
$('nbDockClose')?.addEventListener('click',closeDock);
$('nbLayersToggle')?.addEventListener('click',()=>toggleLayers());
document.querySelector('[data-close="layers"]')?.addEventListener('click',()=>toggleLayers(false));
$('nbTimelineToggle')?.addEventListener('click',e=>{const off=stage.classList.toggle('nb-tl-off');e.currentTarget.setAttribute('aria-pressed',String(!off));e.currentTarget.classList.toggle('nb-toggle-on',!off);});
$('nbTimelineToggle')?.classList.add('nb-toggle-on');
$('nbPeriodChip')?.addEventListener('click',()=>{stage.classList.remove('nb-tl-off');const b=$('nbTimelineToggle');b?.setAttribute('aria-pressed','true');b?.classList.add('nb-toggle-on');});
$('nbFitAll')?.addEventListener('click',()=>fitAll());
$('nbFullscreen')?.addEventListener('click',()=>{try{document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();}catch{}});
const app=$('nbApp'),exp=$('nbNeocomExpand');
function setExpanded(on){app.classList.toggle('nb-nc-expanded',on);exp.setAttribute('aria-expanded',String(on));exp.dataset.tip=on?'Σύμπτυξη μενού':'Ανάπτυξη μενού';
  try{localStorage.setItem('nabou.neocom',on?'1':'0');}catch{}setTimeout(()=>{try{atlasMap?.resize();}catch{}},260);}
exp?.addEventListener('click',()=>setExpanded(!app.classList.contains('nb-nc-expanded')));
try{if(localStorage.getItem('nabou.neocom')==='1'&&innerWidth>860)setExpanded(true);}catch{}
// The book buttons keep the atlas's own handler (state.book, render, fitAll); the interface follows.
document.querySelectorAll('.book-btn').forEach(b=>b.addEventListener('click',()=>afterFilter()));
document.addEventListener('keydown',e=>{
  if(embedded())return;
  const a=document.activeElement,typing=!!a&&(/^(TEXTAREA|SELECT)$/.test(a.tagName)||(a.tagName==='INPUT'&&!/^(checkbox|radio|button)$/.test(a.type)));
  if(e.key==='/'&&!typing){e.preventDefault();sInput?.focus();}
  else if(e.key==='Escape'&&!typing){if(!$('nbLayers').hidden)toggleLayers(false);else if(!dock.hidden)closeDock();}
});
// Markers are rebuilt by render(); keep the selection ring on the new elements.
new MutationObserver(()=>{if(ui.sel?.kind==='place'&&!document.querySelector('[data-nb-selected]'))markSelected();}).observe($('realMap'),{childList:true,subtree:true});

function onMapReady(){
  if(!embedded()){
    try{
      if(!atlasMap.getLayer('nb-route-focus')&&atlasMap.getSource('atlas-routes'))
        atlasMap.addLayer({id:'nb-route-focus',type:'line',source:'atlas-routes',filter:['==',['get','id'],''],layout:{'line-cap':'round','line-join':'round'},
          paint:{'line-color':'#4fd3e6','line-width':6,'line-opacity':.45,'line-blur':2}},'atlas-routes');
    }catch{}
  }
  applyLayers();markSelected();syncPadding();
  toast('Ο χάρτης φόρτωσε · '+DATA.places.length+' τόποι, '+DATA.routes.length+' διαδρομές',2200);
}
(function boot(n=0){
  if(ready()&&!boot.data){boot.data=true;afterFilter();updateN7Link();if(ui.panel)paint();}
  if(mapReady()){onMapReady();return;}
  if(n===40&&!embedded())toast('Φόρτωση χάρτη και ανάγλυφου…',0);
  if(n>600){if(!embedded())toast('Ο χάρτης δεν φόρτωσε. Έλεγξε τη σύνδεση και ανανέωσε τη σελίδα.',0);return;}
  setTimeout(()=>boot(n+1),100);
})();

window.NabouUI={
  showPlace:selectPlace,showRoute:selectRoute,open:()=>openPanelView(ui.panel||'history'),close:closeDock,search,
  panel:openPanelView,get selection(){return ui.sel?{...ui.sel}:null}
};
})();
