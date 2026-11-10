/* N7 atlas layout — owner mockup of 10 Nov 2026.
   Docks the real map (#chartFrame) into the framed centre cell and wires the new top bar, navigation,
   timeline and place card to the existing atlas functions. No research is dispatched from here:
   search and topics only prepare a query in the existing research form. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id),body=document.body,shell=$('n7Shell');
 if(!shell)return;
 const atlas=()=>window.NABOU_PRO_ATLAS,reader=()=>window.N7_READER;
 const pin=(el,props)=>{if(el)for(const [k,v] of Object.entries(props))el.style.setProperty(k,v,'important');};

 /* ---- 1. the real map, framed in its own grid cell ---- */
 const slot=$('n7MapSlot'),frame=$('chartFrame'),view=$('chartView');
 if(slot&&frame){
  if(frame.parentElement!==slot)slot.append(frame);
  const fill={position:'absolute',top:'0',left:'0',right:'0',bottom:'0',inset:'0',width:'100%',height:'100%','min-height':'0','max-width':'none','max-height':'none',margin:'0',transform:'none',border:'0','border-radius':'0','box-shadow':'none'};
  pin(frame,fill);pin(view,fill);
  let queued=false;
  new ResizeObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;window.dispatchEvent(new Event('resize'));});}).observe(slot);
 }

 /* parchment land: an SVG colour matrix on the existing relief raster */
 const chart=document.querySelector('#chartPlane svg.chart');
 if(chart&&!$('n7Parchment')){
  const defs=chart.querySelector('defs')||chart.insertBefore(document.createElementNS('http://www.w3.org/2000/svg','defs'),chart.firstChild);
  const f=document.createElementNS('http://www.w3.org/2000/svg','filter');f.id='n7Parchment';f.setAttribute('color-interpolation-filters','sRGB');
  f.innerHTML='<feColorMatrix type="matrix" values="0.40 0.33 0.07 0 0.02  0.30 0.26 0.06 0 0.015  0.17 0.15 0.045 0 0.01  0 0 0 1 0"/><feComponentTransfer><feFuncR type="gamma" exponent="1.15"/><feFuncG type="gamma" exponent="1.25"/><feFuncB type="gamma" exponent="1.4"/></feComponentTransfer>';
  defs.append(f);
  const sea=$('proSea');if(sea){const s=sea.querySelectorAll('stop');s[0]?.setAttribute('stop-color','#0f3d47');s[1]?.setAttribute('stop-color','#082a33');}
 }

 /* compass rose, longitude axis and fullscreen — inside the map frame, at its edges */
 if(view){
  const rose=document.createElementNS('http://www.w3.org/2000/svg','svg');rose.setAttribute('viewBox','-50 -50 100 100');rose.setAttribute('class','n7-compass');rose.setAttribute('aria-hidden','true');
  rose.innerHTML='<circle r="30" fill="none" stroke="#e8e2cf" stroke-opacity=".55"/><circle r="22" fill="none" stroke="#e8e2cf" stroke-opacity=".35" stroke-dasharray="1 2"/>'+
   '<path d="M0-40 6-6 0 0Z" fill="#efe6cc"/><path d="M0-40-6-6 0 0Z" fill="#9c8a62"/><path d="M0 40-6 6 0 0Z" fill="#efe6cc"/><path d="M0 40 6 6 0 0Z" fill="#9c8a62"/>'+
   '<path d="M40 0 6 6 0 0Z" fill="#efe6cc"/><path d="M40 0 6-6 0 0Z" fill="#9c8a62"/><path d="M-40 0-6-6 0 0Z" fill="#efe6cc"/><path d="M-40 0-6 6 0 0Z" fill="#9c8a62"/>'+
   '<path d="M0-22 3-3 22 0 3 3 0 22-3 3-22 0-3-3Z" transform="rotate(45)" fill="#c9b98f" fill-opacity=".7"/><circle r="2.5" fill="#2b2418"/>'+
   '<g font-family="Georgia,serif" font-size="11" fill="#f1ead7" text-anchor="middle"><text y="-43">N</text><text y="51">S</text><text x="-47" y="4">W</text><text x="47" y="4">E</text></g>';
  view.append(rose);
  const axis=document.createElement('div');axis.className='n7-lon-axis';axis.setAttribute('aria-hidden','true');view.append(axis);
  const plane=$('chartPlane');
  const transform=()=>{const m=/translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/.exec(plane?.style.transform||'');return m?{x:+m[1],y:+m[2],s:+m[3]}:{x:0,y:0,s:1};};
  let axisQueued=false;
  function drawAxis(){axisQueued=false;const a=atlas();if(!a||!plane)return;const v=transform(),w=view.clientWidth,out=[];
   const x0=a.project(0,36).x,x5=a.project(5,36).x,step=Math.abs((x5-x0)*v.s)<70?10:5;
   for(let lon=-20;lon<=45;lon+=step){const x=a.project(lon,36).x*v.s+v.x;if(x<40||x>w-40)continue;const s=document.createElement('span');s.style.left=x+'px';s.textContent=Math.abs(lon)+'° '+(lon<0?'W':'E');out.push(s);}
   axis.replaceChildren(...out);}
  // Coordinates readout: the pointer position (existing chamber.js handler); the map centre when the pointer is elsewhere.
  const coords=$('coordinates');let hovering=false;
  $('chartStage')?.addEventListener('pointerenter',()=>{hovering=true;});$('chartStage')?.addEventListener('pointerleave',()=>{hovering=false;drawCentre();});
  function drawCentre(){const C=window.NABOU_CHART;if(!coords||!C||hovering||window.NABOU_MAP3D?.enabled)return;const v=transform(),x=(view.clientWidth/2-v.x)/v.s,y=(view.clientHeight/2-v.y)/v.s;
   const lon=x/C.k+C.lon0,lat=(2*Math.atan(Math.exp((C.my1-y/C.k)*Math.PI/180))-Math.PI/2)*180/Math.PI;if(!Number.isFinite(lon)||!Number.isFinite(lat))return;
   coords.textContent=Math.abs(lat).toFixed(2)+'° '+(lat>=0?'Β':'Ν')+' · '+Math.abs(lon).toFixed(2)+'° '+(lon>=0?'Α':'Δ');}
  const queueAxis=()=>{if(!axisQueued){axisQueued=true;requestAnimationFrame(()=>{drawAxis();drawCentre();});}};
  if(plane)new MutationObserver(queueAxis).observe(plane,{attributes:true,attributeFilter:['style']});
  window.addEventListener('resize',queueAxis);setTimeout(queueAxis,0);
  const tools=view.querySelector('.nxs-3d-tools');
  if(tools&&!$('n7Fullscreen')&&document.fullscreenEnabled!==false){
   const fs=document.createElement('button');fs.type='button';fs.id='n7Fullscreen';fs.setAttribute('aria-label','Πλήρης οθόνη χάρτη');fs.title='Πλήρης οθόνη';
   fs.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>';
   fs.addEventListener('click',()=>{if(document.fullscreenElement)document.exitFullscreen?.();else slot?.requestFullscreen?.().catch(()=>{});});
   tools.append(fs);
  }
 }

 /* ---- 2. place card: open / collapse ---- */
 const card=$('proPlaceInfo'),tab=$('n7CardTab');
 function syncCard(){const open=!card.hidden;shell.dataset.card=open?'open':'closed';tab.textContent=open?'›':'‹';tab.setAttribute('aria-expanded',String(open));tab.setAttribute('aria-label',open?'Απόκρυψη κάρτας τόπου':'Εμφάνιση κάρτας τόπου');}
 if(card&&tab){new MutationObserver(syncCard).observe(card,{attributes:true,attributeFilter:['hidden']});tab.addEventListener('click',()=>{card.hidden=!card.hidden;});
  // On phones the map keeps the screen; the card opens when a place is tapped.
  if(matchMedia('(max-width:900px)').matches)card.hidden=true;syncCard();}

 /* the existing story panel (Πρόσωπα / Γεγονότα) opens in the right column, in place of the place card */
 function dockStory(){const story=$('narrativeStoryPanel');if(story&&story.parentElement!==shell){shell.append(story);story.classList.add('n7-story');}}
 const stage=$('stage');if(stage)new MutationObserver(dockStory).observe(stage,{childList:true});dockStory();

 /* ---- 3. navigation ---- */
 const layers=$('n7Layers'),layersBtn=shell.querySelector('[data-n7-nav="layers"]');
 function setLayers(open){if(!layers)return;layers.hidden=!open;shell.dataset.layers=open?'open':'closed';layersBtn?.setAttribute('aria-expanded',String(open));}
 shell.addEventListener('n7:close-layers',()=>setLayers(false));
 const toMap=()=>{if(body.dataset.readerView!=='map')reader()?.show('map',{focus:false});};
 const help=$('n7Help');
 shell.addEventListener('click',event=>{
  const b=event.target.closest('[data-n7-nav]');if(!b)return;
  const what=b.dataset.n7Nav;
  if(what==='home'){reader()?.show('home',{focus:false});setLayers(false);requestAnimationFrame(()=>$('resetView')?.click());}
  else if(what==='layers'){toMap();setLayers(layers?.hidden);}
  else if(what==='timeline'){toMap();requestAnimationFrame(()=>document.querySelector('#n7TimelineRange input')?.focus());}
  else if(what==='help'){help?.showModal?.();}
  else if(what==='activity'){reader()?.show('research',{focus:false});requestAnimationFrame(()=>document.querySelector('.nxs-activity-open')?.click());}
  else if(what==='collapse'){const c=shell.dataset.nav!=='collapsed';shell.dataset.nav=c?'collapsed':'open';b.textContent=c?'»':'«';b.setAttribute('aria-expanded',String(!c));b.setAttribute('aria-label',c?'Ανάπτυξη μενού':'Σύμπτυξη μενού');}
 });
 // Αρχική is the current item on the landing map; the reader marks the other items.
 const homeBtn=shell.querySelector('.n7-nav [data-n7-nav="home"]');
 function markHome(){const landing=body.dataset.atlasLanding==='true'&&body.dataset.readerView==='map';homeBtn?.setAttribute('aria-current',landing?'page':'false');if(landing)shell.querySelector('.n7-nav [data-atlas-nav="map"]')?.setAttribute('aria-current','false');}
 new MutationObserver(()=>requestAnimationFrame(markHome)).observe(body,{attributes:true,attributeFilter:['data-atlas-landing','data-reader-view','data-nxs-view','data-atlas-page']});
 markHome();setTimeout(markHome,300);

 /* ---- 4. search (Ctrl+K) and topics: places first, otherwise a prepared research question ---- */
 const search=$('n7Search'),results=$('n7SearchResults');
 function prepare(text){const q=$('operatorQuery');if(!q)return;q.value=text.slice(0,500);q.dispatchEvent(new Event('input',{bubbles:true}));reader()?.show('research');requestAnimationFrame(()=>q.focus({preventScroll:true}));}
 const years=()=>{const r=[...document.querySelectorAll('#n7TimelineRange input')].map(i=>+i.value);return r.length===2?r[0]+'–'+r[1]:'1500–1700';};
 let options=[],active=-1;
 function closeResults(){results.hidden=true;search.setAttribute('aria-expanded','false');active=-1;}
 function choose(o){closeResults();if(o.place){toMap();atlas()?.select(o.place);search.value='';}else prepare(o.query);}
 function renderResults(){
  const q=search.value.trim();options=[];
  if(q){for(const p of (atlas()?.search(q)||[]).slice(0,8))options.push({label:p.name,hint:'Τόπος στον χάρτη',place:p.id});options.push({label:'«'+q+'»',hint:'Ετοιμάστε ερώτημα στην Έρευνα · δεν στέλνεται αυτόματα',query:q+' ('+years()+'). Δώσε πηγές και ξεχώρισε τα τεκμήρια από τις υποθέσεις.'});}
  results.replaceChildren(...options.map((o,i)=>{const b=document.createElement('button');b.type='button';b.setAttribute('role','option');b.setAttribute('aria-selected',String(i===active));b.append(o.label);const s=document.createElement('small');s.textContent=' · '+o.hint;b.append(s);b.addEventListener('mousedown',e=>e.preventDefault());b.addEventListener('click',()=>choose(o));return b;}));
  results.hidden=!options.length;search.setAttribute('aria-expanded',String(!!options.length));
 }
 if(search&&results){
  search.addEventListener('input',()=>{active=-1;renderResults();});
  search.addEventListener('focus',renderResults);
  search.addEventListener('blur',()=>setTimeout(closeResults,120));
  search.addEventListener('keydown',e=>{
   if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!options.length)return;active=(active+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;renderResults();}
   else if(e.key==='Enter'){e.preventDefault();const o=options[active>=0?active:0];if(o)choose(o);}
  });
 }
 window.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='k'){e.preventDefault();e.stopPropagation();search?.focus();search?.select();return;}
  if(e.key==='Escape'&&(document.activeElement===search||!$('n7SavedMenu')?.hidden)){e.stopPropagation();closeResults();closeSaved();search?.blur();}
 },true);
 shell.querySelectorAll('[data-n7-topic]').forEach(b=>b.addEventListener('click',()=>prepare(b.dataset.n7Topic+', '+years()+'. Δώσε χρονολογημένες πηγές, πρόσωπα και τόπους, και ξεχώρισε τα τεκμήρια από τις υποθέσεις.')));

 /* ---- 5. saved places (bookmark) ---- */
 const savedBtn=$('n7SavedBtn'),savedMenu=$('n7SavedMenu');
 function closeSaved(){if(savedMenu){savedMenu.hidden=true;savedBtn?.setAttribute('aria-expanded','false');}}
 function renderSaved(){const a=atlas(),ids=a?.saved?.()||[];savedMenu.replaceChildren();
  if(!ids.length){const p=document.createElement('p');p.textContent='Δεν έχετε αποθηκεύσει τόπους. Πατήστε το σημάδι στην κάρτα ενός τόπου.';savedMenu.append(p);return;}
  for(const id of ids){const place=a.places.find(p=>p.id===id);if(!place)continue;const b=document.createElement('button');b.type='button';b.textContent=place.name;b.addEventListener('click',()=>{closeSaved();toMap();a.select(id);});savedMenu.append(b);}}
 savedBtn?.addEventListener('click',()=>{const open=savedMenu.hidden;if(open)renderSaved();savedMenu.hidden=!open;savedBtn.setAttribute('aria-expanded',String(open));});
 document.addEventListener('click',e=>{if(savedMenu&&!savedMenu.hidden&&!e.target.closest('#n7SavedMenu,#n7SavedBtn'))closeSaved();});
 document.addEventListener('n7:saved-places',()=>{if(!savedMenu.hidden)renderSaved();});

 /* ---- 6. timeline: the existing year inputs (Από / Έως) as one dual slider ---- */
 const range=$('n7TimelineRange'),[from,to]=range?[...range.querySelectorAll('input[type=range]')]:[];
 const prev=$('n7Prev'),next=$('n7Next'),play=$('n7Play');
 const set=(input,value)=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));};
 function paint(){if(!from||!to)return;const lo=+from.min,hi=+from.max,span=hi-lo;range.style.setProperty('--n7-from',((+from.value-lo)/span*100)+'%');range.style.setProperty('--n7-to',((hi-+to.value)/span*100)+'%');prev.disabled=+from.value<=lo;next.disabled=+to.value>=hi;from.style.zIndex=+from.value>hi-10?'3':'2';}
 function shift(by){const w=+to.value-+from.value,lo=+from.min,hi=+from.max;let a=Math.min(Math.max(+from.value+by,lo),hi-w);set(to,a+w);set(from,a);if(+to.value!==a+w)set(to,a+w);paint();}
 let timer=null;
 function stop(){clearInterval(timer);timer=null;play.setAttribute('aria-pressed','false');play.setAttribute('aria-label','Αναπαραγωγή χρονολογίου');play.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>';}
 if(from&&to){
  from.addEventListener('input',paint);to.addEventListener('input',paint);paint();
  prev.addEventListener('click',()=>shift(-25));next.addEventListener('click',()=>shift(25));
  play.addEventListener('click',()=>{
   if(timer){stop();return;}
   const lo=+from.min,hi=+from.max;let w=+to.value-+from.value;if(w>=hi-lo)w=25;
   let start=+from.value;if(start+w>=hi)start=lo;set(to,start+w);set(from,start);paint();
   play.setAttribute('aria-pressed','true');play.setAttribute('aria-label','Παύση χρονολογίου');play.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';
   timer=setInterval(()=>{const a=+from.value+5;if(a+w>hi){stop();return;}set(to,a+w);set(from,a);paint();},700);
  });
 }

 /* ---- 7. assistant capsule: the existing N7 chat link and voice ---- */
 shell.querySelector('.n7-assistant .pro-voice')?.addEventListener('click',()=>document.dispatchEvent(new CustomEvent('n7:open-voice')));

 window.N7_LAYOUT={setLayers,prepare};
})();
