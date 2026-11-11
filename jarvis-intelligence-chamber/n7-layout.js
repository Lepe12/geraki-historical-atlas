/* N7 atlas layout — owner mockup of 10 Nov 2026.
   Docks the real map (#chartFrame) into the framed centre cell and wires the new top bar, navigation,
   timeline and place card to the existing atlas functions. The top search starts a research question through
   the existing «Η έρευνά μου» form (library first); topics only prepare a query there. */
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

 /* aged parchment chart: the existing map layers restyled in place (no extra panel over the map).
    - relief raster: luminance mapped to a sepia ink ramp, so hills read as shaded relief on paper
    - paper: one generated grain/stain texture inside the chart SVG, multiplied into sea and land
    - portolan rhumb lines (existing layer) shown by default; the Επίπεδα checkbox still toggles them */
 const chart=document.querySelector('#chartPlane svg.chart');
 if(chart&&!$('n7Parchment')){
  const NS='http://www.w3.org/2000/svg';
  const defs=chart.querySelector('defs')||chart.insertBefore(document.createElementNS(NS,'defs'),chart.firstChild);
  const f=document.createElementNS(NS,'filter');f.id='n7Parchment';f.setAttribute('color-interpolation-filters','sRGB');
  f.innerHTML='<feColorMatrix type="matrix" values="0.30 0.59 0.11 0 0  0.30 0.59 0.11 0 0  0.30 0.59 0.11 0 0  0 0 0 1 0"/>'+
   '<feComponentTransfer><feFuncR type="table" tableValues="0.173 0.177 0.181 0.185 0.189 0.193 0.198 0.202 0.206 0.21 0.214 0.219 0.223 0.227 0.231 0.235 0.239 0.244 0.248 0.252 0.256 0.26 0.265 0.269 0.273 0.277 0.281 0.285 0.29 0.294 0.298 0.302 0.306 0.311 0.315 0.319 0.323 0.327 0.332 0.336 0.34 0.344 0.348 0.352 0.357 0.361 0.392 0.424 0.455 0.486 0.518 0.549 0.58 0.612 0.649 0.687 0.725 0.762 0.8 0.82 0.839 0.859 0.878 0.888 0.897 0.906 0.915 0.924 0.933 0.936 0.939 0.942 0.945 0.948 0.951 0.954 0.957 0.96 0.963 0.966 0.969 0.97 0.971 0.972 0.973 0.974 0.975 0.975 0.976 0.977 0.978 0.979 0.98 0.981 0.982 0.983 0.984 0.985 0.986 0.987 0.988"/><feFuncG type="table" tableValues="0.11 0.113 0.116 0.119 0.122 0.125 0.128 0.131 0.134 0.136 0.139 0.142 0.145 0.148 0.151 0.154 0.157 0.16 0.163 0.166 0.169 0.172 0.175 0.178 0.181 0.184 0.187 0.19 0.193 0.196 0.199 0.202 0.205 0.208 0.211 0.214 0.216 0.219 0.222 0.225 0.228 0.231 0.234 0.237 0.24 0.243 0.272 0.3 0.328 0.357 0.385 0.414 0.442 0.471 0.513 0.555 0.598 0.64 0.682 0.71 0.737 0.765 0.792 0.805 0.818 0.831 0.844 0.858 0.871 0.875 0.88 0.884 0.889 0.893 0.898 0.903 0.907 0.912 0.916 0.921 0.925 0.927 0.929 0.93 0.932 0.933 0.935 0.936 0.938 0.94 0.941 0.943 0.944 0.946 0.947 0.949 0.951 0.952 0.954 0.955 0.957"/><feFuncB type="table" tableValues="0.047 0.049 0.051 0.052 0.054 0.056 0.058 0.059 0.061 0.063 0.064 0.066 0.068 0.07 0.071 0.073 0.075 0.077 0.078 0.08 0.082 0.084 0.085 0.087 0.089 0.091 0.092 0.094 0.096 0.098 0.099 0.101 0.103 0.105 0.106 0.108 0.11 0.112 0.113 0.115 0.117 0.119 0.12 0.122 0.124 0.125 0.146 0.167 0.187 0.208 0.228 0.249 0.27 0.29 0.329 0.369 0.408 0.447 0.486 0.518 0.549 0.58 0.612 0.629 0.646 0.663 0.68 0.697 0.714 0.721 0.728 0.735 0.742 0.75 0.757 0.764 0.771 0.778 0.786 0.793 0.8 0.803 0.806 0.809 0.813 0.816 0.819 0.822 0.825 0.828 0.831 0.835 0.838 0.841 0.844 0.847 0.85 0.853 0.856 0.86 0.863"/></feComponentTransfer>';
  defs.append(f);
  const sea=$('proSea');if(sea){const s=sea.querySelectorAll('stop');s[0]?.setAttribute('stop-color','#3a564e');s[1]?.setAttribute('stop-color','#223c38');}
  const paper=document.createElementNS(NS,'image');paper.setAttribute('class','n7-paper');paper.setAttribute('aria-hidden','true');
  const vb=(chart.getAttribute('viewBox')||'0 0 1800 1105').split(/\s+/).map(Number);
  paper.setAttribute('x',vb[0]);paper.setAttribute('y',vb[1]);paper.setAttribute('width',vb[2]);paper.setAttribute('height',vb[3]);paper.setAttribute('preserveAspectRatio','none');
  const coast=chart.querySelector('.coast');
  const after=chart.querySelector('.layer-labels')||coast?.nextSibling;
  (coast?.parentNode||chart).insertBefore(paper,after||null);
  try{paper.setAttribute('href',paperTexture(1200,736));const sheen=paper.cloneNode();sheen.setAttribute('class','n7-paper n7-paper-sheen');paper.after(sheen);}catch{paper.remove();}
  const greek=[['Αδριατική',15.4,43.1,36],['Τυρρηνικό Πέλαγος',12.4,39.7,0],['Ιόνιο Πέλαγος',18.6,37.4,0],['Αιγαίο',25.0,38.9,0],['Λιβυκό Πέλαγος',24.5,33.6,0]];
  const a=atlas(),labels=chart.querySelector('.pro-map-labels');
  if(a?.project&&labels)for(const [text,lon,lat,turn] of greek){const p=a.project(lon,lat),t=document.createElementNS(NS,'text');t.setAttribute('x',p.x);t.setAttribute('y',p.y);if(turn)t.setAttribute('transform','rotate('+turn+' '+p.x+' '+p.y+')');t.setAttribute('text-anchor','middle');t.setAttribute('class','pro-sea-label n7-sea-minor');t.textContent=text;labels.append(t);}
  if(body.dataset.proRhumbs==='false'){body.dataset.proRhumbs='true';const box=[...document.querySelectorAll('#proMapTools .pro-check')].find(l=>/Ναυτικές γραμμές/.test(l.textContent))?.querySelector('input');if(box)box.checked=true;}
 }
 /* paper grain and foxing: a few octaves of smoothed noise, warm tones, generated once */
 function paperTexture(w,h){
  const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');
  g.fillStyle='#f4e7c8';g.fillRect(0,0,w,h);
  let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
  const octave=(cw,ch,alpha,dark,light)=>{const n=document.createElement('canvas');n.width=cw;n.height=ch;const x=n.getContext('2d'),d=x.createImageData(cw,ch);
   for(let i=0;i<d.data.length;i+=4){const v=rnd(),col=v<.5?dark:light,k=Math.abs(v-.5)*2;d.data[i]=col[0];d.data[i+1]=col[1];d.data[i+2]=col[2];d.data[i+3]=Math.round(255*alpha*k);}
   x.putImageData(d,0,0);g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(n,0,0,w,h);};
  octave(9,6,.55,[150,104,52],[255,246,220]);
  octave(28,17,.38,[140,94,46],[255,244,214]);
  octave(90,55,.22,[120,82,40],[255,248,226]);
  octave(360,221,.16,[110,76,40],[255,250,232]);
  const grain=g.getImageData(0,0,w,h);for(let i=0;i<grain.data.length;i+=4){const v=(rnd()-.5)*26;grain.data[i]+=v;grain.data[i+1]+=v;grain.data[i+2]+=v*.8;}g.putImageData(grain,0,0);
  for(let i=0;i<14;i++){const x=rnd()*w,y=rnd()*h,r=20+rnd()*90,s=g.createRadialGradient(x,y,r*.2,x,y,r);s.addColorStop(0,'rgba(150,100,45,.10)');s.addColorStop(.8,'rgba(150,100,45,.16)');s.addColorStop(1,'rgba(150,100,45,0)');g.fillStyle=s;g.fillRect(x-r,y-r,2*r,2*r);}
  return c.toDataURL('image/jpeg',.86);
 }

 /* compass rose, longitude axis and fullscreen — inside the map frame, at its edges */
 if(view){
  const rose=document.createElementNS('http://www.w3.org/2000/svg','svg');rose.setAttribute('viewBox','-50 -50 100 100');rose.setAttribute('class','n7-compass');rose.setAttribute('aria-hidden','true');
  rose.innerHTML='<circle r="30" fill="none" stroke="#e8e2cf" stroke-opacity=".55"/><circle r="22" fill="none" stroke="#e8e2cf" stroke-opacity=".35" stroke-dasharray="1 2"/>'+
   '<path d="M0-40 6-6 0 0Z" fill="#efe6cc"/><path d="M0-40-6-6 0 0Z" fill="#9c8a62"/><path d="M0 40-6 6 0 0Z" fill="#efe6cc"/><path d="M0 40 6 6 0 0Z" fill="#9c8a62"/>'+
   '<path d="M40 0 6 6 0 0Z" fill="#efe6cc"/><path d="M40 0 6-6 0 0Z" fill="#9c8a62"/><path d="M-40 0-6-6 0 0Z" fill="#efe6cc"/><path d="M-40 0-6 6 0 0Z" fill="#9c8a62"/>'+
   '<path d="M0-22 3-3 22 0 3 3 0 22-3 3-22 0-3-3Z" transform="rotate(45)" fill="#c9b98f" fill-opacity=".7"/><circle r="2.5" fill="#2b2418"/>'+
   '<g font-family="Georgia,serif" font-size="11" fill="#f1ead7" text-anchor="middle"><text y="-43">Β</text><text y="51">Ν</text><text x="-47" y="4">Δ</text><text x="47" y="4">Α</text></g>';
  view.append(rose);
  const axis=document.createElement('div');axis.className='n7-lon-axis';axis.setAttribute('aria-hidden','true');view.append(axis);
  const plane=$('chartPlane');
  const transform=()=>{const m=/translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/.exec(plane?.style.transform||'');return m?{x:+m[1],y:+m[2],s:+m[3]}:{x:0,y:0,s:1};};
  let axisQueued=false;
  function drawAxis(){axisQueued=false;const a=atlas();if(!a||!plane)return;const v=transform(),w=view.clientWidth,out=[];
   const x0=a.project(0,36).x,x5=a.project(5,36).x,step=Math.abs((x5-x0)*v.s)<70?10:5;
   for(let lon=-20;lon<=45;lon+=step){const x=a.project(lon,36).x*v.s+v.x;if(x<40||x>w-40)continue;const s=document.createElement('span');s.style.left=x+'px';s.textContent=Math.abs(lon)+'° '+(lon<0?'Δ':'Α');out.push(s);}
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

 /* ---- 4. top search (Ctrl+K): a place name selects the place; a question starts the research (library first).
    Topics still only prepare a question in the research form. ---- */
 const search=$('n7Search'),results=$('n7SearchResults');
 function prepare(text){const q=$('operatorQuery');if(!q)return;q.value=text.slice(0,500);q.dispatchEvent(new Event('input',{bubbles:true}));reader()?.show('research');requestAnimationFrame(()=>q.focus({preventScroll:true}));}
 /* The question goes through the same form and submit as «Η έρευνά μου» (operator-command.js → library first,
    the long run only if the library is not enough). Nothing new is sent from here. */
 function ask(text){const q=$('operatorQuery'),form=$('operatorCommand');if(!q||!form){prepare(text);return;}
  q.value=text.slice(0,500);q.dispatchEvent(new Event('input',{bubbles:true}));reader()?.show('research',{focus:false});
  if(typeof form.requestSubmit==='function')form.requestSubmit();else $('executeQuery')?.click();}
 const years=()=>{const r=[...document.querySelectorAll('#n7TimelineRange input')].map(i=>+i.value);return r.length===2?r[0]+'–'+r[1]:'1500–1700';};
 let options=[],active=-1;
 function closeResults(){results.hidden=true;search.setAttribute('aria-expanded','false');active=-1;}
 function choose(o){closeResults();if(o.place){toMap();atlas()?.select(o.place);search.value='';}else if(o.ask){search.value='';search.blur();ask(o.ask);}else prepare(o.query);}
 function renderResults(){
  const q=search.value.trim();options=[];
  if(q){const places=(atlas()?.search(q)||[]).slice(0,8).map(p=>({label:p.name,hint:'Τόπος στον χάρτη',place:p.id}));const question={label:'Έρευνα: «'+q+'»',hint:q.length<3?'γράψε λίγο περισσότερο':'ξεκινά την έρευνα, πρώτα στη βιβλιοθήκη',ask:q};
   // One word may be a place; a longer text is a question, so Enter starts the research.
   options=/\s/.test(q)?[question,...places]:[...places,question];}
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


 /* ---- 8. one foreground dialog, and Esc closes it (Nov 2026 UX fixes) ----
    Runs on window in the capture phase, before the older document-level Esc handlers (atlas-reading.js jumps between
    pages, nabou-shell.js reopens the universe, professional-atlas.js used to hide the place card). Order: help dialog,
    voice (N7), settings / layers popover, the Επίπεδα panel, the docked story panel, the old research workspaces
    (PDF, agents, results, details), then any non-map page → back to the map. On the plain map Esc does nothing. */
 const voiceEl=()=>$('nabouAssistant'),popEl=()=>$('nxPopover');
 const voiceOpen=()=>{const v=voiceEl();return !!v&&!v.hidden;};
 const closeVoice=()=>{if(voiceOpen())voiceEl().querySelector('.nxa-x')?.click();};
 const popOpen=()=>{const p=popEl();return !!p&&!p.hidden;};
 const closePop=()=>{const p=popEl();if(!p||p.hidden)return;const x=p.querySelector('.close');if(x)x.click();else p.hidden=true;};
 const shown=el=>!!el&&!el.hidden&&!el.classList.contains('hidden')&&getComputedStyle(el).display!=='none';
 const LEGACY=['detailPanel','learningPanel','activityStrip','nxsAgentsPage','resultsDrawer'];
 const closeLegacy=()=>{let any=false;const disc=$('discoveryDetail');if(shown(disc)){$('closeDiscovery')?.click();any=true;}
  for(const id of LEGACY){const el=$(id);if(shown(el)){(el.querySelector('.v2-x')||el.querySelector('[id^=close]'))?.click();any=true;}}return any;};
 const offMap=()=>body.dataset.readerView&&body.dataset.readerView!=='map';
 function closeDialogs(except){
  if(except!=='help'&&help?.open)help.close();
  if(except!=='voice')closeVoice();
  if(except!=='settings')closePop();
  // the PDF and agents workspaces are full dialogs of their own: leave them for the map before another dialog opens
  if(except&&['tools','agents'].includes(body.dataset.readerView)){closeLegacy();toMap();}
 }
 window.addEventListener('keydown',e=>{
  if(e.key!=='Escape'||e.defaultPrevented)return;
  if(document.activeElement===search||!$('n7SavedMenu')?.hidden)return; // handled above (search / saved places)
  const story=$('narrativeStoryPanel');
  let done=true;
  if(help?.open)help.close();
  else if(voiceOpen())closeVoice();
  else if(popOpen())closePop();
  else if(layers&&!layers.hidden)setLayers(false);
  else if(story&&!story.hidden&&story.parentElement===shell)story.querySelector('#nspClose')?.click();
  else if(closeLegacy()){if(offMap())toMap();}
  else if(offMap())toMap();
  else done=false;
  // never fall through to the old handlers: on the map Esc must not hide the place card or switch pages
  e.preventDefault();e.stopImmediatePropagation();
  if(done)requestAnimationFrame(()=>{const f=document.activeElement;if(!f||f===body)$('n7MapSlot')?.querySelector('.map3d-gl,#chartStage')?.focus?.({preventScroll:true});});
 },true);
 // opening one dialog closes the others (Βοήθεια, Ρυθμίσεις, Φωνή, Δεδομένα/PDF…)
 shell.addEventListener('click',e=>{
  const t=e.target.closest('[data-n7-nav="help"],[data-nx-go="settings"],.pro-voice,[data-atlas-nav],[data-nx-go]');if(!t)return;
  if(t.matches('[data-n7-nav="help"]'))closeDialogs('help');
  else if(t.matches('[data-nx-go="settings"]'))closeDialogs('settings');
  else if(t.matches('.pro-voice'))closeDialogs('voice');
  else{closeVoice();closePop();}
 },true);
 // Ρυθμίσεις: the old popover was placed for the old side menu and opened mostly off-screen; pin it fully on-screen
 const pop=popEl();
 if(pop){
  // it lived inside the fixed #viewport (its own stacking context, below #n7Shell), so it was hidden behind the map
  if(pop.parentElement!==body)body.append(pop);
  const place=()=>{if(pop.hidden)return;const r=pop.getBoundingClientRect(),w=r.width||380,h=r.height||300,gap=10;
   const anchor=shell.querySelector(`.n7-nav [data-nx-go="${pop.dataset.kind}"]`)||shell.querySelector('.n7-nav');
   let x=gap,y=80;
   if(anchor&&innerWidth>900){const a=anchor.getBoundingClientRect();x=a.right+gap;y=a.bottom-h;}
   x=Math.max(gap,Math.min(x,innerWidth-w-gap));y=Math.max(gap,Math.min(y,innerHeight-h-gap));
   pop.style.setProperty('left',Math.round(x)+'px','important');pop.style.setProperty('top',Math.round(y)+'px','important');
   pop.style.setProperty('right','auto','important');pop.style.setProperty('bottom','auto','important');};
  new MutationObserver(()=>requestAnimationFrame(place)).observe(pop,{attributes:true,attributeFilter:['hidden','data-kind']});
  window.addEventListener('resize',()=>requestAnimationFrame(place));
 }

 window.N7_LAYOUT={setLayers,prepare,ask,closeDialogs};
})();
