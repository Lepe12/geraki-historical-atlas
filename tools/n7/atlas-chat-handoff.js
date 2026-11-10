// Explicit map -> N7 handoff. Carries public map context in the URL fragment, never dispatches a prompt.
(()=>{
 'use strict';
 document.title='NABOU · N7 Ιστορικός Άτλαντας';
 // The atlas constructs its launcher on DOMContentLoaded; delegate to support late mounts.
 function readContext(){
  const heading=document.querySelector('.pro-place-heading h2');
  const from=document.querySelector('input[aria-label="Από το έτος"]'),to=document.querySelector('input[aria-label="Έως το έτος"]');
  const sources=[...document.querySelectorAll('.pro-place-panel a[href], .pro-place-info a[href], #proPlaceInfo a[href]')].map(a=>({title:a.textContent.slice(0,160),url:a.href})).filter(x=>/^https:\/\//.test(x.url)).slice(0,8);
  return {schema:'n7-atlas-handoff/v1',place:heading?.textContent?.slice(0,100)||'',from:Number(from?.value)||1500,to:Number(to?.value)||1700,sources};
 }
 window.N7AtlasContext={read:readContext};
 document.addEventListener('click',event=>{
  const button=event.target.closest?.('a.pro-assistant');if(!button)return;
  const payload=readContext();
  button.href='https://bot.piratecartography.com/#atlas='+encodeURIComponent(JSON.stringify(payload));
 });
})();
