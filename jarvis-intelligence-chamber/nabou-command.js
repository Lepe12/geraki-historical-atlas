/* NABOU_COMMAND_V1 — command interface for the NABOU atlas (Neocom rail, top-bar filters, tabbed right
   dock, data-driven timeline) layered over the existing chart. It never edits the locked renderers
   (chamber.js, nautical-chart.js, gpu-field.js, map-3d*.js): the 3D chart is driven only through
   window.NABOU_MAP3D, the reference places through window.NABOU_PRO_ATLAS, the period through the
   existing timeline inputs. GERAKI records (../data.json) are shown at their STORED coordinates; nothing is
   geocoded, added or inferred, and missing fields stay unavailable. Inactive inside the N7 embed. */
(() => {
 'use strict';
 if(window.N7_EMBED||document.documentElement.classList.contains('n7-embed'))return;
 const $=id=>document.getElementById(id),body=document.body,shell=$('n7Shell'),C=window.NABOU_CHART;
 const plane=$('chartPlane'),view=$('chartView');
 if(!shell||!C||!plane||$('nbcDock'))return;
 body.classList.add('nbc-on');
 const NS='http://www.w3.org/2000/svg';
 function h(tag,attrs,...kids){const e=document.createElement(tag);
  if(attrs)for(const [k,v] of Object.entries(attrs)){if(v==null||v===false)continue;
   if(k==='class')e.className=v;else if(k==='text')e.textContent=v;else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);
   else if(k==='dataset')Object.assign(e.dataset,v);else e.setAttribute(k,v===true?'':v);}
  for(const c of kids.flat()){if(c==null||c===false)continue;e.append(c instanceof Node?c:document.createTextNode(String(c)));}return e;}
 const ico=(d,cls='')=>{const s=document.createElementNS(NS,'svg');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('aria-hidden','true');s.setAttribute('class','n7-ico nbc-ico '+cls);s.innerHTML=d;return s;};
 const I={
  history:'<path d="M4 19.5V5a2 2 0 0 1 2-2h12v15H6a2 2 0 0 0-2 2z"/><path d="M8 7h6M8 11h6"/>',
  towns:'<path d="M3 21V11l4-3 4 3v10M11 21V7l5-4 5 4v14M3 21h18"/><path d="M14 10h4M14 14h4"/>',
  monuments:'<path d="M5 21V9h14v12M3 21h18M5 9V5h3v2h3V5h2v2h3V5h3v4"/><path d="M10 21v-5h4v5"/>',
  people:'<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.8-3.6 3.2-5.5 6-5.5s5.2 1.9 6 5.5"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.6c2.6.2 4.3 2 5 5"/>',
  sources:'<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/>',
  routes:'<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8 17c6-1 3-8 8-10" stroke-dasharray="2.5 2.5"/>',
  layers:'<path d="M12 3l9 4.5-9 4.5-9-4.5z"/><path d="M3 12l9 4.5 9-4.5"/><path d="M3 16.5l9 4.5 9-4.5"/>',
  time:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
  cube:'<path d="M12 3 20 7.5v9L12 21 4 16.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  full:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  focus:'<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  close:'<path d="M6 6l12 12M18 6 6 18"/>',
  bases:'<path d="M6 21V3"/><path d="M6 4h11l-2.5 4L17 12H6"/>'};
 const fold=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLocaleLowerCase('el').replace(/ς/g,'σ').trim();
 const txt=v=>Array.isArray(v)?v.join(', '):String(v??'').trim();
 const yearsIn=s=>[...String(s||'').matchAll(/\b(1[5-6]\d\d)\b/g)].map(m=>+m[1]);
 const people=s=>String(s||'').split(';').map(x=>x.trim()).filter(Boolean);
 const greek=p=>String(p?.historicalNames||'').split('/').map(x=>x.trim()).find(x=>/[Ͱ-Ͽ]/.test(x))||'';
 const nameOf=p=>greek(p)||p.place;
 const TYPE={City:'Πόλη',Port:'Λιμάνι',Island:'Νησί',Fortress:'Οχυρό',Region:'Περιοχή',Village:'Χωριό','Sea / Strait':'Θάλασσα / πορθμός'};
 const STATUS={VERIFIED:['Επαληθευμένο σημείο','ok'],APPROXIMATE:['Σημείο κατά προσέγγιση','warn'],'NEEDS RESEARCH':['Χρειάζεται έρευνα','risk']};
 const RTYPE={'DEPICTED TRAVEL':'Αποτυπωμένο ταξίδι','STRONG RECONSTRUCTION':'Ισχυρή ανασύνθεση','INTELLIGENCE / NETWORK':'Δίκτυο πληροφοριών (μη φυσική)','PLANNED — NOT EXECUTED':'Σχεδιασμένο — δεν εκτελέστηκε'};
 const NONPHYS=new Set(['INTELLIGENCE / NETWORK','PLANNED — NOT EXECUTED']);
 const RCOLOR={'DEPICTED TRAVEL':'#f1dfb4','STRONG RECONSTRUCTION':'#d8c08a','INTELLIGENCE / NETWORK':'#7fd6e6','PLANNED — NOT EXECUTED':'#c99f6a'};
 const LABEL_ONLY=new Set(['sea-label','region-label','island-label']);
 const ICON={village:'atlas-village.svg','coastal-village':'atlas-coastal-village.svg',town:'atlas-town.svg',city:'atlas-city.svg',capital:'atlas-city.svg',port:'atlas-port.svg',fortress:'atlas-fortress.svg'};
 const bookLabel=b=>String(b).replace(/^Book /,'Βιβλίο ');
 const atlas=()=>window.NABOU_PRO_ATLAS,M3=()=>window.NABOU_MAP3D,reader=()=>window.N7_READER;

 let DATA={places:[],routes:[]},byId=new Map(),linked=new Map(),proToRec=new Map();
 let BASES={bases:[]},baseById=new Map(),EVENTS={events:[]},THESIS={};
 /* ───── pirate bases (M. Gourgourini, thesis 2024 · ArcGIS layers): flag symbols of the thesis legend ─────
    red flag = Christian base, green = Muslim; grey pole = 16th c., black = 17th; a base whose faith changes
    between the centuries shows both colours (16th c. half at the pole). */
 const FAITH={christian:['Χριστιανικό','#c8322d'],muslim:['Μουσουλμανικό','#2f8f4e']};
 const CENT={'16':'16ος αι.','17':'17ος αι.'};
 const baseFaiths=b=>{const f={};for(const [c,l] of Object.entries(b.centuries))f[c]=l[0]?.faith;return f;};
 // A cloth flag on a turned pole (thesis code: red Christian, green Muslim; grey pole 16th c., black 17th c.).
 let flagN=0;
 function flagArt(left,right,c16,c17,size){const pole=c16&&c17?'#2b2b2b':c16?'#9b9b9b':'#151515',g='nbcfg'+(++flagN);
  const s=document.createElementNS(NS,'svg');s.setAttribute('viewBox','0 0 26 30');s.setAttribute('width',size);s.setAttribute('height',Math.round(size*30/26));s.setAttribute('aria-hidden','true');s.setAttribute('class','nbc-flag');
  const cloth='M5.4 4.6C9 1.6 12 7.2 15.6 4.8S21.6 2 25.4 4.4L22.4 9.6 25.4 14.8C21.6 12.4 19 17.4 15.6 15S9 12.6 5.4 15.4Z';
  s.innerHTML=`<defs><linearGradient id="${g}" x1="5" x2="25.5" y1="0" y2="0" gradientUnits="userSpaceOnUse">`
   +`<stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".2" stop-color="#fff" stop-opacity=".05"/><stop offset=".38" stop-color="#000" stop-opacity=".32"/>`
   +`<stop offset=".55" stop-color="#fff" stop-opacity=".2"/><stop offset=".74" stop-color="#000" stop-opacity=".3"/><stop offset=".9" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></linearGradient></defs>`
   +`<path d="${cloth}" fill="${right}"/>`
   +`<path d="M5.4 4.6C9 1.6 12 7.2 15.6 4.8V15C12 12.6 9 12.6 5.4 15.4Z" fill="${left}"/>`
   +`<path d="${cloth}" fill="url(#${g})"/>`
   +`<path d="${cloth}" fill="none" stroke="#1a120a" stroke-width=".7" stroke-linejoin="round" opacity=".8"/>`
   +`<rect x="3.1" y="3" width="2.4" height="26" rx="1.1" fill="${pole}"/>${c16&&c17?'<rect x="3.1" y="3" width="2.4" height="10" rx="1.1" fill="#9b9b9b"/>':''}`
   +`<rect x="3.6" y="3.4" width=".7" height="25" rx=".35" fill="#fff" opacity=".3"/>`
   +`<circle cx="4.3" cy="2.4" r="1.8" fill="#c9a24e" stroke="#4a3216" stroke-width=".6"/><circle cx="3.7" cy="1.8" r=".55" fill="#fff4cc" opacity=".85"/>`;return s;}
 function flagSvg(b,size=26){const f=baseFaiths(b),c16=f['16'],c17=f['17'];return flagArt(FAITH[c16||c17][1],FAITH[c17||c16][1],c16,c17,size);}
 const baseName=b=>b.port&&b.port!==b.area?b.port+' · '+b.area:b.area;
 function baseVisible(b){const {from,to}=period(),f=baseFaiths(b);
  return Object.entries(f).some(([c,fa])=>(c==='16'?from<=1599:to>=1600)&&ui.layers[fa]!==false&&(ui.century==='all'||ui.century===c)&&(ui.faith==='all'||ui.faith===fa));}

 const ui={tab:'history',rec:null,pro:null,base:null,faith:'all',century:'all',book:'All',typeFilter:'all',q:{towns:'',people:'',sources:'',bases:''},personOpen:null,
  layers:{towns:true,labels:true,routes:true,christian:true,muslim:true,powers:true,bvroutes:true,bvpoints:true},status:{VERIFIED:true,APPROXIMATE:true,'NEEDS RESEARCH':true},rtypes:new Map()};

 /* ───── period: the existing timeline inputs are the single source of truth ───── */
 const rangeInputs=()=>[...document.querySelectorAll('#n7TimelineRange input[type=range]')];
 function period(){const r=rangeInputs().map(i=>+i.value);return r.length===2?{from:Math.min(...r),to:Math.max(...r)}:{from:1500,to:1700};}
 function setPeriod(from,to){const [a,b]=rangeInputs();if(!a||!b)return;
  // Same order as a user drag, so professional-atlas.js keeps from <= to and updates the label.
  b.value=String(Math.max(+a.value,to));b.dispatchEvent(new Event('input',{bubbles:true}));
  a.value=String(from);a.dispatchEvent(new Event('input',{bubbles:true}));
  b.value=String(to);b.dispatchEvent(new Event('input',{bubbles:true}));}
 const bookHit=x=>ui.book==='All'||(x.books||[]).includes(ui.book);
 function yearHit(x){const {from,to}=period();if(from<=1500&&to>=1700)return true;const ys=yearsIn(x.period);return !ys.length||ys.some(y=>y>=from&&y<=to)||(Math.min(...ys)<=from&&Math.max(...ys)>=to);}
 const visible=x=>bookHit(x)&&yearHit(x);
 const filterLine=()=>{const {from,to}=period(),p=[];if(ui.book!=='All')p.push(bookLabel(ui.book));p.push(from+'–'+to);return p.join(' · ');};

 /* ───── Neocom (left rail) ───── */
 const nav=shell.querySelector('.n7-nav'),spacer=nav?.querySelector('.n7-nav-spacer');
 const PANELS=[['bases','Πειρατικά ορμητήρια',I.bases],['history','Ιστορία τόπου',I.history],['towns','Οικισμοί',I.towns],['monuments','Μνημεία & οχυρά',I.monuments],['people','Πρόσωπα',I.people],['routes','Διαδρομές',I.routes],['sources','Ιστορικές πηγές',I.sources]];
 if(nav){
  for(const b of nav.querySelectorAll(':scope>button,:scope>a')){const l=b.querySelector('span')?.textContent?.trim();if(l)b.dataset.tip=l;}
  const lib=nav.querySelector('[data-atlas-nav="sources"]');if(lib){lib.querySelector('span').textContent='Βιβλιοθήκη';lib.dataset.tip='Βιβλιοθήκη πηγών';}
  const sep=h('i',{class:'nbc-nc-sep','aria-hidden':'true'});nav.insertBefore(sep,spacer);
  for(const [id,label,d] of PANELS){const b=h('button',{type:'button',class:'nbc-nc',dataset:{nbcPanel:id,tip:label},'aria-label':label},ico(d),h('span',{text:label}));nav.insertBefore(b,spacer);}
  nav.insertBefore(h('i',{class:'nbc-nc-sep','aria-hidden':'true'}),spacer);
  for(const what of ['layers','timeline']){const b=nav.querySelector(`[data-n7-nav="${what}"]`);if(b){b.hidden=false;b.dataset.tip=what==='layers'?'Στρώματα & φίλτρα':'Χρονολόγιο';nav.insertBefore(b,spacer);}}
  nav.addEventListener('click',e=>{const b=e.target.closest('[data-nbc-panel]');if(!b)return;
   if(body.dataset.readerView&&body.dataset.readerView!=='map')reader()?.show('map',{focus:false});openTab(b.dataset.nbcPanel);});
  // Thin rail by default (labels on demand, remembered); the existing collapse button toggles it.
  let wantOpen=false;try{wantOpen=localStorage.getItem('nbc.nav')==='open';}catch{}
  const col=nav.querySelector('[data-n7-nav="collapse"]');
  if(!wantOpen&&col&&shell.dataset.nav!=='collapsed')col.click();
  col?.addEventListener('click',()=>{try{localStorage.setItem('nbc.nav',shell.dataset.nav==='collapsed'?'closed':'open');}catch{}});
 }

 /* ───── top bar: book filter, period, 3D, fullscreen ───── */
 const top=shell.querySelector('.n7-top'),actions=top?.querySelector('.n7-top-actions');
 const periodChip=h('button',{type:'button',class:'nbc-chip',id:'nbcPeriod',title:'Ενεργή περίοδος · πάτα για το χρονολόγιο'},ico(I.time),h('span',{id:'nbcPeriodText',text:'1500–1700'}));
 periodChip.addEventListener('click',()=>rangeInputs()[0]?.focus());
 const seg=h('div',{class:'nbc-seg',role:'group','aria-label':'Βιβλίο'},...[['All','Όλα'],['Book I','I'],['Book II','II'],['Book III','III']].map(([v,l])=>
  h('button',{type:'button',dataset:{book:v},'aria-pressed':String(v==='All'),title:v==='All'?'Όλα τα βιβλία':bookLabel(v),onclick:()=>{ui.book=v;refresh();}},l)));
 const t3d=h('button',{type:'button',class:'nbc-tool',id:'nbc3d','aria-pressed':'false',title:'Τρισδιάστατος χάρτης με ανάγλυφο',onclick:()=>$('map3dToggle')?.click()},ico(I.cube),h('b',{text:'3D'}));
 const tFull=h('button',{type:'button',class:'nbc-tool',title:'Πλήρης οθόνη','aria-label':'Πλήρης οθόνη',onclick:()=>{try{document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();}catch{}}},ico(I.full));
 if(actions)actions.before(h('div',{class:'nbc-topctl'},h('span',{class:'nbc-lbl',text:'Βιβλίο'}),seg,periodChip,t3d,tFull));
 const sync3d=()=>{const on=!!M3()?.enabled;t3d.setAttribute('aria-pressed',String(on));t3d.querySelector('b').textContent=on?'2D':'3D';t3d.title=on?'Επιστροφή στον επίπεδο χάρτη':'Τρισδιάστατος χάρτης με ανάγλυφο';body.classList.toggle('nbc-3d',on);};
 addEventListener('nabou:map3d',()=>{sync3d();if(M3()?.enabled)mount3d();});
 if(!M3()?.supported)t3d.disabled=true;

 /* ───── right dock (tabs) — the existing place card lives in the «Ιστορία» tab ───── */
 const card=$('proPlaceInfo');
 const dock=h('aside',{id:'nbcDock',class:'n7-place nbc-dock','aria-label':'Πληροφορίες άτλαντα'});
 const tabs=h('div',{class:'nbc-tabs',role:'tablist','aria-label':'Ενότητες'});
 const dhead=h('div',{class:'nbc-dhead'},h('div',{class:'nbc-kicker',id:'nbcKicker'}),h('button',{type:'button',class:'nbc-x','aria-label':'Κλείσιμο πάνελ',onclick:()=>{card.hidden=true;}},ico(I.close)));
 const dbody=h('div',{class:'nbc-dbody',id:'nbcBody',role:'tabpanel','aria-live':'polite'});
 const recBox=h('section',{class:'nbc-rec',id:'nbcRecord'});
 for(const [id,label,d] of PANELS)tabs.append(h('button',{type:'button',class:'nbc-tab',role:'tab','aria-selected':'false',dataset:{tab:id},title:label,'aria-label':label,onclick:()=>openTab(id)},ico(d),h('span',{text:label.split(' ')[0]})));
 dock.append(tabs,dhead,dbody);
 if(card){card.before(dock);dbody.append(recBox,card);}
 const syncDock=()=>{dock.hidden=!!card?.hidden;};
 if(card)new MutationObserver(syncDock).observe(card,{attributes:true,attributeFilter:['hidden']});syncDock();
 function openTab(id,{show=true}={}){ui.tab=id;if(card&&show)card.hidden=false;paint();
  for(const b of tabs.children)b.setAttribute('aria-selected',String(b.dataset.tab===id));
  for(const b of nav?.querySelectorAll('[data-nbc-panel]')||[])b.setAttribute('aria-current',b.dataset.nbcPanel===id&&!card?.hidden?'true':'false');}
 if(card)new MutationObserver(()=>{for(const b of nav?.querySelectorAll('[data-nbc-panel]')||[])b.setAttribute('aria-current',b.dataset.nbcPanel===ui.tab&&!card.hidden?'true':'false');}).observe(card,{attributes:true,attributeFilter:['hidden']});

 const empty=t=>h('p',{class:'nbc-empty',text:t});
 const sect=(t,...k)=>h('section',{class:'nbc-sect'},h('h4',{text:t}),...k);
 function dl(rows){const d=h('dl',{class:'nbc-dl'});let n=0;for(const [k,v] of rows){const isN=v instanceof Node,t=isN?v:txt(v);if(!isN&&!t)continue;d.append(h('dt',{text:k}),h('dd',null,t));n++;}return n?d:null;}
 const chip=(t,c='')=>h('span',{class:'nbc-pill '+c,text:t});
 const stChip=s=>{const [l,c]=STATUS[s]||[s||'—',''];return h('span',{class:'nbc-pill '+c},h('i',{class:'nbc-dot '+c}),l);};

 function paint(){
  const keep=dbody.scrollTop,same=paint.last===ui.tab;paint.last=ui.tab;
  const showCard=ui.tab==='history'&&!ui.base&&!ui.power&&!ui.bv&&(ui.pro||!ui.rec);
  card?.classList.toggle('nbc-off',!showCard);
  let kicker='',nodes=[];
  if(ui.tab==='history'){kicker='Ιστορία τόπου';const bvi=ui.bv&&BVById.get(ui.bv);if(bvi&&!ui.base&&!ui.rec&&!ui.pro&&!ui.power){nodes=bvView(bvi);kicker='Μπελαβίλας 1992';}const pw=ui.power&&POWERS.find(x=>x.id===ui.power);if(nodes.length){}else if(pw&&!ui.base&&!ui.rec&&!ui.pro){nodes=powerView(pw);}else{ui.power=null;}const bs=!nodes.length&&ui.base&&baseById.get(ui.base);const r=ui.rec&&byId.get(ui.rec);if(!nodes.length)nodes=bs?baseView(bs):r?recordView(r):[];}
  else if(ui.tab==='bases'){kicker='Πειρατικά ορμητήρια · '+filterLine();nodes=basesView();}
  else if(ui.tab==='towns'){kicker='Οικισμοί · '+filterLine();nodes=townsView();}
  else if(ui.tab==='monuments'){kicker='Μνημεία & οχυρά';nodes=monumentsView();}
  else if(ui.tab==='people'){kicker='Πρόσωπα';nodes=peopleView();}
  else if(ui.tab==='routes'){kicker='Διαδρομές · '+filterLine();nodes=routesView();}
  else if(ui.tab==='sources'){kicker='Ιστορικές πηγές';nodes=sourcesView();}
  if(!DATA.places.length&&!['history','bases'].includes(ui.tab))nodes=[empty('Φόρτωση εγγραφών GERAKI…')];
  if(ui.tab==='bases'&&!BASES.bases.length)nodes=[empty('Φόρτωση ορμητηρίων…')];
  $('nbcKicker').textContent=kicker;recBox.replaceChildren(...nodes);recBox.hidden=!nodes.length;
  dbody.scrollTop=same?keep:0;
 }
 function recordView(p){
  const g=greek(p),out=[];
  out.push(h('div',{class:'nbc-card'},h('div',{class:'nbc-type',text:(TYPE[p.type]||p.type||'Τόπος')+' · εγγραφή GERAKI'}),
   h('h3',{class:'nbc-name',text:g||p.place}),
   h('p',{class:'nbc-alt',text:[g?p.place:p.historicalNames,p.modernName?'σήμερα '+p.modernName:''].filter(Boolean).join(' · ')}),
   h('div',{class:'nbc-pills'},stChip(p.coordinateStatus),...(p.books||[]).map(b=>chip(bookLabel(b),'cy')))));
  const lead=p.historicalContext||p.trilogyRole;if(lead)out.push(h('p',{class:'nbc-lead',text:lead}));
  const ppl=people(p.characters);
  const pn=ppl.length?h('div',{class:'nbc-names'},...ppl.map(n=>h('button',{type:'button',text:n,onclick:()=>{ui.personOpen=n;openTab('people');}}))):'';
  const d=dl([['Περίοδος',p.period],['Ρόλος',p.historicalContext?p.trilogyRole:''],['Εξουσία',p.authority],['Πρόσωπα',pn],['Κατάσταση',p.historicalStatus]]);if(d)out.push(sect('Ιστορικά στοιχεία',d));
  if(p.sources)out.push(sect('Πηγές',h('blockquote',{class:'nbc-quote',text:p.sources})));
  const geo=dl([['Σημείο',STATUS[p.coordinateStatus]?.[0]||p.coordinateStatus],['Συντεταγμένες',Number.isFinite(p.lat)?p.lat.toFixed(4)+'° Β · '+p.lon.toFixed(4)+'° Α':''],['Σημείωση',p.notes]]);if(geo)out.push(sect('Γεωγραφία',geo));
  const rr=DATA.routes.filter(r=>[...(r.from||[]),...(r.to||[])].some(x=>x.id===p.id));if(rr.length)out.push(sect('Διαδρομές',routeList(rr)));
  const miss=[['historicalContext','ιστορικό πλαίσιο'],['sources','πηγές'],['authority','εξουσία'],['characters','πρόσωπα']].filter(([k])=>!txt(p[k])).map(([,l])=>l);
  if(miss.length)out.push(h('p',{class:'nbc-miss',text:'Δεν έχουν καταχωριστεί: '+miss.join(', ')+'.'}));
  out.push(h('div',{class:'nbc-actions'},h('button',{type:'button',class:'nbc-btn primary',onclick:()=>focusRec(p.id)},ico(I.focus),'Εστίαση στον χάρτη'),
   h('a',{class:'nbc-btn',href:n7Href(p),target:'_blank',rel:'noopener noreferrer'},h('b',{text:'N7'}),'Ρώτησε τον N7')));
  if(linked.get(p.id))out.push(h('p',{class:'nbc-miss',text:'Πιο κάτω: η κάρτα του τόπου με τα ευρήματα της έρευνας N7.'}));
  return out;
 }
 function baseView(b){const out=[];
  out.push(h('div',{class:'nbc-card'},h('div',{class:'nbc-type'},flagSvg(b,16),' Πειρατικό ορμητήριο'),h('h3',{class:'nbc-name',text:b.port||b.area}),
   h('p',{class:'nbc-alt',text:b.port&&b.port!==b.area?b.area:''}),
   h('div',{class:'nbc-pills'},...Object.entries(baseFaiths(b)).map(([c,fa])=>h('span',{class:'nbc-pill',style:'border-color:'+FAITH[fa][1]+'99;color:#f0e6d4;background:'+FAITH[fa][1]+'33'},CENT[c]+' · '+FAITH[fa][0])),stChip(b.coordinateStatus))));
  {const rs=ruleSect(b);if(rs)out.push(rs);}
  {const cs=(BV.cites||[]).filter(c=>c.area===b.area);if(cs.length)out.push(sect('Και στον Μπελαβίλα (1992)',...cs.map(c=>h('div',{class:'nbc-ev th context'},h('div',{class:'nbc-ev-h'},h('b',{class:'nbc-ev-y',text:'σελ. '+c.pages}),h('span',{text:'Πειρατικό καταφύγιο / ενέδρα'})),h('p',{text:c.text}),h('small',{class:'nbc-ev-src',text:BV.source?.cite||''})))));}
  for(const [c,list] of Object.entries(b.centuries))for(const e of list){
   const d=dl([['Πειρατές',e.pirates],['Είδος θέσης',e.siteType],['Λεπτομέρειες',e.details]]);
   out.push(sect(CENT[c]+' · '+FAITH[e.faith][0]+' ορμητήριο',d||empty('Χωρίς επιπλέον στοιχεία στη βάση.'),e.link?h('a',{class:'nbc-btn',style:'margin-top:8px',href:e.link,target:'_blank',rel:'noopener noreferrer'},'Άρθρο στο piratecartography.com ↗'):null));}
  out.push(sect('Πηγή',h('p',{class:'nbc-miss',style:'margin:0',text:BASES.source?.thesis||''}),
   h('div',{class:'nbc-actions'},h('a',{class:'nbc-btn',href:BASES.source?.map,target:'_blank',rel:'noopener noreferrer'},'Χάρτης ArcGIS ↗'),h('a',{class:'nbc-btn',href:BASES.source?.repository,target:'_blank',rel:'noopener noreferrer'},'Διατριβή ↗')),
   h('p',{class:'nbc-miss',text:BASES.coordinateNote||''})));
  const evs=EVENTS.events.filter(e=>e.area===b.area);
  if(evs.length)out.push(sect('Πειρατές & γεγονότα · '+b.area,...evs.sort((a,c)=>(a.years[0]||9999)-(c.years[0]||9999)).map(eventItem)));
  const near=DATA.places.filter(p=>Number.isFinite(p.lat)&&Math.hypot((p.lon-b.lon)*Math.cos(b.lat*Math.PI/180),p.lat-b.lat)<.12);
  if(near.length)out.push(sect('Εγγραφές GERAKI εδώ',placeList(near)));
  out.push(h('div',{class:'nbc-actions'},h('button',{type:'button',class:'nbc-btn primary',onclick:()=>focusAt(b.lon,b.lat)},ico(I.focus),'Εστίαση στον χάρτη'),
   h('a',{class:'nbc-btn',href:baseN7(b),target:'_blank',rel:'noopener noreferrer'},h('b',{text:'N7'}),'Ρώτησε τον N7')));
  return out;}
 const KIND={raid:'Επιδρομή / επίθεση',control:'Αλλαγή κυριαρχίας',context:'Πλαίσιο'};
 function eventItem(e){const th=!!e.page;
  const src=th?h('a',{href:THESIS.repository,target:'_blank',rel:'noopener noreferrer',class:'nbc-ev-src',text:'Διατριβή, σελ. '+e.page+(e.cites?.length?' · '+e.cites.join('; '):'')+' ↗'})
   :e.source?h('a',{href:e.source,target:'_blank',rel:'noopener noreferrer',class:'nbc-ev-src',text:'piratecartography.com · '+e.area+' ↗'}):h('small',{class:'nbc-ev-src',text:'Πρόχειρη σελίδα του site (αδημοσίευτη)'});
  const yrs=e.years.length>4?e.years.slice(0,3).join(', ')+' … '+e.years[e.years.length-1]:e.years.join(', ');
  return h('div',{class:'nbc-ev'+(th?' th '+e.kind:'')},h('div',{class:'nbc-ev-h'},h('b',{class:'nbc-ev-y',text:e.years.length?yrs:'χωρίς έτος'}),h('span',{text:e.person||KIND[e.kind]||''})),h('p',{text:e.text}),src);}
 function baseN7(b){const cs=Object.keys(b.centuries);const from=cs.includes('16')?1500:1600,to=cs.includes('17')?1700:1599;
  return 'https://bot.piratecartography.com/#atlas='+encodeURIComponent(JSON.stringify({schema:'n7-atlas-handoff/v1',place:baseName(b).slice(0,100),from,to,sources:[]}));}
 function basesView(){const q=fold(ui.q.bases);
  const all=BASES.bases.filter(baseVisible).filter(b=>!q||fold(b.area+' '+b.port+' '+Object.values(b.centuries).flat().map(e=>e.pirates||'').join(' ')).includes(q));
  const f=(key,v,l)=>h('button',{type:'button',class:'nbc-filter','aria-pressed':String(ui[key]===v),onclick:()=>{ui[key]=v;marks();paint();}},l);
  const groups=new Map();for(const b of all.sort((a,c)=>a.area.localeCompare(c.area,'el')||a.port.localeCompare(c.port,'el')))(groups.get(b.area)||groups.set(b.area,[]).get(b.area)).push(b);
  const out=[search('bases','Αναζήτηση ορμητηρίου ή πειρατών…'),
   h('div',{class:'nbc-filters'},f('faith','all','Όλα'),f('faith','christian','Χριστιανικά'),f('faith','muslim','Μουσουλμανικά')),
   h('div',{class:'nbc-filters'},f('century','all','16ος & 17ος'),f('century','16','16ος αι.'),f('century','17','17ος αι.')),
   h('p',{class:'nbc-note',text:all.length+' από '+BASES.bases.length+' ορμητήρια · '+(BASES.symbology||'')})];
  const {from,to}=period();if(!(from<=1500&&to>=1700)){const ev=EVENTS.events.filter(e=>e.years.some(y=>y>=from&&y<=to));
   out.push(sect('Γεγονότα '+(from===to?from:from+'–'+to),...(ev.length?ev.map(e=>{const d=eventItem(e);d.prepend(h('button',{type:'button',class:'nbc-ev-go',text:e.area+' →',onclick:()=>{const b=BASES.bases.find(x=>x.area===e.area);if(b)selectBase(b.id);else{const r=(atlas()?.places||[]).find(p=>fold(p.name)===fold(e.area));if(r)atlas().select(r.id);}}}));return d;}):[empty('Κανένα χρονολογημένο γεγονός στην περίοδο.')])));}
  for(const [a,l] of groups)out.push(l.length>1||l[0].port!==a?sect(a,baseList(l)):baseList(l));
  if(!all.length)out.push(empty('Κανένα ορμητήριο με αυτά τα φίλτρα.'));
  out.push(h('p',{class:'nbc-miss',text:'Πηγή: '+(BASES.source?.thesis||'')}));return out;}
 const baseList=l=>h('ul',{class:'nbc-list'},...l.map(b=>item(b.port||b.area,[b.port!==b.area?b.area:'',Object.entries(baseFaiths(b)).map(([c,fa])=>c+'ος '+(fa==='christian'?'χρ.':'μουσ.')).join(' · ')].filter(Boolean).join(' · '),()=>selectBase(b.id),null,ui.base===b.id,flagSvg(b,18))));
 function selectBase(id,{focus=true}={}){const b=baseById.get(id);if(!b)return;ui.power=null;ui.bv=null;ui.base=id;ui.rec=null;ui.pro=null;openTab('history');marks();if(focus)focusAt(b.lon,b.lat);}
 function focusAt(lon,lat){if(M3()?.enabled)M3().camera({lon,lat,tilt:48,rot:0,dist:2.4});else pan2d(lon,lat);}
 /* ───── powers of the period: their period banners at their seats (historical context, well established) ─────
    The banners are the chart's own gonfalons (window.NABOU_EMBLEMS: Burgundy cross, Lion of St Mark, lilies,
    Ottoman tughra, Algiers, papal keys); Malta, St Stephen and Genoa are recoloured from the St George banner.
    A seat shows only for the years given; no borders are drawn. */
 const POWERS=[
  {id:'venice',name:'Δημοκρατία της Βενετίας',emblem:'venetian',seats:[['Βενετία',45.4408,12.3155,1500,1700]],note:'Κυριαρχεί σε Επτάνησα, Κρήτη (έως 1669), Κύπρο (έως 1571) και σε νησιά του Αιγαίου.'},
  {id:'ottoman',name:'Οθωμανική Αυτοκρατορία',emblem:'ottoman',seats:[['Κωνσταντινούπολη',41.0082,28.9784,1500,1700]],note:'Η μεγάλη δύναμη της Ανατολικής Μεσογείου· ο καπουδάν πασάς διοικεί τον στόλο και το Αιγαίο.'},
  {id:'spain',name:'Ισπανική Μοναρχία (Αψβούργοι)',emblem:'spanish_simancas',seats:[['Νάπολη · αντιβασιλεία',40.8518,14.2681,1503,1700],['Παλέρμο · αντιβασιλεία της Σικελίας',38.1157,13.3615,1500,1700]],note:'Η Νάπολη και η Σικελία κυβερνώνται από Ισπανούς αντιβασιλείς· βάσεις του ισπανικού στόλου και κουρσάρων.'},
  {id:'malta',name:'Τάγμα του Αγίου Ιωάννη (Ιππότες)',emblem:'@malta',seats:[['Ρόδος',36.4466,28.2276,1500,1522],['Μάλτα',35.8989,14.5146,1530,1700],['Τρίπολη',32.8872,13.1913,1530,1551]],note:'Μετά την άλωση της Ρόδου (1522) το Τάγμα εγκαθίσταται στη Μάλτα (1530)· οι γαλέρες του κουρσεύουν τη μουσουλμανική ναυτιλία.'},
  {id:'ststephen',name:'Τοσκάνη · Ιππότες του Αγίου Στεφάνου',emblem:'@ststephen',seats:[['Λιβόρνο',43.5485,10.3106,1562,1700]],note:'Το Τάγμα του Αγίου Στεφάνου (1561/1562) κουρσεύει από το Λιβόρνο· «Λιβορνέζοι» στις πηγές.'},
  {id:'barbary',name:'Μπαρμπαρέσκες αντιβασιλείες (υπό την Υψηλή Πύλη)',emblem:'north_african',seats:[['Αλγέρι',36.7538,3.0588,1516,1700],['Τρίπολη',32.8872,13.1913,1551,1700],['Τύνιδα',36.8065,10.1815,1574,1700]],note:'Αλγέρι, Τρίπολη και Τύνιδα: ορμητήρια των κουρσάρων της Μπαρμπαριάς.'},
  {id:'papal',name:'Παπικό Κράτος',emblem:'italian_states',seats:[['Ρώμη',41.9028,12.4964,1500,1700]],note:'Συμμετέχει στις χριστιανικές συμμαχίες (Ιερός Σύνδεσμος, 1571).'},
  {id:'genoa',name:'Δημοκρατία της Γένοβας',emblem:'@genoa',seats:[['Γένοβα',44.4056,8.9463,1500,1700],['Χίος · Μαόνα',38.3710,26.1358,1500,1566]],note:'Η Χίος μένει γενουατική (Μαόνα) έως το 1566.'},
  {id:'france',name:'Βασίλειο της Γαλλίας',emblem:'french',seats:[['Μασσαλία',43.2965,5.3698,1500,1700]],note:'Σύμμαχος των Οθωμανών από το 1536· Γάλλοι κουρσάροι στο Αιγαίο τον 17ο αι.'}];
 const PSRC='Ιστορικό πλαίσιο, γενικά αποδεκτό (όχι τεκμηρίωση της έρευνας). Οι έδρες και τα έτη είναι ενδεικτικά.';
 function powerSvg(p){const E=window.NABOU_EMBLEMS;let svg=E?.get?.(p.emblem.startsWith('@')?'british':p.emblem)?.svg||'';
  if(p.emblem==='@genoa')return svg;                              // St George: red cross on white
  if(p.emblem==='@malta')return svg.replace('fill="#f4efe2"','fill="#a3342a"').replace('stroke="#a3342a" stroke-width="6"','stroke="#f4efe2" stroke-width="6"');
  if(p.emblem==='@ststephen')return svg.replace(/<path d="M20 8V58M4 28.5H36" stroke="#a3342a" stroke-width="6"\/>/,'<path d="M20 8V58M4 28.5H36" stroke="#c9a24e" stroke-width="8"/><path d="M20 8V58M4 28.5H36" stroke="#a3342a" stroke-width="5"/>');
  return svg;}
 const pPins=new Map(),pPins3d=new Map();
 function powerPin(p,seat,three){const [nm,lat,lon,from,to]=seat;
  const e=h('button',{type:'button',class:(three?'nbc-pin3d':'nbc-pin')+' nbc-power',dataset:{power:p.id,from,to},'aria-label':p.name+' · '+nm+' · '+from+'–'+to,title:p.name+' · '+nm+' ('+from+'–'+to+')',
   onclick:ev=>{ev.stopPropagation();ui.power=p.id;ui.bv=null;ui.base=null;ui.rec=null;ui.pro=null;openTab('history');}});
  // Two powers on one seat (Tripoli: Knights, then the regency) stand side by side, not on top of each other.
  e.dataset.seat=lat+','+lon;
  const art=h('span',{class:'nbc-power-art'});art.innerHTML=powerSvg(p);e.dataset.t0=e.title;e.append(art,h('span',{class:'nbc-power-name'},h('span',{text:nm.split(' · ')[0]}),h('b',{class:'nbc-power-count'})));return e;}
 function buildPowers(){const E=window.NABOU_EMBLEMS;Promise.resolve(E?.ready).catch(()=>{}).then(()=>{
  for(const p of POWERS)for(const [i,seat] of p.seats.entries()){const e=powerPin(p,seat,false),pt=project(seat[2],seat[1]);e.style.left=pt.x+'px';e.style.top=pt.y+'px';layer.append(e);pPins.set(p.id+i,e);}
  mountPowers3d();buildLegend();marks();});}
 function mountPowers3d(){if(pPins3d.size||!M3()?.enabled||!pPins.size)return;for(const p of POWERS)for(const [i,seat] of p.seats.entries()){const e=powerPin(p,seat,true);pPins3d.set(p.id+i,e);M3().addObject(e,{lon:seat[2],lat:seat[1],z:.05});}marks();}
 function powerView(p){const {from,to}=period();const art=h('span',{class:'nbc-power-big'});art.innerHTML=powerSvg(p);
  return [h('div',{class:'nbc-card nbc-power-card'},art,h('div',null,h('div',{class:'nbc-type',text:'Δύναμη της εποχής'}),h('h3',{class:'nbc-name',style:'font-size:24px',text:p.name}))),
   h('p',{class:'nbc-lead',text:p.note}),
   sect('Έδρες στον χάρτη',h('ul',{class:'nbc-list'},...p.seats.map(([nm,lat,lon,a,b])=>item(nm,a+'–'+b+(b<from||a>to?' · εκτός περιόδου':''),()=>focusAt(lon,lat),null,false)))),
   h('p',{class:'nbc-miss',text:PSRC})];}
 function n7Href(p){let {from,to}=period();if(from<=1500&&to>=1700){const ys=yearsIn(p.period);if(ys.length){from=Math.min(...ys);to=Math.max(...ys);}}
  return 'https://bot.piratecartography.com/#atlas='+encodeURIComponent(JSON.stringify({schema:'n7-atlas-handoff/v1',place:String(nameOf(p)).slice(0,100),from,to,sources:[]}));}
 function item(main,sub,onclick,aside,cur,icon){return h('li',null,h('button',{type:'button',class:'nbc-item'+(cur?' cur':''),onclick},icon||null,h('span',{class:'nbc-im'},h('b',{text:main}),sub?h('small',{text:sub}):null),aside||null));}
 const townIcon=p=>{const s=String(p.atlasSymbol||'').toLowerCase();return ICON[s]?h('img',{class:'nbc-thumb',src:'../icons/'+ICON[s],alt:''}):h('span',{class:'nbc-thumb nbc-thumb-l',text:'Aa'});};
 const placeList=l=>h('ul',{class:'nbc-list'},...l.map(p=>item(nameOf(p)+(greek(p)?' · '+p.place:''),[TYPE[p.type]||p.type,p.period].filter(Boolean).join(' · '),()=>selectRec(p.id),h('i',{class:'nbc-dot '+(STATUS[p.coordinateStatus]?.[1]||''),title:STATUS[p.coordinateStatus]?.[0]||''}),ui.rec===p.id,townIcon(p))));
 const routeList=l=>h('ul',{class:'nbc-list'},...l.map(r=>item(r.name,[r.character,r.period].filter(Boolean).join(' · '),()=>selectRoute(r),h('i',{class:'nbc-sw'+(NONPHYS.has(r.type)?' dash':''),style:'--c:'+RCOLOR[r.type]}),false)));
 function search(key,ph){const i=h('input',{class:'nbc-input',type:'search',placeholder:ph,'aria-label':ph,value:ui.q[key]});
  i.addEventListener('input',()=>{ui.q[key]=i.value;clearTimeout(search.t);search.t=setTimeout(()=>{paint();const n=recBox.querySelector('.nbc-input');if(n){n.focus();n.setSelectionRange(n.value.length,n.value.length);}},160);});return i;}
 function townsView(){
  const base=DATA.places.filter(visible),counts={};for(const p of base)counts[p.type]=(counts[p.type]||0)+1;
  if(ui.typeFilter!=='all'&&!counts[ui.typeFilter])ui.typeFilter='all';const q=fold(ui.q.towns);
  const list=base.filter(p=>(ui.typeFilter==='all'||p.type===ui.typeFilter)&&(!q||fold([p.place,p.historicalNames,p.modernName].join(' ')).includes(q))).sort((a,b)=>nameOf(a).localeCompare(nameOf(b),'el'));
  const f=(v,l,n)=>h('button',{type:'button',class:'nbc-filter','aria-pressed':String(ui.typeFilter===v),onclick:()=>{ui.typeFilter=v;paint();}},l,h('small',{text:n}));
  return [search('towns','Φιλτράρισμα οικισμών…'),h('div',{class:'nbc-filters'},f('all','Όλοι',base.length),...Object.keys(counts).sort((a,b)=>counts[b]-counts[a]).map(t=>f(t,TYPE[t]||t,counts[t]))),
   list.length?placeList(list):empty('Καμία εγγραφή με αυτά τα κριτήρια.')];
 }
 function related(r){const key=fold(String(r.modernName||r.place).split(/[(,]/)[0]);if(key.length<3)return [];
  return DATA.places.filter(x=>x.id!==r.id&&String(x.modernName||'').split(',').slice(1).some(part=>fold(part).replace(/\s*\(.*$/,'')===key));}
 function monumentsView(){const forts=DATA.places.filter(p=>p.type==='Fortress'),within=DATA.places.map(p=>[p,related(p)]).filter(([,l])=>l.length);
  const out=[h('p',{class:'nbc-note',text:'Τα δεδομένα GERAKI δεν έχουν ξεχωριστή κατηγορία μνημείων. Εμφανίζονται οι εγγραφές τύπου «Οχυρό» και τα σημεία μέσα σε μεγαλύτερο τόπο· δεν προστίθεται κανένα σημείο.'})];
  out.push(sect('Οχυρά',forts.length?placeList(forts):empty('Δεν υπάρχουν ακόμη επαληθευμένα σημεία.')));
  for(const [p,l] of within)out.push(sect('Μέσα σε: '+nameOf(p),placeList(l)));return out;}
 function peopleView(){
  const m=new Map(),add=(n,k,x)=>{if(!m.has(n))m.set(n,{n,places:[],routes:[]});m.get(n)[k].push(x);};
  for(const p of DATA.places)for(const n of people(p.characters))add(n,'places',p);for(const r of DATA.routes)for(const n of people(r.character))add(n,'routes',r);
  const q=fold(ui.q.people),list=[...m.values()].filter(x=>!q||fold(x.n).includes(q)).sort((a,b)=>(b.places.length+b.routes.length)-(a.places.length+a.routes.length));
  const out=[search('people','Αναζήτηση προσώπου…'),h('p',{class:'nbc-note',text:list.length+' πρόσωπα όπως καταγράφονται στις εγγραφές GERAKI.'})];
  for(const x of list){const d=h('details',{class:'nbc-person',open:ui.personOpen===x.n},h('summary',null,h('span',{class:'nbc-av',text:x.n.replace(/[^\p{L}\s]/gu,'').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'·'}),
   h('span',{class:'nbc-im'},h('b',{text:x.n}),h('small',{text:[x.places.length?x.places.length+' τόποι':'',x.routes.length?x.routes.length+' διαδρομές':''].filter(Boolean).join(' · ')}))),
   x.places.length?placeList(x.places):null,x.routes.length?routeList(x.routes):null);d.addEventListener('toggle',()=>{if(d.open)ui.personOpen=x.n;});out.push(d);}
  if(ui.personOpen)requestAnimationFrame(()=>recBox.querySelector('.nbc-person[open]')?.scrollIntoView({block:'nearest'}));return out;}
 function routesView(){const base=DATA.routes.filter(visible).sort((a,b)=>(a.sequence??99)-(b.sequence??99)),g=new Map();for(const r of base)(g.get(r.type)||g.set(r.type,[]).get(r.type)).push(r);
  const out=[];for(const [t,l] of g)out.push(sect(RTYPE[t]||t,routeList(l)));if(!base.length)out.push(empty('Καμία διαδρομή στην επιλεγμένη περίοδο.'));
  out.push(h('p',{class:'nbc-note',text:'Οι γραμμές είναι σχηματικές· τα δίκτυα πληροφοριών και τα σχέδια που δεν εκτελέστηκαν φαίνονται διακεκομμένα και δεν είναι ταξίδια.'}));return out;}
 function sourcesView(){const q=fold(ui.q.sources);
  const items=[...DATA.places.filter(p=>p.sources).map(p=>({t:nameOf(p),x:p,text:p.sources,place:true})),...DATA.routes.filter(r=>r.evidence).map(r=>({t:r.name,x:r,text:r.evidence}))].filter(i=>!q||fold(i.t+' '+i.text).includes(q));
  const out=[search('sources','Αναζήτηση στις πηγές…'),h('p',{class:'nbc-note',text:items.length+' τεκμηριωμένες εγγραφές. Τα ευρήματα της έρευνας N7 για τον επιλεγμένο τόπο είναι στην «Ιστορία τόπου».'})];
  for(const i of items)out.push(h('div',{class:'nbc-src'},h('button',{type:'button',text:i.t,onclick:()=>i.place?selectRec(i.x.id):selectRoute(i.x)}),h('p',{text:i.text})));
  out.push(sect('Προέλευση δεδομένων',dl([['Πηγή',DATA.generatedFrom],['Ημερομηνία',DATA.generatedAt],['Κανόνας',DATA.policy?.routeGeometry]])));return out;}

 /* ───── selection & camera (existing APIs only) ───── */
 function selectRec(id,{focus=true}={}){const p=byId.get(id);if(!p)return;ui.power=null;ui.bv=null;ui.base=null;ui.rec=id;const pro=linked.get(id);ui.pro=pro||null;
  if(pro)atlas()?.select(pro,{focus:false});
  openTab('history');marks();if(focus)focusRec(id);}
 function selectRoute(r){ui.tab='routes';openTab('routes');routeHi(r.id);
  const pts=routePts(r);if(pts.length&&M3()?.enabled){const mid=pts[Math.floor(pts.length/2)];M3().camera({lon:mid[1],lat:mid[0]});}
  else if(pts.length){const mid=pts[Math.floor(pts.length/2)];pan2d(mid[1],mid[0]);}}
 function focusRec(id){const p=byId.get(id);if(!p||!Number.isFinite(p.lat))return;
  if(M3()?.enabled)M3().camera({lon:p.lon,lat:p.lat,tilt:48,rot:0,dist:2.4});else pan2d(p.lon,p.lat);}
 function view2d(){const m=/translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/.exec(plane.style.transform||'');return m?{x:+m[1],y:+m[2],s:+m[3]}:{x:0,y:0,s:1};}
 const merc=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))*180/Math.PI;
 const project=(lon,lat)=>({x:(lon-C.lon0)*C.k,y:(C.my1-merc(lat))*C.k});
 // Same method as professional-atlas.js select(): the chart's own arrow-key panning.
 function pan2d(lon,lat){const v=view2d(),pt=project(lon,lat),dx=view.clientWidth/2-(pt.x*v.s+v.x),dy=view.clientHeight/2-(pt.y*v.s+v.y),stage=$('chartStage');if(!stage)return;
  for(const [d,pos,neg] of [[dx,'ArrowLeft','ArrowRight'],[dy,'ArrowUp','ArrowDown']])for(let i=0;i<Math.min(60,Math.round(Math.abs(d)/60));i++)stage.dispatchEvent(new KeyboardEvent('keydown',{key:d>0?pos:neg,bubbles:true,cancelable:true}));}
 // A reference place picked on the map shows its card; a GERAKI record at the same spot is shown with it.
 document.addEventListener('click',e=>{const m=e.target.closest?.('.pro-place-marker,.pro-3d-place');if(!m?.dataset.place)return;
  ui.base=null;ui.pro=m.dataset.place;ui.rec=proToRec.get(ui.pro)||null;openTab('history');marks();},true);

 /* ───── GERAKI records on the chart: 2D overlay + 3D pins ───── */
 const layer=h('div',{class:'nbc-geo',id:'nbcGeo'});layer.style.width=C.W+'px';layer.style.height=C.H+'px';
 const rsvg=document.createElementNS(NS,'svg');rsvg.setAttribute('class','nbc-routes');rsvg.setAttribute('viewBox','0 0 '+C.W+' '+C.H);rsvg.setAttribute('width',C.W);rsvg.setAttribute('height',C.H);
 layer.append(rsvg);plane.append(layer);
 const syncScale=()=>{const sc=view2d().s;layer.style.setProperty('--nbc-inv',String(1/sc));layer.classList.toggle('far',sc<1.3);};
 new MutationObserver(syncScale).observe(plane,{attributes:true,attributeFilter:['style']});syncScale();
 const routePts=r=>{const a=byId.get(r.from?.[0]?.id),b=byId.get(r.to?.[0]?.id);if(!a||!b)return [];
  return [Array.isArray(r.displayStart)?r.displayStart:[a.lat,a.lon],...(r.waypoints||[]).filter(Array.isArray),Array.isArray(r.displayEnd)?r.displayEnd:[b.lat,b.lon]];};
 const pins=new Map(),pins3d=new Map(),lines=new Map();
 function pinEl(p,three){const sym=String(p.atlasSymbol||'').toLowerCase(),lab=LABEL_ONLY.has(sym);
  const b=h('button',{type:'button',class:(three?'nbc-pin3d ':'nbc-pin ')+(lab?'lab':'town')+(['capital','city'].includes(sym)?' major':''),dataset:{rec:p.id,status:p.coordinateStatus||''},'aria-label':nameOf(p)+' · '+(STATUS[p.coordinateStatus]?.[0]||''),
   title:nameOf(p)+(p.coordinateStatus==='APPROXIMATE'?' · σημείο κατά προσέγγιση':p.coordinateStatus==='NEEDS RESEARCH'?' · χρειάζεται έρευνα':''),onclick:e=>{e.stopPropagation();selectRec(p.id,{focus:false});}},
   lab?null:h('img',{src:'../icons/'+(ICON[sym]||'atlas-town.svg'),alt:''}),h('span',{text:nameOf(p)}));return b;}
 function buildMap(){
  for(const p of DATA.places){if(!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||linked.get(p.id))continue;const b=pinEl(p,false),pt=project(p.lon,p.lat);b.style.left=pt.x+'px';b.style.top=pt.y+'px';layer.append(b);pins.set(p.id,b);}
  for(const r of DATA.routes){const pts=routePts(r);if(pts.length<2||r.atlasHidden)continue;const pl=document.createElementNS(NS,'polyline');
   pl.setAttribute('points',pts.map(([la,lo])=>{const q=project(lo,la);return q.x.toFixed(1)+','+q.y.toFixed(1);}).join(' '));
   pl.setAttribute('class','nbc-route'+(NONPHYS.has(r.type)?' np':''));pl.style.setProperty('--c',RCOLOR[r.type]||'#eee');pl.dataset.route=r.id;rsvg.append(pl);lines.set(r.id,pl);}
 }

 /* ───── sovereignty per base area and period (approved list, 20 Nov 2026; standard dates) ───── */
 const RULERS={venice:['Βενετία','#d9a93c'],ottoman:['Οθωμανοί','#a679dc'],latin:['Λατινικές ηγεμονίες (Δουκάτο Αιγαίου κ.ά.)','#5d95e6'],
  tributary:['Λατίνοι υποτελείς στην Πύλη','#8fb3e8'],genoa:['Γενουάτες (Μαόνα)','#eeeeee'],knights:['Ιππότες του Αγ. Ιωάννη','#ef8a46'],
  spain:['Ισπανία','#ec78b6'],tuscany:['Τοσκάνη (Μέδικοι)','#6fd4b4'],mamluk:['Μαμελούκοι','#b39570'],hafsid:['Χαφσίδες (ισπανική προστασία 1535–74)','#b39570'],
  mani:['Μάνη · αυτόνομη, ονομαστικά οθωμανική','#9fb0b6'],regency:['Οθωμανική αντιβασιλεία','#a679dc']};
 const R_=(...a)=>a;const CYC_DUCHY=R_([1500,1536,'latin'],[1537,1565,'tributary'],[1566,1700,'ottoman']);
 const RULE={
  'Ζάκυνθος':R_([1500,1700,'venice']),'Κεφαλλονιά':R_([1500,1700,'venice']),'Κύθηρα':R_([1500,1700,'venice']),'Αντικύθηρα':R_([1500,1700,'venice']),'Στροφάδες':R_([1500,1700,'venice']),
  'Λευκάδα':R_([1500,1683,'ottoman'],[1684,1700,'venice']),'Πρέβεζα':R_([1500,1683,'ottoman'],[1684,1700,'venice']),
  'Αιτωλοακαρνανία':R_([1500,1700,'ottoman']),'Έξω Λούρος':R_([1500,1700,'ottoman']),'Οξειά':R_([1500,1700,'ottoman']),'Δρυονήσι':R_([1500,1700,'ottoman']),
  'Αυλώνα':R_([1500,1700,'ottoman']),'Αυλώνα, Αλβανία':R_([1500,1700,'ottoman']),'Δυρράχιο':R_([1500,1500,'venice'],[1501,1700,'ottoman']),
  'Μονεμβάσια':R_([1500,1539,'venice'],[1540,1689,'ottoman'],[1690,1700,'venice']),'Αργολίδα':R_([1500,1539,'venice'],[1540,1685,'ottoman'],[1686,1700,'venice']),
  'Μεσσηνία':R_([1500,1684,'ottoman'],[1685,1700,'venice']),'Σαπιέντζα':R_([1500,1684,'ottoman'],[1685,1700,'venice']),
  'Μάνη':R_([1500,1684,'mani'],[1685,1700,'venice']),
  'Ύδρα':R_([1500,1684,'ottoman'],[1685,1700,'venice']),'Δοκός':R_([1500,1684,'ottoman'],[1685,1700,'venice']),'Ελαφόνησος':R_([1500,1684,'ottoman'],[1685,1700,'venice']),
  'Σκυλλί':R_([1500,1684,'ottoman'],[1685,1700,'venice']),'Βενέτικο':R_([1500,1684,'ottoman'],[1685,1700,'venice']),'Σχίζα':R_([1500,1684,'ottoman'],[1685,1700,'venice']),
  'Σούνιο Αττικής':R_([1500,1700,'ottoman']),'Μακρόνησος':R_([1500,1700,'ottoman']),'Πεταλάς':R_([1500,1700,'ottoman']),
  'Κρήτη':R_([1500,1668,'venice'],[1669,1700,'ottoman']),'Γαύδος':R_([1500,1668,'venice'],[1669,1700,'ottoman']),
  'Ρόδος':R_([1500,1522,'knights'],[1523,1700,'ottoman']),'Κάρπαθος':R_([1500,1537,'venice'],[1538,1700,'ottoman']),'Πάτμος':R_([1500,1522,'knights'],[1523,1700,'ottoman']),
  'Αστυπάλαια':R_([1500,1536,'latin'],[1537,1700,'ottoman']),'Αμοργός':R_([1500,1536,'latin'],[1537,1700,'ottoman']),
  'Νάξος':CYC_DUCHY,'Πάρος':CYC_DUCHY,'Αντίπαρος':CYC_DUCHY,'Μήλος':CYC_DUCHY,'Κίμωλος':CYC_DUCHY,'Ίος':CYC_DUCHY,'Σύρος':CYC_DUCHY,'Ανάφη':CYC_DUCHY,'Φολέγανδρος':CYC_DUCHY,
  'Κάτω Κουφονήσι':CYC_DUCHY,'Πάνω Κουφονήσι':CYC_DUCHY,'Σκατζούρα':CYC_DUCHY,'Τσελεβίνια':CYC_DUCHY,'Προκοπάνιστος':CYC_DUCHY,'Αυγό':CYC_DUCHY,'Περιστέρα':CYC_DUCHY,'Τηγάνι':CYC_DUCHY,
  'Σίφνος':CYC_DUCHY,'Κύθνος':CYC_DUCHY,'Κέα (Τζιά)':CYC_DUCHY,'Σέριφος':CYC_DUCHY,
  'Μύκονος':R_([1500,1536,'venice'],[1537,1700,'ottoman']),'Δήλος':R_([1500,1536,'venice'],[1537,1700,'ottoman']),'Ρηνεία':R_([1500,1536,'venice'],[1537,1700,'ottoman']),
  'Στενό Χίου':R_([1500,1565,'genoa'],[1566,1700,'ottoman']),'Οινούσσες':R_([1500,1565,'genoa'],[1566,1700,'ottoman']),
  'Σάμος':R_([1500,1700,'ottoman']),'Ικαρία':R_([1500,1700,'ottoman']),'Φούρνοι':R_([1500,1700,'ottoman']),'Μυτιλήνη':R_([1500,1700,'ottoman']),'Θάσος':R_([1500,1700,'ottoman']),
  'Εύβοια':R_([1500,1700,'ottoman']),'Μοσχονήσια':R_([1500,1700,'ottoman']),
  'Σκιάθος':R_([1500,1537,'venice'],[1538,1700,'ottoman']),'Σκύρος':R_([1500,1537,'venice'],[1538,1700,'ottoman']),
  'Παράλια Μικράς Ασίας':R_([1500,1700,'ottoman']),'Αττάλεια, Παράλια Μικράς Ασίας':R_([1500,1700,'ottoman']),'Κονάκ, Παράλια Μικράς Ασίας':R_([1500,1700,'ottoman']),
  'Σεφεριχισάρ, Παράλια Μικράς Ασίας':R_([1500,1700,'ottoman']),'Φώκαια, Παράλια Μικράς Ασίας':R_([1500,1700,'ottoman']),
  'Μάλτα':R_([1500,1529,'spain'],[1530,1700,'knights']),'Σικελία':R_([1500,1700,'spain']),'Καμπανία, Ιταλία':R_([1500,1502,'spain'],[1503,1700,'spain']),
  'Απουλία, Ιταλία':R_([1500,1508,'venice'],[1509,1700,'spain']),'Λιβόρνο, Ιταλία':R_([1500,1700,'tuscany']),
  'Λιβύη':R_([1500,1509,'hafsid'],[1510,1529,'spain'],[1530,1550,'knights'],[1551,1700,'regency']),'Τυνησία':R_([1500,1573,'hafsid'],[1574,1700,'regency']),
  'Αίγυπτος':R_([1500,1516,'mamluk'],[1517,1700,'ottoman'])};
 RULE['Καμπανία, Ιταλία']=R_([1500,1700,'spain']);
 const ruleOf=b=>RULE[b.area]||null;
 function rulerAt(b,from,to){const r=ruleOf(b);if(!r)return null;const mid=(from+to)/2;return (r.find(s=>s[0]<=mid&&mid<=s[1])||r.find(s=>s[1]>=from&&s[0]<=to)||null);}
 function ruleSect(b){const r=ruleOf(b);if(!r)return null;const {from,to}=period();
  return sect('Κυριαρχία',...r.map(([a,z,k])=>h('div',{class:'nbc-rule'+(z>=from&&a<=to?' in':''),style:'--rc:'+RULERS[k][1]},h('b',{text:a+'–'+z}),h('span',{text:RULERS[k][0]}))),
   h('p',{class:'nbc-miss',style:'margin:6px 0 0',text:'Γενικό ιστορικό πλαίσιο με τις καθιερωμένες χρονολογίες· όχι τεκμηρίωση της έρευνας.'}));}
 function applyRule(){const {from,to}=period();for(const m of [bpins,bpins3d])for(const [id,e] of m){const b=baseById.get(id);const s=b&&rulerAt(b,from,to);
   if(s){e.style.setProperty('--rule',RULERS[s[2]][1]);e.dataset.rule=RULERS[s[2]][0];}else{e.style.removeProperty('--rule');delete e.dataset.rule;}}}

 /* ───── map legend: what the flags, numbers, banners and colour bars mean ───── */
 function buildLegend(){const slot=$('n7MapSlot');if(!slot||$('nbcLegend'))return;
  const row=(art,txt)=>h('div',{class:'nbc-lg-row'},h('span',{class:'nbc-lg-art'},art),h('p',null,...txt));
  const F=(l,r,a,b)=>flagArt(l,r,a,b,28),R='#c8322d',G='#2f8f4e';
  const badge=(t,c1,c2)=>h('i',{class:'nbc-lg-badge',style:'--nbc-f1:'+c1+';--nbc-f2:'+c2,text:t});
  const banner=h('span',{class:'nbc-lg-ban'});const vp=POWERS.find(p=>p.id==='venice');if(vp)banner.innerHTML=powerSvg(vp);
  const bars=h('span',{class:'nbc-rule-lg'},...['venice','ottoman','latin','tributary','genoa','knights','spain','tuscany'].map(k=>h('span',null,h('i',{style:'background:'+RULERS[k][1]}),RULERS[k][0].split(' (')[0])));
  const panel=h('div',{class:'nbc-legend-body'},
   h('h4',{text:'Πειρατικά ορμητήρια (διατριβή)'}),
   row(F(R,R,'christian'),[h('b',{text:'Κόκκινη σημαία'}),' χριστιανικό ορμητήριο']),
   row(F(G,G,'muslim'),[h('b',{text:'Πράσινη σημαία'}),' μουσουλμανικό ορμητήριο']),
   row(h('span',null,F(R,R,'x',null),F(R,R,null,'x')),[h('b',{text:'Κοντάρι'}),': γκρι = 16ος αι., μαύρο = 17ος αι.']),
   row(F(R,G,'christian','muslim'),['Δύο χρώματα και δίχρωμο κοντάρι: άλλαξε από τον 16ο στον 17ο αι.']),
   row(badge('+3',R,R),[h('b',{text:'Αριθμός'}),': τόσα ακόμη ορμητήρια κρύβονται εκεί, γιατί είναι πολύ κοντά. Μεγέθυνε ή πέρνα το ποντίκι από πάνω.']),
   row(badge('+5',R,G),['Μισό κόκκινο, μισό πράσινο: η ομάδα έχει και τα δύο.']),
   h('h4',{text:'Ρότες & πειρατεία (Μπελαβίλας 1992)'}),
   row(h('span',{class:'nbc-lg-route'}),[h('b',{text:'Διακεκομμένη γραμμή'}),': ναυτική ρότα του Αιγαίου (Βαλκανική, Κυκλαδίτικη, Μικρασιάτικη).']),
   row(bvIcon('refuge',22),[h('b',{text:'Άγκυρα'}),': πειρατικό καταφύγιο ή ενέδρα.']),
   row(bvIcon('market',22),[h('b',{text:'Ζυγαριά'}),': πειρατικό παζάρι, όπου πουλιόταν η λεία.']),
   row(bvIcon('vigla',22),[h('b',{text:'Βίγλα'}),': παρατηρητήριο με φωτιά τη νύχτα και καπνό τη μέρα.']),
   h('h4',{text:'Δυνάμεις της εποχής'}),
   row(banner,[h('b',{text:'Λάβαρο'}),': έδρα μιας δύναμης (π.χ. Βενετία, Νάπολη). Εμφανίζεται μόνο για τα χρόνια που ισχύει. «Νάπολη +2» = άλλα 2 σημεία κοντά.']),
   h('h4',{text:'Ποιος κυβερνούσε'}),
   h('p',{class:'nbc-lg-p',text:'Η γραμμή κάτω από κάθε σημαία δείχνει ποιος κυβερνούσε την περιοχή στην περίοδο του χρονολογίου.'}),bars,
   h('p',{class:'nbc-lg-p dim',text:'Ορμητήρια: Μ. Γουργουρίνη, διατριβή (piratecartography.com). Ρότες, καταφύγια, παζάρια, βίγλες: Ν. Μπελαβίλας, διατριβή ΕΜΠ 1992 (θέσεις κατά προσέγγιση). Δυνάμεις και κυριαρχία: γενικό ιστορικό πλαίσιο.'}));
  let open=true;try{open=localStorage.getItem('nbc.legend')!=='0';}catch(e){}
  const btn=h('button',{type:'button',class:'nbc-legend-btn','aria-expanded':String(open),onclick:()=>{open=!open;box.dataset.open=open;btn.setAttribute('aria-expanded',String(open));try{localStorage.setItem('nbc.legend',open?'1':'0');}catch(e){}}},h('b',{text:'i'}),'Υπόμνημα');
  const box=h('aside',{class:'nbc-legend',id:'nbcLegend','aria-label':'Υπόμνημα χάρτη',dataset:{open:String(open)}},btn,panel);slot.append(box);}

 /* ───── Belavilas 1992: sea routes, pirate refuges, markets, lookouts (data/belavilas.json) ───── */
 let BV={routes:[],cites:[],points:[]},BVById=new Map();const bvLines=new Map(),bvPins=new Map(),bvPins3d=new Map();let bv3d=[];
 const BVKIND={refuge:['Πειρατικό καταφύγιο','#c8322d'],market:['Πειρατικό παζάρι','#e0a64a'],vigla:['Βίγλα (παρατηρητήριο)','#7fd3e6']};
 function bvIcon(kind,size=20){const s=document.createElementNS(NS,'svg');s.setAttribute('viewBox','0 0 20 20');s.setAttribute('width',size);s.setAttribute('height',size);s.setAttribute('aria-hidden','true');s.setAttribute('class','nbc-bvi');
  const c=BVKIND[kind][1];
  s.innerHTML=`<circle cx="10" cy="10" r="8.6" fill="#120d08" stroke="${c}" stroke-width="1.6"/>`+(kind==='refuge'
   ?`<path d="M10 4.6v9.6M7.4 6.6h5.2M5.2 11.2c.6 2.4 2.6 3.6 4.8 3.6s4.2-1.2 4.8-3.6" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/><circle cx="10" cy="4.4" r="1.1" fill="${c}"/>`
   :kind==='market'?`<path d="M10 4.5v10M5.5 7h9M5.5 7 4 11h3zM14.5 7 13 11h3z" fill="none" stroke="${c}" stroke-width="1.3" stroke-linejoin="round"/><path d="M4 11a1.5 1 0 0 0 3 0M13 11a1.5 1 0 0 0 3 0" fill="${c}"/><path d="M7.5 14.8h5" stroke="${c}" stroke-width="1.4"/>`
   :`<path d="M6.6 16h6.8l-1-7.2H7.6z" fill="${c}"/><path d="M7 8.8h6V7.4h-1.1v.8h-1.1v-.8H9.2v.8H8.1v-.8H7z" fill="${c}"/><path d="M9.2 11h1.6v2.4H9.2z" fill="#120d08"/><path d="M10 2.6c1.9 1.5 2.1 2.9 1 4.2-.4-.9-1-1.1-1.6-.7.4-1.2.3-2.3.6-3.5z" fill="#ffb347"/>`);return s;}
 function bvPin(pt,three){const e=h('button',{type:'button',class:(three?'nbc-pin3d':'nbc-pin')+' nbc-bv k-'+pt.kind,dataset:{bv:pt.id},'aria-label':pt.name+' · '+BVKIND[pt.kind][0],title:pt.name+' · '+BVKIND[pt.kind][0]+' (Μπελαβίλας 1992)',
   onclick:ev=>{ev.stopPropagation();selectBV(pt.id);}},bvIcon(pt.kind,three?18:20),h('span',{text:pt.name}));return e;}
 function selectBV(id){const x=BVById.get(id);if(!x)return;ui.bv=id;ui.base=null;ui.rec=null;ui.pro=null;ui.power=null;openTab('history');marks();
  for(const [k,l] of bvLines)l.classList.toggle('hi',k===id);}
 function bvView(x){const isR=!!x.lines;const kind=isR?'Ναυτική ρότα':BVKIND[x.kind][0];
  const head=h('div',{class:'nbc-card'},h('div',{class:'nbc-type'},isR?h('i',{class:'nbc-sw',style:'--c:'+x.color}):bvIcon(x.kind,16),' '+kind),h('h3',{class:'nbc-name',text:x.name}),
   h('div',{class:'nbc-pills'},h('span',{class:'nbc-pill',text:'σελ. '+x.pages}),h('span',{class:'nbc-pill',text:'1420–1815'}),stChip('APPROXIMATE')));
  const out=[head,sect('Τι γράφει η διατριβή',h('p',{style:'margin:0',text:isR?x.note:x.text}),x.spot?h('p',{class:'nbc-miss',text:x.spot}):null),
   sect('Πηγή',h('p',{class:'nbc-miss',style:'margin:0',text:BV.source.cite+', σελ. '+x.pages+'.'}),h('p',{class:'nbc-miss',text:BV.note}))];
  if(!isR){out.push(h('div',{class:'nbc-actions'},h('button',{type:'button',class:'nbc-btn primary',onclick:()=>focusAt(x.lon,x.lat)},ico(I.focus),'Εστίαση στον χάρτη')));
   const near=BASES.bases.filter(b=>Math.hypot((b.lon-x.lon)*Math.cos(x.lat*Math.PI/180),b.lat-x.lat)<.25);if(near.length)out.push(sect('Ορμητήρια της διατριβής σου εδώ',...near.map(b=>h('button',{type:'button',class:'nbc-item',onclick:()=>selectBase(b.id)},flagSvg(b,16),h('span',{text:' '+baseName(b)})))));}
  return out;}
 function buildBV(){
  for(const r of BV.routes){const g=document.createElementNS(NS,'g');g.setAttribute('class','nbc-sea');g.dataset.bvr=r.id;g.style.setProperty('--c',r.color);
   for(const ln of r.lines){const pts=ln.map(([la,lo])=>{const q=project(lo,la);return q.x.toFixed(1)+','+q.y.toFixed(1);}).join(' ');
    for(const cls of ['cas','ln','hit']){const pl=document.createElementNS(NS,'polyline');pl.setAttribute('points',pts);pl.setAttribute('class',cls);g.append(pl);}}
   const t=document.createElementNS(NS,'title');t.textContent=r.name+' · Μπελαβίλας 1992, σελ. '+r.pages;g.append(t);
   g.addEventListener('click',ev=>{ev.stopPropagation();selectBV(r.id);});rsvg.append(g);bvLines.set(r.id,g);}
  for(const pt of BV.points){const e=bvPin(pt,false),q=project(pt.lon,pt.lat);e.style.left=q.x+'px';e.style.top=q.y+'px';layer.append(e);bvPins.set(pt.id,e);}
  mountBV3d();marks();}
 function mountBV3d(){const m=M3();if(bvPins3d.size||!m?.enabled||!m.ready||!BV.points.length)return;
  for(const pt of BV.points){const e=bvPin(pt,true);bvPins3d.set(pt.id,e);m.addObject(e,{lon:pt.lon,lat:pt.lat,z:.03});}
  try{const T=m.THREE;for(const r of BV.routes)for(const ln of r.lines){const ps=ln.map(([la,lo])=>{const o=new T.Object3D(),hd=m.addObject(o,{lon:lo,lat:la,z:.02});const v=o.position.clone();hd.remove();return v;});
    const geo=new T.BufferGeometry().setFromPoints(ps),mat=new T.LineDashedMaterial({color:r.color,dashSize:.04,gapSize:.025,transparent:true,opacity:.95});
    const line=new T.Line(geo,mat);line.computeLineDistances();line.userData.bvr=r.id;m.scene.add(line);bv3d.push(line);}}catch(e){console.warn('nabou: 3D routes',e);}
  marks();}
 const bpins=new Map(),bpins3d=new Map();
 function basePin(b,three){const e=h('button',{type:'button',class:(three?'nbc-pin3d':'nbc-pin')+' nbc-base major',dataset:{base:b.id},'aria-label':baseName(b)+' · πειρατικό ορμητήριο',title:baseName(b)+' · '+Object.entries(baseFaiths(b)).map(([c,fa])=>CENT[c]+' '+FAITH[fa][0].toLowerCase()).join(', '),
   onclick:ev=>{ev.stopPropagation();selectBase(b.id,{focus:false});}},flagSvg(b,three?22:24),h('span',{text:b.port||b.area}));return e;}
 function buildBases(){for(const b of BASES.bases){const e=basePin(b,false),pt=project(b.lon,b.lat);e.style.left=pt.x+'px';e.style.top=pt.y+'px';layer.append(e);bpins.set(b.id,e);}mountBases3d();marks();}
 function mountBases3d(){if(bpins3d.size||!M3()?.enabled||!BASES.bases.length)return;for(const b of BASES.bases){const e=basePin(b,true);bpins3d.set(b.id,e);M3().addObject(e,{lon:b.lon,lat:b.lat,z:.03});}marks();}
 function mount3d(){mountBases3d();mountPowers3d();mountBV3d();if(pins3d.size||!M3()?.enabled||!DATA.places.length)return;
  for(const p of DATA.places){if(!Number.isFinite(p.lat)||linked.get(p.id))continue;const b=pinEl(p,true);pins3d.set(p.id,b);M3().addObject(b,{lon:p.lon,lat:p.lat,z:.03});}
  marks();}
 function routeHi(id){for(const [k,l] of lines)l.classList.toggle('hi',k===id);}
 function marks(){try{applyRule();}catch(e){}
  for(const e of [...bvPins.values(),...bvPins3d.values()]){e.hidden=!ui.layers.bvpoints;e.toggleAttribute('data-sel',ui.bv===e.dataset.bv);}
  for(const g of bvLines.values())g.style.display=ui.layers.bvroutes?'':'none';for(const l of bv3d)l.visible=!!ui.layers.bvroutes;
  for(const [id,b] of [...pins,...pins3d]){const p=byId.get(id),on=visible(p)&&ui.status[p.coordinateStatus||'NEEDS RESEARCH']!==false&&(LABEL_ONLY.has(String(p.atlasSymbol).toLowerCase())?ui.layers.labels:ui.layers.towns);b.hidden=!on;b.toggleAttribute('data-sel',ui.rec===id);}
  {const {from,to}=period();for(const e of [...pPins.values(),...pPins3d.values()])e.hidden=!ui.layers.powers||+e.dataset.to<from||+e.dataset.from>to;}
  for(const [id,e] of [...bpins,...bpins3d]){const b=baseById.get(id);e.hidden=!baseVisible(b);e.toggleAttribute('data-sel',ui.base===id);}
  for(const [id,l] of lines){const r=DATA.routes.find(x=>x.id===id);l.style.display=ui.layers.routes&&visible(r)&&ui.rtypes.get(r.type)!==false?'':'none';}
  if(typeof queueDeclutter==='function')queueDeclutter();
 }

 /* ───── decluttering: nearby pins fold into the nearest shown marker («+n»), in 2D and 3D ─────
    Screen-space only (element boxes); no position changes. Larger towns and reference places stay. */
 const R=44;let clT=0;
 function declutter(){
  const three=!!M3()?.enabled,box=view.getBoundingClientRect();
  for(const e of document.querySelectorAll('[data-nbc-more]'))e.removeAttribute('data-nbc-more'),e.removeAttribute('data-nbc-names'),e.removeAttribute('data-nbc-flag');
  for(const e of document.querySelectorAll('[data-nbc-fold]'))e.removeAttribute('data-nbc-fold');
  const refs=[...document.querySelectorAll(three?'.pro-3d-place,.nbc-pin3d.nbc-power':'.pro-place-marker,.nbc-pin.nbc-power')].filter(e=>!e.hidden&&e.offsetParent);
  const mine=[...(three?bpins3d:bpins).values(),...(three?bvPins3d:bvPins).values(),...(three?pins3d:pins).values()].filter(e=>!e.hidden&&e.offsetParent);
  const rank=e=>e.hasAttribute('data-sel')?0:e.classList.contains('nbc-base')?1:e.classList.contains('nbc-bv')?2:e.classList.contains('major')?2:e.classList.contains('lab')?4:3;
  mine.sort((a,b)=>rank(a)-rank(b));
  const pt=e=>{const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:e.classList.contains('lab')?r.top+r.height/2:r.bottom-6,ok:r.width>0&&r.right>box.left&&r.left<box.right&&r.bottom>box.top&&r.top<box.bottom};};
  // Banners lead: places and bases next to a seat fold into its banner, which shows the count in its
  // name plate (never as a badge over the art). The seat's own place marker folds without counting.
  // Two powers on one seat in the shown period (Tripoli 1551) stand side by side with one name plate.
  const bySeat=new Map();for(const e of refs)if(e.classList.contains('nbc-power')){e.classList.remove('nbc-pair');e.style.removeProperty('--dx');const k=e.dataset.seat;bySeat.set(k,[...(bySeat.get(k)||[]),e]);}
  for(const g of bySeat.values())if(g.length>1)g.forEach((e,i)=>{e.style.setProperty('--dx',(i-(g.length-1)/2)*30+'px');if(i<g.length-1)e.classList.add('nbc-pair');});
  const pw=refs.filter(e=>e.classList.contains('nbc-power')),heads=pw.map(e=>({e,...pt(e),n:[],members:[]}));
  for(const e of refs){if(pw.includes(e))continue;const q=pt(e);const h0=heads.find(hd=>hd.e.classList.contains('nbc-power')&&Math.hypot(hd.x-q.x,hd.y-q.y)<R*1.4);
   if(h0){e.setAttribute('data-nbc-fold','');if(Math.hypot(h0.x-q.x,h0.y-q.y)>14)h0.n.push(e.querySelector('span,b,strong')?.textContent||e.textContent.trim());}else heads.push({e,...q,n:[],members:[]});}
  for(const e of document.querySelectorAll('.nbc-power-count'))e.textContent='';for(const e of pw)if(e.dataset.t0)e.title=e.dataset.t0;
  for(const e of mine){const q=pt(e);if(!q.ok)continue;if(e.hasAttribute('data-sel')){heads.push({e,...q,n:[],members:[]});continue;}
   const h0=heads.find(hd=>Math.hypot(hd.x-q.x,hd.y-q.y)<(hd.e.classList.contains('nbc-power')?R*1.4:R));
   if(h0){h0.n.push(e.querySelector('span')?.textContent||'');h0.members.push(e);e.setAttribute('data-nbc-fold','');}else heads.push({e,...q,n:[],members:[]});}
  for(const hd of heads)if(hd.n.length&&hd.e.classList.contains('nbc-power')){const c=hd.e.querySelector('.nbc-power-count');if(c)c.textContent='+'+hd.n.length;
   hd.e.title=hd.e.dataset.t0+' · κοντά: '+hd.n.join(', ');}
  for(const hd of heads)if(hd.n.length&&!hd.e.classList.contains('nbc-power')){
   // A group holding pirate bases shows a small flag with the count (thesis colours, by majority faith).
   const fs=[hd.e,...hd.members].map(e=>e.dataset.base&&baseById.get(e.dataset.base)).filter(Boolean).flatMap(b=>Object.values(baseFaiths(b)));
   if(fs.length){const c=fs.filter(f=>f==='christian').length,m=fs.length-c;hd.e.setAttribute('data-nbc-flag','');
    hd.e.style.setProperty('--nbc-f1',FAITH[c>=m?'christian':'muslim'][1]);hd.e.style.setProperty('--nbc-f2',FAITH[c&&m?(c>=m?'muslim':'christian'):(c>=m?'christian':'muslim')][1]);}
   else hd.e.removeAttribute('data-nbc-flag');
   hd.e.setAttribute('data-nbc-more','+'+hd.n.length);hd.e.setAttribute('data-nbc-names','Κοντά: '+hd.n.join(', ')+' · μεγέθυνε για να φανούν');}
 }
 const queueDeclutter=()=>{cancelAnimationFrame(clT);clT=requestAnimationFrame(declutter);};
 new MutationObserver(queueDeclutter).observe(plane,{attributes:true,attributeFilter:['style']});
 addEventListener('resize',queueDeclutter);
 // The 3D camera moves without DOM events we can observe; while 3D is on, re-check a few times a second.
 // The 3D camera and late layout (landing page, docked map) give no event we can observe: re-check
 // often while 3D is on, and every second in 2D (cheap: one box read per pin).
 let clTick=0;setInterval(()=>{if(document.hidden)return;if(M3()?.enabled||++clTick%3===0)declutter();},350);

 /* ───── timeline: year marks from the records, on the existing range ───── */
 const track=shell.querySelector('.n7-timeline-track');const marksEl=h('div',{class:'nbc-tl',id:'nbcTimeline','aria-label':'Έτη με εγγραφές'});
 const allBtn=h('button',{type:'button',class:'nbc-tl-all',text:'Όλη η περίοδος',onclick:()=>setPeriod(1500,1700)});
 const rangeHost=$('n7TimelineRange');if(rangeHost)rangeHost.append(marksEl);if(track)track.querySelector('.n7-timeline-head')?.append(allBtn);
 function buildTimeline(){if(!track)return;const cnt=new Map();
  for(const x of [...DATA.places,...DATA.routes])if(bookHit(x)&&!x.atlasHidden)for(const y of new Set(yearsIn(x.period)))cnt.set(y,(cnt.get(y)||0)+1);
  const max=Math.max(1,...cnt.values()),{from,to}=period();
  // Dated piracy events in 5-year bins (many entries list several years); a bin sets that period.
  const evB=new Map();for(const e of EVENTS.events)for(const y of new Set(e.years.map(y=>y-y%5)))evB.set(y,(evB.get(y)||0)+1);
  const evMax=Math.max(1,...evB.values());
  const evMarks=[...evB].sort((a,b)=>a[0]-b[0]).map(([y,n])=>{const on=from===y&&to===y+4;return h('button',{type:'button',class:'nbc-yr nbc-yr-ev'+(on?' on':''),style:'left:'+((y+2-1500)/2)+'%;--s:'+(6+Math.round(7*n/evMax))+'px',
    title:y+'–'+(y+4)+' · '+n+' γεγονότα πειρατείας','aria-label':y+' έως '+(y+4)+': '+n+' γεγονότα πειρατείας','aria-pressed':String(on),
    onclick:()=>{if(on)setPeriod(1500,1700);else{setPeriod(y,y+4);openTab('bases');}}},h('i'),h('span',{text:y+'–'+(y+4)+' · '+n+' γεγονότα'}));});
  marksEl.replaceChildren(...evMarks,...[...cnt].sort((a,b)=>a[0]-b[0]).map(([y,n])=>{const on=from===y&&to===y,inr=y>=from&&y<=to;
   return h('button',{type:'button',class:'nbc-yr'+(on?' on':'')+(inr?'':' out'),style:'left:'+((y-1500)/2)+'%;--h:'+Math.round(4+16*n/max)+'px',title:y+' · '+n+' εγγραφές','aria-label':y+': '+n+' εγγραφές','aria-pressed':String(on),
    onclick:()=>on?setPeriod(1500,1700):setPeriod(y,y)},h('i'),h('span',{text:String(y)}));}));
  allBtn.hidden=from<=1500&&to>=1700;
 }

 /* ───── layers: NABOU section in the existing «Επίπεδα» panel ───── */
 function buildLayers(){const host=$('proMapTools')||$('n7LayersBody');if(!host||$('nbcLayers'))return;
  const sw=(label,get,set,extra)=>{const i=h('input',{type:'checkbox'});i.checked=get();i.addEventListener('change',()=>{set(i.checked);marks();});return h('label',{class:'pro-check nbc-check'},i,h('span',{text:label}),extra||null);};
  const box=h('fieldset',{class:'nbc-layers',id:'nbcLayers'},h('legend',{text:'Εγγραφές GERAKI'}),
   sw('Οικισμοί',()=>ui.layers.towns,v=>ui.layers.towns=v),sw('Τοπωνύμια (νησιά, θάλασσες)',()=>ui.layers.labels,v=>ui.layers.labels=v),sw('Διαδρομές (2D)',()=>ui.layers.routes,v=>ui.layers.routes=v),
   h('p',{class:'nbc-lg',text:'Δυνάμεις της εποχής'}),sw('Λάβαρα στις έδρες τους',()=>ui.layers.powers,v=>ui.layers.powers=v),
   h('p',{class:'nbc-lg',text:'Μπελαβίλας 1992 (ΕΜΠ)'}),sw('Ναυτικές ρότες',()=>ui.layers.bvroutes,v=>ui.layers.bvroutes=v),sw('Καταφύγια, παζάρια, βίγλες',()=>ui.layers.bvpoints,v=>ui.layers.bvpoints=v),
   h('p',{class:'nbc-lg',text:'Πειρατικά ορμητήρια (διατριβή Μ. Γουργουρίνη)'}),
   h('p',{class:'nbc-lg',text:'Κυριαρχία (χρώμα κάτω από τη σημαία)'}),h('div',{class:'nbc-rule-lg'},...['venice','ottoman','latin','tributary','genoa','knights','spain','tuscany'].map(k=>h('span',null,h('i',{style:'background:'+RULERS[k][1]}),RULERS[k][0].split(' (')[0]))),sw('Χριστιανικά',()=>ui.layers.christian,v=>ui.layers.christian=v,h('i',{class:'nbc-dot',style:'background:#c8322d'})),sw('Μουσουλμανικά',()=>ui.layers.muslim,v=>ui.layers.muslim=v,h('i',{class:'nbc-dot',style:'background:#2f8f4e'})),
   h('p',{class:'nbc-lg',text:'Κατάσταση σημείου (GERAKI)'}),...Object.entries(STATUS).map(([k,[l,c]])=>sw(l,()=>ui.status[k],v=>ui.status[k]=v,h('i',{class:'nbc-dot '+c}))),
   h('p',{class:'nbc-lg',text:'Τύποι διαδρομών'}),...[...ui.rtypes.keys()].map(t=>sw(RTYPE[t]||t,()=>ui.rtypes.get(t),v=>ui.rtypes.set(t,v),h('i',{class:'nbc-sw'+(NONPHYS.has(t)?' dash':''),style:'--c:'+RCOLOR[t]}))));
  host.append(box);}

 /* ───── search: GERAKI records join the existing top-field place list ───── */
 function wrapAtlas(){const a=atlas();if(!a||a.__nbc)return !!a;
  const search0=a.search,select0=a.select;
  a.search=v=>{const base=search0(v)||[],q=fold(v);if(!q)return base;const have=new Set(base.map(x=>x.id));
   const extra=DATA.places.filter(p=>!linked.get(p.id)&&fold([p.place,p.historicalNames,p.modernName].join(' ')).includes(q)).slice(0,6).map(p=>({id:p.id,name:nameOf(p)+' · GERAKI'}));
   const bx=BASES.bases.filter(b=>fold(b.area+' '+b.port).includes(q)).slice(0,6).map(b=>({id:b.id,name:baseName(b)+' · ορμητήριο'}));
   return [...bx,...base,...extra.filter(x=>!have.has(x.id))];};
  // Reference-place ids keep the original path (also used by the N7 map link); GERAKI ids open the record.
  a.select=(id,opt)=>{if(byId.has(id))return selectRec(id);if(baseById.has(id))return selectBase(id);const r=select0(id,opt);if(a.selected===id){ui.base=null;ui.pro=id;ui.rec=proToRec.get(id)||null;openTab('history');marks();}return r;};
  Object.defineProperty(a,'__nbc',{value:true});return true;}

 function refresh(){for(const b of seg.children)b.setAttribute('aria-pressed',String(b.dataset.book===ui.book));
  const {from,to}=period();$('nbcPeriodText').textContent=from===to?String(from):from+'–'+to;periodChip.classList.toggle('on',!(from<=1500&&to>=1700));
  buildTimeline();marks();if(!dock.hidden)paint();}
 document.addEventListener('input',e=>{if(e.target.closest?.('#n7TimelineRange'))requestAnimationFrame(refresh);});

 // Dated events: the thesis (ch. 2, with page) and the site's harbour pages.
 Promise.all(['./data/thesis-events.json','./data/pirate-events.json'].map(u=>fetch(u,{cache:'no-cache'}).then(r=>r.ok?r.json():null).catch(()=>null))).then(([t,site])=>{
  if(t)THESIS=t;EVENTS={events:[...(t?.events||[]),...(site?.events||[])]};buildTimeline();if(!dock.hidden)paint();body.dataset.nbcEvents=String(EVENTS.events.length);});
 fetch('./data/belavilas.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).then(d=>{if(!d)return;BV=d;BVById=new Map([...d.routes,...d.points].map(x=>[x.id,x]));buildBV();body.dataset.nbcBv=String(d.points.length);}).catch(()=>{});
 fetch('./data/pirate-bases.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error(r.status);return r.json();}).then(d=>{
  BASES=d;baseById=new Map(d.bases.map(b=>[b.id,b]));buildBases();body.dataset.nbcBases=String(d.bases.length);if(!dock.hidden)paint();
  let n=0;const t=setInterval(()=>{if(wrapAtlas()||++n>100)clearInterval(t);},100);
 }).catch(()=>{body.dataset.nbcBases='unavailable';});
 fetch('../data.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error(r.status);return r.json();}).then(d=>{
  DATA=d;byId=new Map(d.places.map(p=>[p.id,p]));
  for(const t of new Set(d.routes.map(r=>r.type)))ui.rtypes.set(t,true);
  // A GERAKI record within ~25 km of a reference place is the same place (the reference marker stays the only pin).
  const refs=atlas()?.places||[];
  for(const p of d.places){const r=refs.find(x=>Math.hypot(x.lon-p.lon,(x.lat-p.lat))<.25);if(r){linked.set(p.id,r.id);if(!proToRec.has(r.id))proToRec.set(r.id,p.id);}}
  if(atlas()?.selected&&!ui.rec){ui.pro=atlas().selected;ui.rec=proToRec.get(ui.pro)||null;}
  buildMap();buildLayers();refresh();mount3d();
  let n=0;const t=setInterval(()=>{if(wrapAtlas()||++n>100)clearInterval(t);},100);
  body.dataset.nbcRecords=String(d.places.length);
 }).catch(()=>{body.dataset.nbcRecords='unavailable';paint();});
 buildPowers();sync3d();openTab('bases',{show:false});
 // Research lanes («Ερευνητές»: Βρετανία, Ολλανδία…) are research-source families, not states: in the atlas
 // they stay off unless the user turns them on in «Επίπεδα»; research activity no longer switches them on.
 let lanesByUser=false;document.addEventListener('change',e=>{if(e.target.closest?.('#proMapTools')&&/Ερευνητές/.test(e.target.closest('label')?.textContent||''))lanesByUser=e.target.checked;},true);
 new MutationObserver(()=>{if(body.dataset.proLanes==='true'&&!lanesByUser&&body.dataset.readerView!=='research'){body.dataset.proLanes='false';const i=[...document.querySelectorAll('#proMapTools label')].find(l=>/Ερευνητές/.test(l.textContent))?.querySelector('input');if(i)i.checked=false;}}).observe(body,{attributes:true,attributeFilter:['data-pro-lanes']});
 window.NABOU_COMMAND={selectRecord:selectRec,selectBase,openTab,get state(){return {tab:ui.tab,rec:ui.rec,pro:ui.pro,book:ui.book,...period()};}};
})();
