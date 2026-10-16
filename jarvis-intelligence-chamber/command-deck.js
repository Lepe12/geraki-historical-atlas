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
 setNav(window.matchMedia('(max-width:900px)').matches?false:true);
 const head=activity.querySelector('.activity-head');
 if(head){head.tabIndex=0;head.setAttribute('role','button');head.setAttribute('aria-label','Toggle expanded live activity');head.addEventListener('click',()=>activityBtn.click());head.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activityBtn.click()}})}
 document.addEventListener('keydown',e=>{
  if(e.altKey&&!e.ctrlKey&&!e.metaKey&&e.key.toLowerCase()==='e'){e.preventDefault();nav.click()}
  if(e.key==='Escape'){
   if(activity.classList.contains('deck-expanded'))setActivity(false);
   if(window.matchMedia('(max-width:900px)').matches)setNav(false);
  }
 });
 document.querySelectorAll('.section-btn').forEach(b=>b.addEventListener('click',()=>{if(window.matchMedia('(max-width:900px)').matches)setNav(false)}));
 const inspector=$('detailPanel');
 if(inspector){const observer=new MutationObserver(()=>{if(!inspector.classList.contains('hidden')&&window.matchMedia('(max-width:900px)').matches)setNav(false)});observer.observe(inspector,{attributes:true,attributeFilter:['class']})}
})();
