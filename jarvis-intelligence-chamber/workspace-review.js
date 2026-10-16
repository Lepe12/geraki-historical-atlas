/* NABOU//X workspace revision: one navigation surface, readable research,
   source preview. Wraps existing controls; does not replace research logic. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const app=$('app'),results=$('resultsDrawer'),learning=$('learningPanel');
if(!app||!results||!learning)return;
const toolbar=document.createElement('nav');toolbar.className='workspace-toolbar';toolbar.setAttribute('aria-label','Κύρια πλοήγηση έρευνας');
const left=document.createElement('div'),right=document.createElement('div');
left.className='workspace-group';right.className='workspace-group workspace-right';toolbar.append(left,right);
const buttons=new Map();
function add(parent,id,label,action){const b=document.createElement('button');b.type='button';b.className='workspace-button';b.textContent=label;b.addEventListener('click',action);parent.append(b);buttons.set(id,b);return b;}
add(left,'map','◈ Σύμπαν',()=>{if(!results.classList.contains('hidden'))$('closeResults')?.click();if(!learning.classList.contains('hidden'))$('closeLearning')?.click();document.body.classList.remove('workspace-study');document.querySelector('[data-view="universe"]')?.click();});
add(left,'results','▤ Ευρήματα',()=>{if(results.classList.contains('hidden'))$('resultsToggle')?.click();else $('closeResults')?.click();});
add(left,'learning','▣ Πηγές / PDF',()=>{if(learning.classList.contains('hidden'))$('learningToggle')?.click();else $('closeLearning')?.click();});
add(right,'agents','⌘ Τομείς',()=>$('deckNav')?.click());
add(right,'activity','◷ Πορεία',()=>$('deckActivity')?.click());
const status=document.createElement('span');status.className='workspace-state';status.setAttribute('role','status');right.prepend(status);
app.append(toolbar);
function sync(){
 const r=!results.classList.contains('hidden'),l=!learning.classList.contains('hidden');
 document.body.classList.toggle('workspace-results',r);
 document.body.classList.toggle('workspace-learning',l);
 for(const [id,b] of buttons)b.setAttribute('aria-pressed',String(id==='results'?r:id==='learning'?l:id==='map'?!r&&!l:id==='activity'?!!$('activityStrip')?.classList.contains('deck-expanded'):id==='agents'?!document.body.classList.contains('deck-nav-closed'):false));
 const n=$('resultsCount')?.textContent?.trim();buttons.get('results').textContent='▤ Ευρήματα'+(n&&n!=='0'?' · '+n:'');
 const mission=$('missionState')?.textContent?.trim();const connection=$('expCoreState')?.textContent?.trim();status.textContent=(mission&&mission!=='READY'?mission:connection&&connection!=='CONNECTING'?connection:'Έτοιμο');
}
new MutationObserver(sync).observe(app,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class']});
sync();document.body.classList.add('workspace-ready');
// Side-by-side original PDF preview, local to browser. Never uploads or approves anything.
const input=$('learningFile'),items=$('learningItems');
let pdfUrl=null;let viewer=null;let study=null;
function mountStudy(){
 if(!items||study)return;
 study=document.createElement('div');study.className='workspace-study-grid';
 viewer=document.createElement('div');viewer.className='workspace-pdf-viewer';
 const review=document.createElement('div');review.className='workspace-study-source';
 items.parentNode.insertBefore(study,items);study.append(viewer,review);review.append(items);
 viewer.innerHTML='<div class="workspace-pdf-empty">Επιλέξτε PDF για ταυτόχρονη προβολή πρωτοτύπου και στοιχείων προς έλεγχο.</div>';
}
mountStudy();
input?.addEventListener('change',()=>{
 if(pdfUrl){URL.revokeObjectURL(pdfUrl);pdfUrl=null}
 viewer.replaceChildren();
 const file=input.files?.[0];
 if(file&&file.type==='application/pdf'){
  pdfUrl=URL.createObjectURL(file);
  const label=document.createElement('div');label.className='workspace-pdf-label';label.textContent='Πρωτότυπο · '+file.name;
  const iframe=document.createElement('iframe');iframe.title='Προεπισκόπηση PDF';iframe.src=pdfUrl;
  viewer.append(label,iframe);
 }else{const empty=document.createElement('div');empty.className='workspace-pdf-empty';empty.textContent='Επιλέξτε αρχείο PDF για προεπισκόπηση.';viewer.append(empty)}
 document.body.classList.toggle('workspace-study',!!pdfUrl);
 if(pdfUrl&&learning.classList.contains('hidden'))$('learningToggle')?.click();
});
window.addEventListener('pagehide',()=>{if(pdfUrl)URL.revokeObjectURL(pdfUrl)});
})();