/* Presentation-only reading surface. No fabricated article, fixture, dispatch or evidence write. */
(() => {
 'use strict';
 if(!document.body.classList.contains('atlas-reading'))return;
 const overview=document.getElementById('researchOverview');
 const drawer=document.getElementById('resultsDrawer');
 const scroll=()=>drawer.querySelector('.v2-scroll');
 function illustrate(){
  if(!overview.querySelector('.overview-heading')||overview.querySelector('.reader-illustration'))return;
  const figure=document.createElement('figure');figure.className='reader-illustration';
  const img=document.createElement('img');img.src='./assets/reader/mediterranean-harbor.svg';img.alt='Εικαστική απόδοση μεσογειακού λιμανιού με γαλέρες';img.width=1776;img.height=888;img.decoding='async';
  const caption=document.createElement('figcaption');caption.textContent='Εικαστική αναπαράσταση μεσογειακού λιμανιού · Δεν αποτελεί ιστορικό τεκμήριο ή ταύτιση συγκεκριμένου τόπου.';
  figure.append(img,caption);overview.querySelector('.overview-heading').after(figure);
 }
 new MutationObserver(illustrate).observe(overview,{childList:true});illustrate();
 document.getElementById('atlasCloseResearch')?.setAttribute('aria-label','Επιστροφή στον χάρτη');
 // Use the existing shell to close secondary views, then select the live reader.
 document.addEventListener('click',event=>{
  const nav=event.target.closest('[data-atlas-nav]');if(!nav)return;
  const mode=nav.dataset.atlasNav;if(!['research','sources'].includes(mode))return;
  event.preventDefault();event.stopImmediatePropagation();
  document.querySelector('[data-nxs-view="findings"]')?.click();
  window.NABOU_ATLAS?.setPage('research',{openDrawer:true});
  document.querySelectorAll('#atlasResearch [data-atlas-nav]').forEach(button=>button.setAttribute('aria-current',button.dataset.atlasNav===mode?'page':'false'));
  requestAnimationFrame(()=>{
   const content=scroll();if(content)content.scrollTop=0;
   if(mode==='sources')overview.querySelector('.narrative-sources')?.scrollIntoView({block:'start'});
  });
 },true);
 // Keep the approved N7 identity even when the live feed changes the page title.
 const title=document.querySelector('title');
 const updateTitle=()=>{if(document.title.includes('NABOU//X'))document.title=document.title.replace('NABOU//X','N7')};
 new MutationObserver(updateTitle).observe(title,{childList:true,subtree:true});updateTitle();
})();
