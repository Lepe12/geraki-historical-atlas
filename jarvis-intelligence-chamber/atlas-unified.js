/* Shared foreground for internal pages; original live controls and handlers are retained. */
(() => {
 const root=document.getElementById('atlasResearch');
 if(!root)return;
 for(const id of ['nxsAgentsPage','learningPanel','detailPanel','activityStrip']){
  const page=document.getElementById(id);if(page)root.append(page);
 }
 const explain=document.querySelector('.learning-explain');
 if(explain)explain.textContent=explain.textContent.replace('NABOU','N7');
})();
