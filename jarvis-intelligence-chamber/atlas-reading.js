/* N7 reader navigation: one active internal page, genuine source records. */
(() => {
 'use strict';
 const body=document.body;
 if(!body.classList.contains('atlas-reading'))return;
 const $=id=>document.getElementById(id);
 const overview=$('researchOverview'),drawer=$('resultsDrawer');
 if(!overview||!drawer)return;
 const scroll=()=>drawer.querySelector('.v2-scroll')||drawer;
 let researchFitted=false,mode='research',detailReturn='map',snapshot=null,sourceRows=[],routing=false;
 const shell=view=>document.querySelector('[data-nxs-view="'+view+'"]')?.click();
 const navState=()=>{
  document.querySelectorAll('[data-atlas-nav]').forEach(button=>{
   const active=body.dataset.atlasPage==='home'?'home':mode==='history'?'research':mode==='detail'?detailReturn:mode;
   button.setAttribute('aria-current',button.dataset.atlasNav===active?'page':'false');
  });
 };
 function illustrate(){
  if(!overview.querySelector('.overview-heading')||overview.querySelector('.reader-illustration'))return;
  const figure=document.createElement('figure');figure.className='reader-illustration';
  const img=document.createElement('img');img.src='./assets/reader/mediterranean-harbor.svg';img.alt='Εικαστική απόδοση μεσογειακού λιμανιού με γαλέρες';img.width=1776;img.height=888;img.decoding='async';
  const caption=document.createElement('figcaption');caption.textContent='Εικαστική αναπαράσταση μεσογειακού λιμανιού · Δεν αποτελεί ιστορικό τεκμήριο ή ταύτιση συγκεκριμένου τόπου.';
  figure.append(img,caption);overview.querySelector('.overview-heading').after(figure);
 }
 new MutationObserver(illustrate).observe(overview,{childList:true});illustrate();
 const sourceSection=document.createElement('section');sourceSection.id='readerSources';sourceSection.hidden=true;sourceSection.setAttribute('aria-label','Πηγές της έρευνας');
 const heading=document.createElement('h2');heading.textContent='Πηγές';
 const intro=document.createElement('p');intro.textContent='Βιβλιογραφία του άρθρου και καταγεγραμμένο υλικό της επιλεγμένης έρευνας.';
 const label=document.createElement('label');label.htmlFor='readerSourceSearch';label.textContent='Αναζήτηση στις πηγές';
 const search=document.createElement('input');search.id='readerSourceSearch';search.type='search';search.placeholder='Τίτλος, αρχείο ή συγγραφέας…';
 const list=document.createElement('ol'),empty=document.createElement('p');empty.setAttribute('role','status');
 sourceSection.append(heading,intro,label,search,list,empty);scroll().append(sourceSection);
 const normal=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('el').replace(/ς/g,'σ');
 function safeUrl(value){try{const u=new URL(String(value||''));return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}}
 function renderSources(){
  const terms=normal(search.value).split(/\s+/).filter(Boolean);
  const filtered=sourceRows.filter(row=>terms.every(t=>normal(row.title+' '+row.note+' '+row.url).includes(t)));
  list.replaceChildren();
  for(const row of filtered){
   const li=document.createElement('li'),title=document.createElement(row.url?'a':'span');
   title.textContent=row.title;
   if(row.url){title.href=row.url;title.target='_blank';title.rel='noopener noreferrer';}
   li.append(title);
   if(row.note){const note=document.createElement('small');note.textContent=row.note;li.append(note);}
   list.append(li);
  }
  empty.hidden=filtered.length>0;
  empty.textContent=sourceRows.length?'Δεν βρέθηκαν πηγές για αυτή την αναζήτηση.':snapshot?'Δεν έχουν καταγραφεί πηγές για αυτή την έρευνα.':'Αναμονή φόρτωσης των πηγών της έρευνας…';
 }
 function updateSources(s){
  snapshot=s;const narrative=s?.research_answer?.greek_narrative;
  const rows=[],seen=new Set();
  const add=(title,url,note)=>{
   title=String(title||'').trim();url=safeUrl(url);if(!title&&!url)return;
   const key=normal(title)+'|'+url;if(seen.has(key))return;seen.add(key);rows.push({title:title||url,url,note:String(note||'')});
  };
  for(const row of narrative?.sources||[])add(row.label_el||row.title,row.url||row.source_url,'Βιβλιογραφία ιστορικού άρθρου');
  if(!rows.length&&narrative?.sources_el)add(narrative.sources_el,'','Βιβλιογραφία ιστορικού άρθρου');
  for(const row of s?.discoveries||[])add(row.title||row.source_title||row.citation,row.url||row.source_url,[row.repository,row.author,row.printed_page!=null?'Έντυπη σελίδα '+row.printed_page:'',row.context_excerpt||row.excerpt||'','Ερευνητική εγγραφή · η καταγραφή δεν ισοδυναμεί με ιστορική επιβεβαίωση.'].filter(Boolean).join(' · '));
  sourceRows=rows;renderSources();
 }
 search.addEventListener('input',renderSources);renderSources();
 import('./live-bridge.js').then(({connectResearchFeed})=>connectResearchFeed({
  onSnapshot:updateSources,
  onReset:()=>{snapshot=null;sourceRows=[];search.value='';renderSources();}
 })).catch(()=>{empty.textContent='Οι πηγές δεν είναι διαθέσιμες αυτή τη στιγμή. Δοκιμάστε ανανέωση.';});
 function show(next,{focus=true}={}){
  body.dataset.atlasLanding=String(next==='home');
  if(next==='home')next='map';
  const previous=mode;
  routing=true;
  mode=next;body.dataset.readerView=next;
  sourceSection.hidden=next!=='sources';
  if(next==='home'){
   shell('universe');
   window.NABOU_ATLAS?.setPage('home');
  }else if(next==='map'){
   shell('universe');
   window.NABOU_ATLAS?.setPage('research');
   drawer.classList.add('hidden');
   document.body.classList.remove('nx-no-labels','nx-no-seals','nx-no-routes');
   if(previous!=='map')requestAnimationFrame(()=>{window.dispatchEvent(new Event('resize'));if(!window.NABOU_MAP3D?.enabled)$('resetView')?.click();});
  }else{
   // Close every previous workspace before opening the destination.
   shell('universe');
   window.NABOU_ATLAS?.setPage('research');
   if(next==='agents')shell('agents');
   else if(next==='tools')shell('pdf');
   else{
    shell('findings');
    window.NABOU_ATLAS?.setPage('research',{openDrawer:true});
    scroll().scrollTop=0;
    // The map stays beside «Η έρευνά μου»: refit it to the narrower frame.
    if(!researchFitted||!['research','sources','history'].includes(previous)){researchFitted=true;requestAnimationFrame(()=>{window.dispatchEvent(new Event('resize'));if(!window.NABOU_MAP3D?.enabled)$('resetView')?.click();});}
   }
  }
  if(next==='history'){const history=$('researchHistory');if(history)history.open=true;scroll().scrollTop=0;}
  routing=false;
  navState();
  requestAnimationFrame(()=>{
   navState();
   if(!focus)return;
   if(next==='sources')search.focus({preventScroll:true});
   else if(next==='history')$('historySearch')?.focus({preventScroll:true});
   else if(next==='research')$('operatorQuery')?.focus({preventScroll:true});
   else if(next==='home')$('atlasExplore')?.focus({preventScroll:true});
   else if(next==='map')$('chartStage')?.focus({preventScroll:true});
  });
 }

 const historyButton=document.createElement('button');historyButton.type='button';historyButton.id='readerHistoryOpen';historyButton.textContent='Προηγούμενες έρευνες';
 document.querySelector('.atlas-panel-head')?.append(historyButton);
 historyButton.addEventListener('click',()=>show('history'));
 $('researchHistory')?.addEventListener('click',event=>{if(event.target.closest('[data-history-run]'))setTimeout(()=>show('research',{focus:false}),0);});

 if($('focusButton')){$('focusButton').textContent='Εστίαση στον χάρτη';$('focusButton').setAttribute('aria-label','Εστίαση στον χάρτη');}
 document.querySelectorAll('#atlasResearch .atlas-brand').forEach(el=>{el.setAttribute('role','button');el.tabIndex=0;el.setAttribute('aria-label','N7 · Αρχική σελίδα');});
 $('atlasCloseResearch')?.setAttribute('aria-label','Επιστροφή στον χάρτη');
 document.addEventListener('click',event=>{
  if(event.target.closest('#atlasResearch .atlas-brand')){event.preventDefault();event.stopImmediatePropagation();show('home');return;}
  let target=event.target.closest('button');
  // Transparent poster navigation can retarget a touch to its nav container.
  // Resolve that touch to the nearest visible labelled button.
  if(!target&&event.target.matches('#atlasHome .atlas-topnav')){
   target=[...event.target.querySelectorAll('[data-atlas-nav]')].reduce((best,button)=>{
    const r=button.getBoundingClientRect(),distance=Math.abs(event.clientX-(r.left+r.width/2));
    return !best||distance<best.distance?{button,distance}:best;
   },null)?.button;
  }
  if(!target)return;
  const nav=target.closest('[data-atlas-nav]');
  if(nav){
   const dest=nav.dataset.atlasNav;if(!['map','research','sources','agents','tools'].includes(dest))return;
   event.preventDefault();event.stopImmediatePropagation();show(dest);return;
  }
  if(target.id==='atlasExplore'||target.id==='atlasCloseResearch'){
   event.preventDefault();event.stopImmediatePropagation();show('map');return;
  }
  if(['nxsCloseAgents','closeLearning','nxsCloseActivity'].includes(target.id)){
   event.preventDefault();event.stopImmediatePropagation();show('research');return;
  }
  if(target.id==='focusButton'){
   event.preventDefault();event.stopImmediatePropagation();
   const agent=$('detailPanel')?.dataset.agentId;detailReturn='map';
   show('map',{focus:false});
   requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(agent)window.dispatchEvent(new CustomEvent('jarvis:focus-agent',{detail:{agent_id:agent}}));
    $('closeDetail')?.click();
   }));return;
  }
  if(target.id==='closeDetail'){
   if(routing)return;
   // Let the inspector clear its own state, then return to its parent workspace.
   const back=detailReturn;setTimeout(()=>show(back,{focus:false}),0);return;
  }
  if(target.matches('#nxsAgentGroups [data-agent]'))detailReturn='agents';

 },true);
 document.addEventListener('keydown',event=>{
  if(event.target.closest('#atlasResearch .atlas-brand')&&['Enter',' '].includes(event.key)){event.preventDefault();show('home');return;}
  if(event.key!=='Escape'||body.dataset.atlasPage==='home')return;
  event.preventDefault();event.stopImmediatePropagation();
  const detail=$('detailPanel');
  if(detail&&!detail.classList.contains('hidden')){const back=detailReturn;$('closeDetail')?.click();show(back);}
  else show(mode==='map'?'home':['agents','tools','sources','history'].includes(mode)?'research':'map');
 },true);
 $('operatorCommand')?.addEventListener('submit',()=>show('research',{focus:false}),true);
 // Mirror shell-initiated inspector and close actions in the top navigation.
 new MutationObserver(()=>{
  const detail=$('detailPanel');
  if(detail&&!detail.classList.contains('hidden')&&mode==='map'){detailReturn='map';}
  navState();
 }).observe(body,{attributes:true,attributeFilter:['data-nxs-view','data-atlas-page']});
 // The home image is a welcome page. Its controls open the actual map.
 const frame=document.querySelector('#atlasHome .atlas-home-frame');
 if(frame){
  const clone=frame.cloneNode(false);
  while(frame.firstChild)clone.append(frame.firstChild);
  frame.replaceWith(clone);
  const zoom=document.createElement('div');zoom.className='reader-home-zoom';
  for(const [name,id]of [['Μεγέθυνση χάρτη','zoomIn'],['Σμίκρυνση χάρτη','zoomOut']]){
   const button=document.createElement('button');button.type='button';button.setAttribute('aria-label',name);button.textContent=id==='zoomIn'?'+':'−';
   button.addEventListener('click',()=>{show('map');requestAnimationFrame(()=>requestAnimationFrame(() => $(id)?.click()));});zoom.append(button);
  }
  clone.append(zoom);
 }

 const notice=document.createElement('p');notice.id='readerCommandNotice';notice.setAttribute('role','status');notice.hidden=true;$('atlasResearch')?.append(notice);
 window.addEventListener('jarvis:mission-state',event=>{
  const form=$('operatorCommand'),text=String(event.detail?.state||'');
  const pending=form?.classList.contains('is-pending'),error=form?.classList.contains('is-error');
  notice.hidden=!pending&&!error;
  notice.textContent=error?'Δεν ξεκίνησε η έρευνα. '+(/503/.test(text)?'Ο διακομιστής είναι προσωρινά μη διαθέσιμος. Δοκιμάστε ξανά.':/401|403/.test(text)?'Η σύνδεση με τον διακομιστή χρειάζεται έλεγχο.':'Δοκιμάστε ξανά σε λίγο.'):pending?(/Αποστολή/.test(text)?'Αποστολή ερωτήματος…':'Το ερώτημά σου τρέχει. Τέτοιες έρευνες κρατάνε συνήθως 20–90 λεπτά· η πρόοδος φαίνεται στο «Η έρευνά μου».'):'';
 });
 const title=document.querySelector('title');
 const updateTitle=()=>{if(document.title.includes('NABOU//X'))document.title=document.title.replace('NABOU//X','N7');};
 if(title)new MutationObserver(updateTitle).observe(title,{childList:true,subtree:true});updateTitle();
 window.N7_READER={show};
 const initial=new URLSearchParams(location.search).get('view');
 show(['map','research','sources','agents','tools'].includes(initial)?initial:'home',{focus:false});
 navState();
})();