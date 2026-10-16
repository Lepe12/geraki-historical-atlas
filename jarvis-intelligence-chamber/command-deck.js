/* NABOU//X workspace ergonomics — no renderer changes, no new research features. */
(() => {
  const $=id=>document.getElementById(id);
  const app=$('app');
  const navPanel=document.querySelector('.left-panel');
  const activity=$('activityStrip');
  const inspector=$('detailPanel');
  const results=$('resultsDrawer');
  const learning=$('learningPanel');
  if(!app||!navPanel||!activity)return;

  const controls=document.createElement('nav');
  controls.className='deck-controls';
  controls.setAttribute('aria-label','Research Universe workspace controls');

  function button(label,id,expanded,handler){
    const el=document.createElement('button');
    el.type='button'; el.id=id; el.className='deck-control';
    el.textContent=label; el.setAttribute('aria-expanded',String(expanded));
    el.addEventListener('click',handler); controls.appendChild(el); return el;
  }

  function setNav(open){
    document.body.classList.toggle('deck-nav-closed',!open);
    navPanel.inert=!open;
    navBtn.setAttribute('aria-expanded',String(open));
    navBtn.textContent=open?'◧ ΚΛΕΙΣΙΜΟ ΤΟΜΕΩΝ':'◧ ΤΟΜΕΙΣ';
  }
  function setActivity(open){
    activity.classList.toggle('deck-expanded',open);
    activityBtn.setAttribute('aria-expanded',String(open));
    activityBtn.textContent=open?'◷ ΣΥΜΠΤΥΞΗ ΠΟΡΕΙΑΣ':'◷ ΠΟΡΕΙΑ';
    if(open)activity.classList.remove('is-idle');
  }
  function closeRightPanels(except){
    if(except!=='results' && results && !results.classList.contains('hidden')) $('closeResults')?.click();
    if(except!=='learning' && learning && !learning.classList.contains('hidden')) $('closeLearning')?.click();
    if(except!=='detail' && inspector && !inspector.classList.contains('hidden')) $('closeDetail')?.click();
  }

  const navBtn=button('◧ NAVIGATION','deckNav',true,()=>setNav(document.body.classList.contains('deck-nav-closed')));
  const activityBtn=button('◷ ACTIVITY','deckActivity',false,()=>setActivity(!activity.classList.contains('deck-expanded')));
  button('⌖ ΕΠΑΝΑΦΟΡΑ ΧΑΡΤΗ','deckReset',false,()=>$('resetView')?.click());
  app.appendChild(controls);

  setNav(!window.matchMedia('(max-width:900px)').matches);

  const activityHead=activity.querySelector('.activity-head');
  if(activityHead){
    activityHead.tabIndex=0;
    activityHead.setAttribute('role','button');
    activityHead.setAttribute('aria-label','Expand or collapse live activity');
    activityHead.addEventListener('click',()=>activityBtn.click());
    activityHead.addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.key===' '){e.preventDefault();activityBtn.click();}
    });
  }

  $('resultsToggle')?.addEventListener('click',()=>closeRightPanels('results'));
  $('learningToggle')?.addEventListener('click',()=>closeRightPanels('learning'));

  if(inspector){
    const observer=new MutationObserver(()=>{
      if(!inspector.classList.contains('hidden')){
        closeRightPanels('detail');
        if(window.matchMedia('(max-width:900px)').matches)setNav(false);
      }
    });
    observer.observe(inspector,{attributes:true,attributeFilter:['class']});
  }

  document.querySelectorAll('.section-btn').forEach(el=>el.addEventListener('click',()=>{
    if(window.matchMedia('(max-width:900px)').matches)setNav(false);
  }));

  const panels=[results,learning,inspector].filter(Boolean);
  const triggers=new Map([[results,$('resultsToggle')],[learning,$('learningToggle')]]);
  panels.forEach(panel=>{
    panel.tabIndex=-1; panel.setAttribute('role','region');
    const trigger=triggers.get(panel);
    if(trigger){trigger.setAttribute('aria-controls',panel.id);trigger.setAttribute('aria-expanded',String(!panel.classList.contains('hidden')));}
    let wasOpen=!panel.classList.contains('hidden');
    new MutationObserver(()=>{
      const open=!panel.classList.contains('hidden');
      trigger?.setAttribute('aria-expanded',String(open));
      if(open&&!wasOpen){closeRightPanels(panel===results?'results':panel===learning?'learning':'detail');if(window.matchMedia('(max-width:900px)').matches)setNav(false);panel.focus({preventScroll:true});}
      if(!open&&wasOpen&&panel.contains(document.activeElement))trigger?.focus({preventScroll:true});
      wasOpen=open;
    }).observe(panel,{attributes:true,attributeFilter:['class']});
  });
  navBtn.setAttribute('aria-controls','sectorNavigation');navPanel.id='sectorNavigation';
  activityBtn.setAttribute('aria-controls','activityStrip');
  const help=document.createElement('p');help.className='tool-help';help.textContent='Σύρετε για περιστροφή · κύλιση για zoom · επιλέξτε τομέα για περιγραφή και κατάσταση.';navPanel.appendChild(help);
  document.addEventListener('keydown',e=>{

    if(e.key==='Escape'){
      closeRightPanels();
      if(activity.classList.contains('deck-expanded'))setActivity(false);
      if(window.matchMedia('(max-width:900px)').matches)setNav(false);
    }
  });

  const mq=window.matchMedia('(max-width:900px)');
  mq.addEventListener?.('change',e=>setNav(!e.matches));
})();
