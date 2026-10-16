/* Progressive Command Deck controls; preserves existing research and renderer handlers. */
(() => {
 const $=id=>document.getElementById(id);
 const app=$('app'), panel=document.querySelector('.left-panel'), activity=$('activityStrip');
 if(!app||!panel||!activity)return;
 const controls=document.createElement('nav');controls.className='deck-controls';controls.setAttribute('aria-label','Research Universe workspace controls');
 function add(label,id,expanded,handler){
  const b=document.createElement('button');b.type='button';b.id=id;b.className='deck-control';b.textContent=label;b.setAttribute('aria-expanded',String(expanded));b.addEventListener('click',handler);controls.appendChild(b);return b;
 }
 function setNav(open){document.body.classList.toggle('deck-nav-closed',!open);nav.setAttribute('aria-expanded',String(open));nav.textContent=open?'◧ CLOSE NAV':'◧ EXPLORE'}
 function setActivity(open){activity.classList.toggle('deck-expanded',open);activityBtn.setAttribute('aria-expanded',String(open));activityBtn.textContent=open?'◷ HIDE FEED':'◷ LIVE FEED';if(open)activity.classList.remove('is-idle')}
 const nav=add('◧ EXPLORE','deckNav',true,()=>setNav(document.body.classList.contains('deck-nav-closed')));
 const activityBtn=add('◷ LIVE FEED','deckActivity',false,()=>setActivity(!activity.classList.contains('deck-expanded')));
 add('⌖ RESET VIEW','deckReset',false,()=>$('resetView')?.click());
 app.appendChild(controls);

 // Search real sectors and focus them in the existing animated research map.
 const finder=document.createElement('section');finder.className='deck-finder';finder.hidden=true;finder.setAttribute('aria-label','Find research sector');
 finder.innerHTML='<label for="deckFindInput">FIND RESEARCH SECTOR</label><input id="deckFindInput" type="search" autocomplete="off" placeholder="Venice, Greece, contradictions…" aria-label="Search research sectors"><div class="deck-find-results" id="deckFindResults" role="listbox"></div>';
 const searchButton=add('⌕ FIND NODE','deckFindButton',false,()=>toggleFinder(finder.hidden));
 function toggleFinder(open){finder.hidden=!open;searchButton.setAttribute('aria-expanded',String(open));if(open){populateFinder();finder.querySelector('input').focus()}}
 function populateFinder(){
  const input=finder.querySelector('input'),results=finder.querySelector('#deckFindResults'),term=input.value.trim().toLocaleLowerCase();
  results.replaceChildren();
  const sectors=(window.__nabouSectors||[]).filter(s=>s.name.toLocaleLowerCase().includes(term));
  for(const sector of sectors){
   const b=document.createElement('button');b.type='button';b.className='deck-find-item';b.textContent=sector.name+' · '+sector.kind.toUpperCase();
   b.addEventListener('click',()=>{window.dispatchEvent(new CustomEvent('nabou:focus-sector',{detail:{id:sector.id}}));toggleFinder(false)});
   results.appendChild(b);
  }
  if(!sectors.length){const empty=document.createElement('p');empty.textContent='No matching sectors';results.appendChild(empty)}
 }
 finder.querySelector('input').addEventListener('input',populateFinder);
 app.appendChild(finder);

 setNav(window.matchMedia('(max-width:900px)').matches?false:true);
 const head=activity.querySelector('.activity-head');
 if(head){head.tabIndex=0;head.setAttribute('role','button');head.setAttribute('aria-label','Toggle expanded live activity');head.addEventListener('click',()=>activityBtn.click());head.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activityBtn.click()}})}
 document.addEventListener('keydown',e=>{
  if(e.altKey&&!e.ctrlKey&&!e.metaKey&&e.key.toLowerCase()==='e'){e.preventDefault();nav.click()}
  if(e.key==='Escape'){
   if(!finder.hidden)toggleFinder(false);
   if(activity.classList.contains('deck-expanded'))setActivity(false);
   if(window.matchMedia('(max-width:900px)').matches)setNav(false);
  }
 });
 document.querySelectorAll('.section-btn').forEach(b=>b.addEventListener('click',()=>{if(window.matchMedia('(max-width:900px)').matches)setNav(false)}));
 const inspector=$('detailPanel');
 if(inspector){const observer=new MutationObserver(()=>{if(!inspector.classList.contains('hidden')&&window.matchMedia('(max-width:900px)').matches)setNav(false)});observer.observe(inspector,{attributes:true,attributeFilter:['class']})}
})();
