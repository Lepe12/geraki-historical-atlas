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
  close:'<path d="M6 6l12 12M18 6 6 18"/>'};
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
 const ui={tab:'history',rec:null,pro:null,book:'All',typeFilter:'all',q:{towns:'',people:'',sources:''},personOpen:null,
  layers:{towns:true,labels:true,routes:true},status:{VERIFIED:true,APPROXIMATE:true,'NEEDS RESEARCH':true},rtypes:new Map()};

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
 const PANELS=[['history','Ιστορία τόπου',I.history],['towns','Οικισμοί',I.towns],['monuments','Μνημεία & οχυρά',I.monuments],['people','Πρόσωπα',I.people],['routes','Διαδρομές',I.routes],['sources','Ιστορικές πηγές',I.sources]];
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
  const showCard=ui.tab==='history'&&(ui.pro||!ui.rec);
  card?.classList.toggle('nbc-off',!showCard);
  let kicker='',nodes=[];
  if(ui.tab==='history'){kicker='Ιστορία τόπου';const r=ui.rec&&byId.get(ui.rec);nodes=r?recordView(r):[];}
  else if(ui.tab==='towns'){kicker='Οικισμοί · '+filterLine();nodes=townsView();}
  else if(ui.tab==='monuments'){kicker='Μνημεία & οχυρά';nodes=monumentsView();}
  else if(ui.tab==='people'){kicker='Πρόσωπα';nodes=peopleView();}
  else if(ui.tab==='routes'){kicker='Διαδρομές · '+filterLine();nodes=routesView();}
  else if(ui.tab==='sources'){kicker='Ιστορικές πηγές';nodes=sourcesView();}
  if(!DATA.places.length&&ui.tab!=='history')nodes=[empty('Φόρτωση εγγραφών GERAKI…')];
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
 function selectRec(id,{focus=true}={}){const p=byId.get(id);if(!p)return;ui.rec=id;const pro=linked.get(id);ui.pro=pro||null;
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
  ui.pro=m.dataset.place;ui.rec=proToRec.get(ui.pro)||null;openTab('history');marks();},true);

 /* ───── GERAKI records on the chart: 2D overlay + 3D pins ───── */
 const layer=h('div',{class:'nbc-geo',id:'nbcGeo'});layer.style.width=C.W+'px';layer.style.height=C.H+'px';
 const rsvg=document.createElementNS(NS,'svg');rsvg.setAttribute('class','nbc-routes');rsvg.setAttribute('viewBox','0 0 '+C.W+' '+C.H);rsvg.setAttribute('width',C.W);rsvg.setAttribute('height',C.H);
 layer.append(rsvg);plane.append(layer);
 const syncScale=()=>{const sc=view2d().s;layer.style.setProperty('--nbc-inv',String(1/sc));layer.classList.toggle('far',sc<1.8);};
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
 function mount3d(){if(pins3d.size||!M3()?.enabled||!DATA.places.length)return;
  for(const p of DATA.places){if(!Number.isFinite(p.lat)||linked.get(p.id))continue;const b=pinEl(p,true);pins3d.set(p.id,b);M3().addObject(b,{lon:p.lon,lat:p.lat,z:.03});}
  marks();}
 function routeHi(id){for(const [k,l] of lines)l.classList.toggle('hi',k===id);}
 function marks(){
  for(const [id,b] of [...pins,...pins3d]){const p=byId.get(id),on=visible(p)&&ui.status[p.coordinateStatus||'NEEDS RESEARCH']!==false&&(LABEL_ONLY.has(String(p.atlasSymbol).toLowerCase())?ui.layers.labels:ui.layers.towns);b.hidden=!on;b.toggleAttribute('data-sel',ui.rec===id);}
  for(const [id,l] of lines){const r=DATA.routes.find(x=>x.id===id);l.style.display=ui.layers.routes&&visible(r)&&ui.rtypes.get(r.type)!==false?'':'none';}
 }

 /* ───── timeline: year marks from the records, on the existing range ───── */
 const track=shell.querySelector('.n7-timeline-track');const marksEl=h('div',{class:'nbc-tl',id:'nbcTimeline','aria-label':'Έτη με εγγραφές'});
 const allBtn=h('button',{type:'button',class:'nbc-tl-all',text:'Όλη η περίοδος',onclick:()=>setPeriod(1500,1700)});
 const rangeHost=$('n7TimelineRange');if(rangeHost)rangeHost.append(marksEl);if(track)track.querySelector('.n7-timeline-head')?.append(allBtn);
 function buildTimeline(){if(!track)return;const cnt=new Map();
  for(const x of [...DATA.places,...DATA.routes])if(bookHit(x)&&!x.atlasHidden)for(const y of new Set(yearsIn(x.period)))cnt.set(y,(cnt.get(y)||0)+1);
  const max=Math.max(1,...cnt.values()),{from,to}=period();
  marksEl.replaceChildren(...[...cnt].sort((a,b)=>a[0]-b[0]).map(([y,n])=>{const on=from===y&&to===y,inr=y>=from&&y<=to;
   return h('button',{type:'button',class:'nbc-yr'+(on?' on':'')+(inr?'':' out'),style:'left:'+((y-1500)/2)+'%;--h:'+Math.round(4+16*n/max)+'px',title:y+' · '+n+' εγγραφές','aria-label':y+': '+n+' εγγραφές','aria-pressed':String(on),
    onclick:()=>on?setPeriod(1500,1700):setPeriod(y,y)},h('i'),h('span',{text:String(y)}));}));
  allBtn.hidden=from<=1500&&to>=1700;
 }

 /* ───── layers: NABOU section in the existing «Επίπεδα» panel ───── */
 function buildLayers(){const host=$('proMapTools')||$('n7LayersBody');if(!host||$('nbcLayers'))return;
  const sw=(label,get,set,extra)=>{const i=h('input',{type:'checkbox'});i.checked=get();i.addEventListener('change',()=>{set(i.checked);marks();});return h('label',{class:'pro-check nbc-check'},i,h('span',{text:label}),extra||null);};
  const box=h('fieldset',{class:'nbc-layers',id:'nbcLayers'},h('legend',{text:'Εγγραφές GERAKI'}),
   sw('Οικισμοί',()=>ui.layers.towns,v=>ui.layers.towns=v),sw('Τοπωνύμια (νησιά, θάλασσες)',()=>ui.layers.labels,v=>ui.layers.labels=v),sw('Διαδρομές (2D)',()=>ui.layers.routes,v=>ui.layers.routes=v),
   h('p',{class:'nbc-lg',text:'Κατάσταση σημείου'}),...Object.entries(STATUS).map(([k,[l,c]])=>sw(l,()=>ui.status[k],v=>ui.status[k]=v,h('i',{class:'nbc-dot '+c}))),
   h('p',{class:'nbc-lg',text:'Τύποι διαδρομών'}),...[...ui.rtypes.keys()].map(t=>sw(RTYPE[t]||t,()=>ui.rtypes.get(t),v=>ui.rtypes.set(t,v),h('i',{class:'nbc-sw'+(NONPHYS.has(t)?' dash':''),style:'--c:'+RCOLOR[t]}))));
  host.append(box);}

 /* ───── search: GERAKI records join the existing top-field place list ───── */
 function wrapAtlas(){const a=atlas();if(!a||a.__nbc)return !!a;
  const search0=a.search,select0=a.select;
  a.search=v=>{const base=search0(v)||[],q=fold(v);if(!q)return base;const have=new Set(base.map(x=>x.id));
   const extra=DATA.places.filter(p=>!linked.get(p.id)&&fold([p.place,p.historicalNames,p.modernName].join(' ')).includes(q)).slice(0,6).map(p=>({id:p.id,name:nameOf(p)+' · GERAKI'}));
   return [...base,...extra.filter(x=>!have.has(x.id))];};
  // Reference-place ids keep the original path (also used by the N7 map link); GERAKI ids open the record.
  a.select=(id,opt)=>{if(byId.has(id))return selectRec(id);const r=select0(id,opt);if(a.selected===id){ui.pro=id;ui.rec=proToRec.get(id)||null;openTab('history');marks();}return r;};
  Object.defineProperty(a,'__nbc',{value:true});return true;}

 function refresh(){for(const b of seg.children)b.setAttribute('aria-pressed',String(b.dataset.book===ui.book));
  const {from,to}=period();$('nbcPeriodText').textContent=from===to?String(from):from+'–'+to;periodChip.classList.toggle('on',!(from<=1500&&to>=1700));
  buildTimeline();marks();if(!dock.hidden)paint();}
 document.addEventListener('input',e=>{if(e.target.closest?.('#n7TimelineRange'))requestAnimationFrame(refresh);});

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
 sync3d();openTab('history',{show:false});
 window.NABOU_COMMAND={selectRecord:selectRec,openTab,get state(){return {tab:ui.tab,rec:ui.rec,pro:ui.pro,book:ui.book,...period()};}};
})();
