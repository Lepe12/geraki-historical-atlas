/* NABOU_PROFESSIONAL_ATLAS_V1 — additive presentation; canonical renderer/world unchanged. */
(() => {
 'use strict';
 const C=window.NABOU_CHART,plane=document.getElementById('chartPlane'),body=document.body;
 if(!C||!plane||document.getElementById('proMapTools'))return;
 body.classList.add('atlas-pro');body.dataset.proPlaces='true';body.dataset.proLanes='false';body.dataset.proRhumbs='false';
 const $=id=>document.getElementById(id);
 const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
 const button=(text,fn,cls)=>{const b=el('button',text,cls);b.type='button';b.addEventListener('click',fn);return b;};
 const svg=(tag,attrs={})=>{const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e;};
 const merc=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))*180/Math.PI;
 const project=(lon,lat)=>({x:(lon-C.lon0)*C.k,y:(C.my1-merc(lat))*C.k});
 const places=[
  {id:'algiers',name:'Αλγέρι',lon:3.0588,lat:36.7538,aliases:['Algiers','Alger','Αλγερι']},
  {id:'venice',name:'Βενετία',lon:12.3155,lat:45.4408,aliases:['Venice','Venezia','Βενετια']},
  {id:'barcelona',name:'Βαρκελώνη',lon:2.1734,lat:41.3851,aliases:['Barcelona']},
  {id:'tunis',name:'Τύνιδα',lon:10.1815,lat:36.8065,aliases:['Tunis','Τυνιδα']},
  {id:'istanbul',name:'Κωνσταντινούπολη',lon:28.9784,lat:41.0082,aliases:['Istanbul','Constantinople']},
  {id:'chania',name:'Χανιά',lon:24.018,lat:35.5138,aliases:['Chania','Canea','Χανια']},
  {id:'heraklion',name:'Χάνδακας',lon:25.1333,lat:35.3387,aliases:['Candia','Heraklion','Καντια','Ηρακλειο']},
  {id:'tripoli',name:'Τρίπολη',lon:13.1913,lat:32.8872,aliases:['Tripoli','Τριπολη']},
  {id:'alexandria',name:'Αλεξάνδρεια',lon:29.9187,lat:31.2001,aliases:['Alexandria']},
  {id:'corfu',name:'Κέρκυρα',lon:19.9217,lat:39.6243,aliases:['Corfu','Κερκυρα']},
  {id:'malta',name:'Βαλέτα',lon:14.5146,lat:35.8992,aliases:['Valletta','Malta','Μαλτα']}
 ];
 const normal=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('el').replace(/ς/g,'σ');
 let selected=places[0],snapshot=null,startYear=1500,endYear=1700;
 const shell=$('n7Shell');
 // N7 layout: the docked layers column, timeline and place card are real slots in index.html; nothing floats over the map.
 const slot=(id,make)=>shell&&$(id)||make();

 const tools=slot('n7LayersBody',()=>{const t=el('aside',undefined,'pro-map-tools');t.setAttribute('aria-label','Φίλτρα και τόποι χάρτη');return t;});tools.id='proMapTools';if(!shell)tools.classList.add('pro-map-tools');
 const heading=el('div',undefined,'pro-tools-heading');heading.append(el('h2','Επίπεδα'),button('×',()=>{tools.classList.remove('pro-open');toggle.setAttribute('aria-expanded','false');shell?.dispatchEvent(new CustomEvent('n7:close-layers'));},'pro-mobile-close'));tools.append(heading);
 function check(label,key,on){const box=el('label',undefined,'pro-check');const input=el('input');input.type='checkbox';input.checked=on;input.addEventListener('change',()=>{body.dataset[key]=String(input.checked);for(const p of places)if(p.object3d)p.object3d.hidden=key==='proPlaces'?!input.checked:p.object3d.hidden;});box.append(input,el('span',label));tools.append(box);return input;}
 check('Τόποι & λιμάνια','proPlaces',true);const laneInput=check('Ερευνητές','proLanes',false);check('Ναυτικές γραμμές','proRhumbs',false);
 window.addEventListener('jarvis:focus-agent',()=>{body.dataset.proLanes='true';laneInput.checked=true;});
 const period=slot('n7TimelineRange',()=>{const s=el('section',undefined,'pro-period');s.append(el('h2','Χρονολόγηση'));return s;});const dateLabel=slot('n7TimelineLabel',()=>el('p'));
 const from=el('input'),to=el('input');for(const [input,label,value] of [[from,'Από το έτος',1500],[to,'Έως το έτος',1700]]){input.type='range';input.min='1500';input.max='1700';input.step='1';input.value=String(value);input.setAttribute('aria-label',label);period.append(input);}
 function dates(changed){if(+from.value>+to.value){if(changed===from)to.value=from.value;else from.value=to.value;}startYear=+from.value;endYear=+to.value;dateLabel.textContent=startYear+' – '+endYear;renderPlace();}
 from.addEventListener('input',()=>dates(from));to.addEventListener('input',()=>dates(to));if(!shell){period.append(dateLabel,el('p','Περίοδος αναζήτησης · όχι αναπαράσταση πολιτικών συνόρων.','pro-note'));tools.append(period);}
 const searchLabel=el('label','Αναζήτηση τόπου','pro-search-label'),search=el('input');search.type='search';search.placeholder='Πόλη ή λιμάνι…';search.setAttribute('aria-label','Αναζήτηση τόπου');searchLabel.append(search);tools.append(searchLabel);
 const results=el('div',undefined,'pro-place-list');results.setAttribute('aria-label','Τόποι αναφοράς');tools.append(results);
 function matches(value){const q=normal(value).trim();return places.filter(p=>normal([p.name,...p.aliases].join(' ')).includes(q));}
 function searchPlaces(){const found=matches(search.value);results.replaceChildren();for(const p of found)results.append(button(p.name,()=>select(p.id)));if(!found.length)results.append(el('p','Δεν βρέθηκε τόπος.','pro-note'));}
 search.addEventListener('input',searchPlaces);searchPlaces();if(!shell)document.body.append(tools);
 const toggle=shell?el('span'):button('☷ Επίπεδα',()=>{const on=tools.classList.toggle('pro-open');toggle.setAttribute('aria-expanded',String(on));},'pro-tools-toggle');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','proMapTools');if(!shell)document.body.append(toggle);
 const info=slot('proPlaceInfo',()=>{const a=el('aside',undefined,'pro-place-info');a.id='proPlaceInfo';a.setAttribute('aria-label','Επιλεγμένος τόπος');document.body.append(a);return a;});
 if(!$('n7Assistant')){const assistant=el('div',undefined,'pro-assistant');const chat=el('a',undefined,'pro-assistant-chat');chat.href='https://bot.piratecartography.com/';chat.target='_blank';chat.rel='noopener noreferrer';chat.append(el('strong','N7 Βοηθός'),el('span','Ερωτήσεις για τόπους, κείμενα και πηγές ↗'));const voice=button('Φωνή',()=>document.dispatchEvent(new CustomEvent('n7:open-voice')),'pro-voice');voice.setAttribute('aria-label','Άνοιγμα φωνής N7');assistant.append(chat,voice);document.body.append(assistant);}
 const scale=el('div',undefined,'pro-map-scale');scale.id='proMapScale';scale.title='Προσεγγιστική κλίμακα στη γεωγραφική θέση του κέντρου του χάρτη';const scaleLine=el('div'),scaleLabel=el('span');scale.append(scaleLine,scaleLabel);$('chartView').append(scale);
 const overlay=el('div',undefined,'pro-geo-markers');overlay.style.width=C.W+'px';overlay.style.height=C.H+'px';plane.append(overlay);
 for(const p of places){const pt=project(p.lon,p.lat);const b=button('',()=>select(p.id),'pro-place-marker');b.append(el('span',p.name,'pro-marker-label'));b.dataset.place=p.id;b.setAttribute('aria-label',p.name+' · γεωγραφικό σημείο αναφοράς');b.style.left=pt.x+'px';b.style.top=pt.y+'px';overlay.append(b);p.marker=b;}
 const terrain=$('chartPlane').querySelector('svg.chart');
 if(terrain){
  const defs=terrain.querySelector('defs'),clip=svg('clipPath',{id:'proLandClip'});clip.append(svg('use',{href:'#landP'}));defs.append(clip);
  const gradient=svg('linearGradient',{id:'proSea',x1:'0',y1:'0',x2:'0',y2:'1'});gradient.append(svg('stop',{offset:'0%','stop-color':'#16434a'}),svg('stop',{offset:'100%','stop-color':'#092c34'}));defs.append(gradient);
  const relief=svg('image',{x:0,y:0,width:C.W,height:C.H,'clip-path':'url(#proLandClip)',class:'pro-relief'});terrain.querySelector('.coast').before(relief);
  // Inline the same-origin raster so the existing 3D SVG texture loader can reuse it.
  fetch('./assets/nautical/terrain/professional-relief.png').then(r=>{if(!r.ok)throw Error('terrain unavailable');return r.blob();}).then(blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);})).then(data=>{relief.setAttribute('href',data);body.dataset.proRelief='ready';}).catch(()=>{relief.remove();body.dataset.proRelief='unavailable';});
  const labels=svg('g',{class:'pro-map-labels'});
  for(const [text,lon,lat,sea] of [['Ευρώπη',4,48,false],['Βόρεια Αφρική',3,30.8,false],['Μικρά Ασία',31,38.5,false],['Μεσόγειος Θάλασσα',15,34.3,true]]){const pos=project(lon,lat),t=svg('text',{x:pos.x,y:pos.y,'text-anchor':'middle',class:sea?'pro-sea-label':'pro-land-label'});t.textContent=text;labels.append(t);}terrain.append(labels);
 }
 function view(){const m=/translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/.exec(plane.style.transform||'');return m?{x:+m[1],y:+m[2],s:+m[3]}:{x:0,y:0,s:1};}
 function syncView(){const v=view();overlay.style.setProperty('--pro-inverse-scale',1/v.s);const host=$('chartView'),y=(host.clientHeight/2-v.y)/v.s;const lat=(2*Math.atan(Math.exp((C.my1-y/C.k)*Math.PI/180))-Math.PI/2)*180/Math.PI;const kmPerPixel=111.32*Math.cos(lat*Math.PI/180)/(C.k*v.s),raw=140*kmPerPixel,power=10**Math.floor(Math.log10(Math.max(1,raw))),nice=[10,5,2,1].map(n=>n*power).find(n=>n<=raw)||power;scaleLine.style.width=(nice/kmPerPixel)+'px';scaleLabel.textContent='0                     '+Math.round(nice).toLocaleString('el')+' χλμ.';}
 new MutationObserver(syncView).observe(plane,{attributes:true,attributeFilter:['style']});window.addEventListener('resize',syncView);syncView();
 function safeUrl(value){try{const u=new URL(String(value||''));return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}}
 function records(){const names=[selected.name,...selected.aliases].map(normal);return (snapshot?.discoveries||[]).filter(r=>{const text=normal([r.title,r.source_title,r.context_excerpt,r.excerpt,r.query].filter(Boolean).join(' '));if(!names.some(n=>text.includes(n)))return false;const year=Number(r.event_year||r.historical_year);return !Number.isFinite(year)||!year||(year>=startYear&&year<=endYear);});}
 const topics={context:'Βρες χρονολογημένες πηγές για την εξουσία, τον ρόλο του λιμανιού και σχετικά πρόσωπα.',events:'Βρες χρονολογημένα γεγονότα (επιδρομές, πολιορκίες, ναυμαχίες) με πηγές.',people:'Βρες πρόσωπα (κουρσάρους, διοικητές, εμπόρους) με χρονολογημένες πηγές.',material:'Βρες ιστορικούς χάρτες, πορτολάνους και εικόνες με την προέλευσή τους.'};
 function prepareResearch(topic){const query=$('operatorQuery');if(query){query.value='Ιστορική έρευνα για '+selected.name+', '+startYear+'–'+endYear+'. '+(topics[topic]||topics.context)+' Ξεχώρισε τα τεκμήρια από τις υποθέσεις.';query.dispatchEvent(new Event('input',{bubbles:true}));}window.N7_READER?.show('research');query?.focus();}
 const saved=()=>{try{return JSON.parse(localStorage.getItem('n7-saved-places')||'[]').filter(id=>places.some(p=>p.id===id));}catch{return [];}};
 function toggleSaved(){const list=saved(),i=list.indexOf(selected.id);if(i<0)list.push(selected.id);else list.splice(i,1);try{localStorage.setItem('n7-saved-places',JSON.stringify(list));}catch{}renderPlace();document.dispatchEvent(new CustomEvent('n7:saved-places'));}
 const icon=name=>{const s=svg('svg',{viewBox:'0 0 24 24','aria-hidden':'true',class:'n7-ico'});s.innerHTML={sources:'<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/>',events:'<path d="M5 5l14 14M19 5L5 19"/><path d="M4 8l4-4M16 20l4-4M20 8l-4-4M8 20l-4-4"/>',people:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 4-7 8-7s7 2 8 7"/>',names:'<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',material:'<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.6"/>',mark:'<path d="M6 3h12v18l-6-4.5L6 21z"/>'}[name]||'';return s;};
 function row(kind,label,count,action,detail){const item=el('li',undefined,'n7-place-row');const b=button('',action,'n7-row');b.dataset.row=kind;b.append(icon(kind),el('span',count==null?label:label+' ('+count+')','n7-row-label'),el('span','›','n7-chev'));b.setAttribute('aria-label',count==null?label:label+': '+count);item.append(b);if(detail)item.append(detail);return item;}
 function renderPlace(){if(!info)return;info.replaceChildren();const head=el('div',undefined,'pro-place-heading');const close=button('×',()=>{info.hidden=true;},'pro-close-place');close.setAttribute('aria-label','Κλείσιμο κάρτας τόπου');
  const picture=el('img');picture.src='./assets/reader/mediterranean-harbor.svg';picture.alt='Εικαστική αναπαράσταση μεσογειακού λιμανιού, όχι τεκμήριο για τον επιλεγμένο τόπο';picture.className='n7-place-image';info.append(close,picture);
  const isSaved=saved().includes(selected.id),mark=button('',toggleSaved,'n7-place-save');mark.append(icon('mark'));mark.setAttribute('aria-pressed',String(isSaved));mark.setAttribute('aria-label',isSaved?'Αφαίρεση από τους αποθηκευμένους τόπους':'Αποθήκευση τόπου');head.append(el('h2',selected.name),mark);info.append(head);
  info.append(el('p','Περίοδος αναζήτησης · '+startYear+' – '+endYear,'n7-place-sub'),el('p','Γεωγραφικό σημείο αναφοράς στις '+selected.lat.toFixed(3)+'° Β · '+selected.lon.toFixed(3)+'° Α. Εξουσία & ρόλος: απαιτούν χρονολογημένη πηγή.','n7-place-text'),el('small','Εικαστική αναπαράσταση μεσογειακού λιμανιού.','pro-note'));
  const rows=records(),details=el('details');details.className='n7-sources';details.append(el('summary','Πηγές & τεκμήρια · '+rows.length));
  if(!rows.length)details.append(el('p','Δεν εντοπίστηκε συνδεδεμένη αναφορά για τον τόπο στην επιλεγμένη έρευνα.','pro-note'));
  for(const r of rows.slice(0,8)){const link=safeUrl(r.url||r.source_url),item=el(link?'a':'p',r.title||r.source_title||'Ερευνητική αναφορά');if(link){item.href=link;item.target='_blank';item.rel='noopener noreferrer';}details.append(item,el('small',r.printed_page!=null?'Καταγεγραμμένη σελίδα: '+r.printed_page:'Η σελίδα και η ιστορική τεκμηρίωση χρειάζονται έλεγχο.','pro-note'));}
  const names=[...new Set(selected.aliases.filter(a=>normal(a)!==normal(selected.name)))],nameList=el('p',names.join(' · '),'n7-row-detail');nameList.hidden=true;
  const list=el('ul',undefined,'n7-place-rows');
  list.append(row('sources','Ιστορικές πηγές',rows.length,()=>{details.open=!details.open;},details),row('events','Γεγονότα',null,()=>prepareResearch('events')),row('people','Πρόσωπα',null,()=>prepareResearch('people')),row('names','Σχετικά τοπωνύμια',names.length,()=>{nameList.hidden=!nameList.hidden;},nameList),row('material','Υλικό (χάρτες, εικόνες)',null,()=>prepareResearch('material')));
  info.append(list,button('Ιστορικό πλαίσιο & πρόσωπα →',()=>prepareResearch('context'),'pro-research-place'),el('p','Οι δείκτες δηλώνουν γεωγραφικές θέσεις, όχι επιβεβαιωμένα πειρατικά κέντρα.','pro-note'));

 }
 function select(id,{focus=true}={}){const p=places.find(x=>x.id===id);if(!p)return;selected=p;info.hidden=false;for(const r of places)r.marker.setAttribute('aria-pressed',String(r===p));renderPlace();if(focus){if(window.NABOU_MAP3D?.enabled)window.NABOU_MAP3D.camera({lon:p.lon,lat:p.lat,tilt:window.NABOU_MAP3D.camera().tilt});else{const v=view(),point=project(p.lon,p.lat),host=$('chartView'),targetY=host.clientHeight*(innerWidth<=600?.27:.5);const dx=host.clientWidth/2-(point.x*v.s+v.x),dy=targetY-(point.y*v.s+v.y);const stage=$('chartStage');for(const [delta,positive,negative]of [[dx,'ArrowLeft','ArrowRight'],[dy,'ArrowUp','ArrowDown']])for(let i=0;i<Math.min(60,Math.round(Math.abs(delta)/60));i++)stage.dispatchEvent(new KeyboardEvent('keydown',{key:delta>0?positive:negative,bubbles:true,cancelable:true}));}}if(innerWidth<=900){tools.classList.remove('pro-open');toggle.setAttribute('aria-expanded','false');shell?.dispatchEvent(new CustomEvent('n7:close-layers'));}}
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){tools.classList.remove('pro-open');toggle.setAttribute('aria-expanded','false');info.hidden=true;}});
 window.addEventListener('nabou:map3d',event=>{if(!event.detail?.on)return;for(const p of places){if(p.object3d)continue;const b=button(p.name,()=>select(p.id),'pro-3d-place');b.dataset.place=p.id;p.object3d=b;b.hidden=body.dataset.proPlaces!=='true';window.NABOU_MAP3D?.addObject(b,{lon:p.lon,lat:p.lat,z:1});}});
 import('./live-bridge.js').then(({connectResearchFeed})=>connectResearchFeed({onSnapshot:s=>{snapshot=s;renderPlace();},onReset:()=>{snapshot=null;renderPlace();}})).catch(()=>{snapshot=null;renderPlace();});
 select(selected.id,{focus:false});dateLabel.textContent=startYear+' – '+endYear;
 window.NABOU_PRO_ATLAS={places:places.map(({id,name,lon,lat})=>({id,name,lon,lat})),project,select,view,search:value=>matches(value).map(({id,name})=>({id,name})),prepareResearch,saved,get selected(){return selected.id;}};
})();
