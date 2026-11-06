/* Shared foreground for internal pages; original live controls and handlers are retained. */
(() => {
 const root=document.getElementById('atlasResearch');
 if(!root)return;
 for(const id of ['nxsAgentsPage','learningPanel','detailPanel','activityStrip']){
  const page=document.getElementById(id);if(page)root.append(page);
 }
 const welcome=document.createElement('section');
 welcome.className='unified-welcome';welcome.setAttribute('aria-label','Καλώς ήρθατε στον Ιστορικό Άτλαντα');
 const title=document.createElement('h1');title.textContent='Στα ίχνη της ιστορίας.';
 const explore=document.createElement('button');explore.type='button';explore.textContent='Εξερεύνηση';explore.addEventListener('click',()=>window.N7_READER?.show('map'));
 welcome.append(title,explore);root.append(welcome);
 const explain=document.querySelector('.learning-explain');
 if(explain)explain.textContent=explain.textContent.replace('NABOU','N7');
})();
