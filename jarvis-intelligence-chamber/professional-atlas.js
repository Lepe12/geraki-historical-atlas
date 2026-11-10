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
 const brand=document.querySelector('#atlasResearch>.atlas-brand');
 if(brand){brand.querySelector('.atlas-n7').textContent='NABOU';brand.querySelector('.atlas-sub').textContent='N7 Historical Atlas';const ship=el('img');ship.src='./assets/nautical/img/ship.png';ship.alt='';ship.className='pro-brand-ship';brand.prepend(ship);}
 const nav=document.querySelector('#atlasResearch>.atlas-topnav');
 if(nav){nav.querySelector('[data-atlas-nav="research"]').textContent='Ιστορική Έρευνα';nav.querySelector('[data-atlas-nav="tools"]').textContent='Βιβλιοθήκη';}
 const tools=el('aside',undefined,'pro-map-tools');tools.id='proMapTools';tools.setAttribute('aria-label','Φίλτρα και τόποι χάρτη');
 const heading=el('div',undefined,'pro-tools-heading');heading.append(el('h2','Επίπεδα'),button('×',()=>{tools.classList.remove('pro-open');toggle.setAttribute('aria-expanded','false');},'pro-mobile-close'));tools.append(heading);
 function check(label,key,on){const box=el('label',undefined,'pro-check');const input=el('input');input.type='checkbox';input.checked=on;input.addEventListener('change',()=>{body.dataset[key]=String(input.checked);for(const p of places)if(p.object3d)p.object3d.hidden=key==='proPlaces'?!input.checked:p.object3d.hidden;});box.append(input,el('span',label));tools.append(box);return input;}
 check('Τόποι & λιμάνια','proPlaces',true);const laneInput=check('Ερευνητές','proLanes',false);check('Ναυτικές γραμμές','proRhumbs',false);
 window.addEventListener('jarvis:focus-agent',()=>{body.dataset.proLanes='true';laneInput.checked=true;});
 const period=el('section',undefined,'pro-period');period.append(el('h2','Χρονολόγηση'));const dateLabel=el('p');
 const from=el('input'),to=el('input');for(const [input,label,value] of [[from,'Από το έτος',1500],[to,'Έως το έτος',1700]]){input.type='range';input.min='1500';input.max='1700';input.step='1';input.value=String(value);input.setAttribute('aria-label',label);period.append(input);}
 function dates(changed){if(+from.value>+to.value){if(changed===from)to.value=from.value;else from.value=to.value;}startYear=+from.value;endYear=+to.value;dateLabel.textContent=startYear+' – '+endYear;renderPlace();}
 from.addEventListener('input',()=>dates(from));to.addEventListener('input',()=>dates(to));period.append(dateLabel,el('p','Περίοδος αναζήτησης · όχι αναπαράσταση πολιτικών συνόρων.','pro-note'));tools.append(period);
 const searchLabel=el('label','Αναζήτηση τόπου','pro-search-label'),search=el('input');search.type='search';search.placeholder='Πόλη ή λιμάνι…';search.setAttribute('aria-label','Αναζήτηση τόπου');searchLabel.append(search);tools.append(searchLabel);
 const results=el('div',undefined,'pro-place-list');results.setAttribute('aria-label','Τόποι αναφοράς');tools.append(results);
 function searchPlaces(){const q=normal(search.value),found=places.filter(p=>normal([p.name,...p.aliases].join(' ')).includes(q));results.replaceChildren();for(const p of found)results.append(button(p.name,()=>select(p.id)));if(!found.length)results.append(el('p','Δεν βρέθηκε τόπος.','pro-note'));}
 search.addEventListener('input',searchPlaces);searchPlaces();document.body.append(tools);
 const toggle=button('☷ Επίπεδα',()=>{const on=tools.classList.toggle('pro-open');toggle.setAttribute('aria-expanded',String(on));},'pro-tools-toggle');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','proMapTools');document.body.append(toggle);
 const info=el('aside',undefined,'pro-place-info');info.id='proPlaceInfo';info.setAttribute('aria-label','Επιλεγμένος τόπος');document.body.append(info);
 const assistant=el('div',undefined,'pro-assistant');const chat=el('a',undefined,'pro-assistant-chat');chat.href='https://bot.piratecartography.com/';chat.target='_blank';chat.rel='noopener noreferrer';chat.append(el('strong','N7 Βοηθός'),el('span','Ερωτήσεις για τόπους, κείμενα και πηγές ↗'));const voice=button('Φωνή',()=>document.dispatchEvent(new CustomEvent('n7:open-voice')),'pro-voice');voice.setAttribute('aria-label','Άνοιγμα φωνής N7');assistant.append(chat,voice);document.body.append(assistant);
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
 function prepareResearch(){const query=$('operatorQuery');if(query){query.value='Ιστορική έρευνα για '+selected.name+', '+startYear+'–'+endYear+'. Βρες χρονολογημένες πηγές για την εξουσία, τον ρόλο του λιμανιού και σχετικά πρόσωπα. Ξεχώρισε τα τεκμήρια από τις υποθέσεις.';query.dispatchEvent(new Event('input',{bubbles:true}));}window.N7_READER?.show('research');query?.focus();}
 function renderPlace(){if(!info)return;info.replaceChildren();const head=el('div',undefined,'pro-place-heading');head.append(el('h2',selected.name),button('×',()=>{info.hidden=true;},'pro-close-place'));info.append(head);
  const picture=el('img');picture.src='./assets/reader/mediterranean-harbor.svg';picture.alt='Εικαστική αναπαράσταση μεσογειακού λιμανιού, όχι τεκμήριο για τον επιλεγμένο τόπο';info.append(picture,el('small','Εικαστική αναπαράσταση μεσογειακού λιμανιού.','pro-note'));
  const facts=el('dl');for(const [key,value] of [['Περίοδος αναζήτησης',startYear+' – '+endYear],['Θέση',selected.lat.toFixed(3)+'° Β · '+selected.lon.toFixed(3)+'° Α'],['Εξουσία & ρόλος','Απαιτούν χρονολογημένη πηγή']]){facts.append(el('dt',key),el('dd',value));}info.append(facts);
  const rows=records(),details=el('details');details.append(el('summary','Πηγές & τεκμήρια · '+rows.length));
  if(!rows.length)details.append(el('p','Δεν εντοπίστηκε συνδεδεμένη αναφορά για τον τόπο στην επιλεγμένη έρευνα.','pro-note'));
  for(const r of rows.slice(0,8)){const link=safeUrl(r.url||r.source_url),item=el(link?'a':'p',r.title||r.source_title||'Ερευνητική αναφορά');if(link){item.href=link;item.target='_blank';item.rel='noopener noreferrer';}details.append(item,el('small',r.printed_page!=null?'Καταγεγραμμένη σελίδα: '+r.printed_page:'Η σελίδα και η ιστορική τεκμηρίωση χρειάζονται έλεγχο.','pro-note'));}
  info.append(details,button('Ιστορικό πλαίσιο & πρόσωπα →',prepareResearch,'pro-research-place'),el('p','Οι δείκτες δηλώνουν γεωγραφικές θέσεις, όχι επιβεβαιωμένα πειρατικά κέντρα.','pro-note'));
 }
 function select(id,{focus=true}={}){const p=places.find(x=>x.id===id);if(!p)return;selected=p;info.hidden=false;for(const r of places)r.marker.setAttribute('aria-pressed',String(r===p));renderPlace();if(focus){if(window.NABOU_MAP3D?.enabled)window.NABOU_MAP3D.camera({lon:p.lon,lat:p.lat,tilt:window.NABOU_MAP3D.camera().tilt});else{const v=view(),point=project(p.lon,p.lat),host=$('chartView'),targetY=host.clientHeight*(innerWidth<=600?.27:.5);const dx=host.clientWidth/2-(point.x*v.s+v.x),dy=targetY-(point.y*v.s+v.y);const stage=$('chartStage');for(const [delta,positive,negative]of [[dx,'ArrowLeft','ArrowRight'],[dy,'ArrowUp','ArrowDown']])for(let i=0;i<Math.min(60,Math.round(Math.abs(delta)/60));i++)stage.dispatchEvent(new KeyboardEvent('keydown',{key:delta>0?positive:negative,bubbles:true,cancelable:true}));}}if(innerWidth<=900){tools.classList.remove('pro-open');toggle.setAttribute('aria-expanded','false');}}
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){tools.classList.remove('pro-open');toggle.setAttribute('aria-expanded','false');info.hidden=true;}});
 window.addEventListener('nabou:map3d',event=>{if(!event.detail?.on)return;for(const p of places){if(p.object3d)continue;const b=button(p.name,()=>select(p.id),'pro-3d-place');b.dataset.place=p.id;p.object3d=b;b.hidden=body.dataset.proPlaces!=='true';window.NABOU_MAP3D?.addObject(b,{lon:p.lon,lat:p.lat,z:1});}});
 import('./live-bridge.js').then(({connectResearchFeed})=>connectResearchFeed({onSnapshot:s=>{snapshot=s;renderPlace();},onReset:()=>{snapshot=null;renderPlace();}})).catch(()=>{snapshot=null;renderPlace();});
 select(selected.id,{focus:false});dateLabel.textContent=startYear+' – '+endYear;
 window.NABOU_PRO_ATLAS={places:places.map(({id,name,lon,lat})=>({id,name,lon,lat})),project,select,get selected(){return selected.id;}};
})();
