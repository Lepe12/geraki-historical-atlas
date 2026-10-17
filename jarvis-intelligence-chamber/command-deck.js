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
    navBtn.textContent='Προβολή χάρτη';
    if(!open){navPanel.querySelectorAll('details[open]').forEach(el=>el.open=false);if(navPanel.contains(document.activeElement))navBtn.focus({preventScroll:true});}
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

  const navBtn=button('Προβολή χάρτη','deckNav',false,()=>setNav(document.body.classList.contains('deck-nav-closed')));
  const activityBtn=button('◷ ΠΟΡΕΙΑ','deckActivity',false,()=>setActivity(!activity.classList.contains('deck-expanded')));
  button('⌖ ΕΠΑΝΑΦΟΡΑ ΧΑΡΤΗ','deckReset',false,()=>$('resetView')?.click());
  app.appendChild(controls);

  setNav(false);

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
    document.querySelectorAll('.section-btn').forEach(button=>button.setAttribute('aria-pressed',String(button===el)));
    setNav(false);navBtn.focus({preventScroll:true});
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
  const viewRail=document.querySelector('.exp-rail');
  if(viewRail){
    const heading=document.createElement('div');heading.className='view-rail-label label';heading.textContent='ΠΡΟΒΟΛΗ';viewRail.prepend(heading);
    const options=$('mapViewOptions');if(options)options.append(viewRail);else navPanel.querySelector('.nav-sections').after(viewRail);
  }

  // Photon-inspired compact workspace rail. All actions route through existing
  // controls; this does not replace or simulate any research subsystem.
  const rail=document.createElement('nav');
  rail.className='nabou-rail';
  rail.setAttribute('aria-label','Βασικές λειτουργίες NABOU//X');
  const items=[
    ['map','◈','Χάρτης'],
    ['agents','⌘','Agents'],
    ['sources','⊞','Πηγές'],
    ['findings','⌕','Ευρήματα'],
    ['learning','▤','Μνήμη PDF'],
    ['history','◷','Ιστορικό']
  ];
  const railButtons=new Map();
  function choose(id){
    for(const [key,el] of railButtons)el.setAttribute('aria-current',key===id?'page':'false');
  }
  for(const [id,glyph,label] of items){
    const b=document.createElement('button');b.type='button';
    b.className='nabou-rail-item';b.dataset.section=id;
    b.setAttribute('aria-label',label);b.title=label;
    const mark=document.createElement('span');mark.className='nabou-rail-glyph';mark.setAttribute('aria-hidden','true');mark.textContent=glyph;
    const caption=document.createElement('span');caption.className='nabou-rail-caption';caption.textContent=label;
    b.append(mark,caption);rail.append(b);railButtons.set(id,b);
    b.addEventListener('click',()=>{
      choose(id);
      if(id==='map'){$('resetView')?.click();closeRightPanels();setNav(false);}
      if(id==='agents'){closeRightPanels();setNav(true);}
      if(id==='sources'||id==='findings'||id==='history'){
        if(results?.classList.contains('hidden'))$('resultsToggle')?.click();
        if(id==='history'){
          const options=results?.querySelector('.result-options');if(options)options.open=true;
          $('researchRunId')?.focus({preventScroll:true});
        }else if(id==='sources'){
          $('resultSearch')?.focus({preventScroll:true});
        }
      }
      if(id==='learning'&&learning?.classList.contains('hidden'))$('learningToggle')?.click();
    });
  }
  choose('map');app.appendChild(rail);
  // Original deck controls remain available as a single map-options control.
  controls.classList.add('nabou-deck-secondary');
  document.querySelector('#deckReset')?.setAttribute('title','Επαναφορά χάρτη');
  const railSync=new MutationObserver(()=>{
    if(!learning?.classList.contains('hidden'))choose('learning');
    else if(!results?.classList.contains('hidden')&&!['sources','history'].includes(rail.querySelector('[aria-current="page"]')?.dataset.section))choose('findings');
  });
  if(results)railSync.observe(results,{attributes:true,attributeFilter:['class']});
  if(learning)railSync.observe(learning,{attributes:true,attributeFilter:['class']});

  document.addEventListener('keydown',e=>{

    if(e.key==='Escape'){
      closeRightPanels();
      if(activity.classList.contains('deck-expanded'))setActivity(false);
      setNav(false);
    }
  });

  const mq=window.matchMedia('(max-width:900px)');
  mq.addEventListener?.('change',()=>setNav(false));
  document.addEventListener('pointerdown',e=>{if(!navPanel.contains(e.target)&&!navBtn.contains(e.target))setNav(false);});
})();
