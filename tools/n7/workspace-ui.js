// N7_PROJECT_BOOK_WORKFLOWS_V1 — approved canon, complete book jobs and staged background OCR.
(function(){
'use strict';
const $=id=>document.getElementById(id),side=document.querySelector('.sidebar');if(!side)return;
const endpoint='/api/conversations/00000000-0000-4000-8000-000000000007/stream';
async function rpc(op,values={}){const r=await fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,...values})});const data=await r.json();if(!r.ok)throw Error(data.error||'Αποτυχία αποθήκευσης');return data;}
const node=(tag,text,props={})=>Object.assign(document.createElement(tag),text?{textContent:text,...props}:props);
const dialog=node('dialog',null,{id:'n7-workspace-dialog'});dialog.style.cssText='width:min(850px,94vw);max-height:90vh;overflow:auto;background:#10212c;color:#edf4f8;border:1px solid #526b7a;border-radius:16px;padding:24px';document.body.append(dialog);
const status=node('p','',{role:'status'});dialog.append(node('h2','Έργα & βιβλία'),status);
function action(text,fn,parent=dialog){const b=node('button',text,{type:'button'});b.style.cssText='padding:9px 13px;margin:5px;border-radius:8px;cursor:pointer';b.onclick=()=>Promise.resolve().then(fn).catch(e=>status.textContent=e.message);parent.append(b);return b;}
function label(text,field,parent=dialog){const l=node('label',text);l.style.cssText='display:flex;flex-direction:column;gap:6px;margin:10px 0';field.style.cssText='padding:10px;background:#0a1821;color:#eef4fa;border:1px solid #526b7a;border-radius:6px';l.append(field);parent.append(l);return field;}
const projectSelect=label('Έργο',node('select',null,{id:'n7-project-select'}));let projects=[],documents=[];
action('Σύνδεση με τη συνομιλία',async()=>{if(!active)throw Error('Άνοιξε πρώτα μια συνομιλία.');await rpc('project_bind',{conversationId:active,projectId:projectSelect.value||null});status.textContent='Η μνήμη του έργου θα χρησιμοποιείται σε αυτή τη συνομιλία.';});
const projectName=label('Νέο έργο',node('input',null,{maxLength:150,placeholder:'Τίτλος βιβλίου ή εργασίας'}));
action('Δημιουργία έργου',async()=>{const p=await rpc('project_create',{name:projectName.value});await refresh(p.id);projectName.value='';});
const kind=label('Τύπος εγκεκριμένης καταχώρισης',node('select'));for(const [value,text] of [['character','Πρόσωπα'],['chronology','Χρονολόγιο'],['decision','Αποφάσεις συγγραφέα'],['chapter','Εγκεκριμένο κεφάλαιο'],['source','Ιστορικό τεκμήριο']])kind.append(node('option',text,{value}));
const entries=label('Υπάρχουσα καταχώριση / νέα έκδοση',node('select'));let previousEntry='';
const canon=label('Κείμενο — αποθηκεύεται μόνο με τη δική σου έγκριση',node('textarea',null,{rows:7,maxLength:50000}));
function fillEntries(){entries.replaceChildren(node('option','Νέα καταχώριση',{value:''}));const p=projects.find(p=>p.id===projectSelect.value);for(const e of p?.entries||[])entries.append(node('option',(e.approved?'✓ ':'Προηγούμενη ')+'v'+e.version+' · '+e.text.slice(0,70),{value:e.id}));}
entries.onchange=()=>{previousEntry=entries.value;const e=projects.find(p=>p.id===projectSelect.value)?.entries.find(e=>e.id===previousEntry);canon.value=e?.text||'';if(e)kind.value=e.kind;};projectSelect.onchange=()=>{previousEntry='';canon.value='';fillEntries();};
action('Έγκριση & αποθήκευση έκδοσης',async()=>{if(!projectSelect.value)throw Error('Επίλεξε έργο.');await rpc('project_entry',{projectId:projectSelect.value,entryId:previousEntry||undefined,kind:kind.value,text:canon.value,approved:true});await refresh(projectSelect.value);canon.value='';previousEntry='';status.textContent='Η εγκεκριμένη έκδοση αποθηκεύτηκε. Οι προηγούμενες εκδόσεις διατηρούνται.';});
function download(value,name){const a=node('a',null,{href:URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),download:name});a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
action('Εξαγωγή μνήμης έργου',async()=>download(await rpc('project_export',{projectId:projectSelect.value}),'n7-project.json'));
dialog.append(node('h3','Αναζήτηση σε όλες τις βιβλιοθήκες'));
const query=label('Όρος / ερώτημα',node('input',null,{maxLength:2000})),searchResults=node('div');dialog.append(searchResults);
action('Αναζήτηση στις πηγές μου',async()=>{const d=await rpc('search_all',{query:query.value});searchResults.replaceChildren();for(const h of d.hits)searchResults.append(node('p',(h.origin||'Ιστορική βιβλιοθήκη')+' · '+h.title+' · σελίδα '+h.page+'\n'+h.text));status.textContent=d.warning||(!d.hits.length?'Δεν βρέθηκαν αποσπάσματα.':'');});
dialog.append(node('h3','Ανάγνωση και επιμέλεια βιβλίου'));
const documentSelect=label('Έγγραφο βιβλιοθήκης',node('select',null,{id:'n7-book-document'}));
const mode=label('Εργασία',node('select'));mode.append(node('option','Ανάγνωση με καταγραφή τεκμηρίων',{value:'read'}),node('option','Επιμέλεια σε διαδοχικά αποσπάσματα',{value:'edit'}));
const from=label('Ανάγνωση από φυσική σελίδα',node('input',null,{type:'number',min:1,value:'1'})),to=label('Ανάγνωση έως φυσική σελίδα',node('input',null,{type:'number',min:1,value:'1'}));
documentSelect.onchange=()=>{const m=documents.find(d=>d.id===documentSelect.value);to.value=String(m?.totalPages||1);};
dialog.append(node('p','Η εργασία καλεί το συνδεδεμένο μοντέλο ανά απόσπασμα και συνεχίζεται στον server. Τα αποτελέσματα παραμένουν προσχέδια· το πρωτότυπο δεν αντικαθίσταται.'));
action('Έναρξη για τις επιλεγμένες σελίδες',async()=>{const j=await rpc('book_start',{documentId:documentSelect.value,projectId:projectSelect.value||null,kind:mode.value,from:+from.value,to:+to.value});status.textContent='Η εργασία ξεκίνησε. Μπορείς να κλείσεις την καρτέλα.';await refresh(projectSelect.value);});
let preparing=false;
action('Προετοιμασία σαρωμένων σελίδων για OCR',async()=>{if(preparing)return;preparing=true;try{
 const id=documentSelect.value,m=documents.find(d=>d.id===id);if(!m||m.kind!=='pdf')throw Error('Επίλεξε PDF.');const waiting=(await rpc('status',{id})).ocrPages.filter(n=>n>=+from.value&&n<=+to.value);if(!waiting.length)throw Error('Δεν υπάρχουν εκκρεμείς σαρωμένες σελίδες σε αυτό το διάστημα.');
 const parts=[];let at=0;while(at<m.size){const r=await rpc('download',{id,offset:at});parts.push(Uint8Array.from(atob(r.base64),c=>c.charCodeAt(0)));at=r.next;}const bytes=new Uint8Array(m.size);at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}
 const pdfjs=await import('/n7-pdf/pdf.js');pdfjs.GlobalWorkerOptions.workerSrc='/n7-pdf/pdf.worker.js';const pdf=await pdfjs.getDocument({data:bytes,isEvalSupported:false}).promise;
 try{let count=0;for(const n of waiting){const page=await pdf.getPage(n),v=page.getViewport({scale:1}),view=page.getViewport({scale:Math.min(2,1800/v.width,2200/v.height)}),canvas=node('canvas',null,{width:Math.ceil(view.width),height:Math.ceil(view.height)});await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',0.85));const data=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<data.length;i+=16000)binary+=String.fromCharCode(...data.subarray(i,i+16000));await rpc('ocr_stage',{documentId:id,page:n,image:{page:n,base64:btoa(binary)}});canvas.width=canvas.height=0;page.cleanup();status.textContent='Προετοιμάστηκαν '+(++count)+' / '+waiting.length+' σελίδες. Κράτησε την καρτέλα ανοιχτή έως το τέλος της προετοιμασίας.';}}
 finally{await pdf.destroy();}status.textContent='Η προετοιμασία ολοκληρώθηκε. Το OCR συνεχίζεται στον server και με κλειστή καρτέλα.';await refresh(projectSelect.value);
 }finally{preparing=false;}});
const jobs=node('section');dialog.append(jobs);const resultView=node('pre');resultView.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';dialog.append(resultView);
async function refresh(selected){const data=await rpc('project_list',{conversationId:active||undefined});projects=data.projects;const keep=selected||projectSelect.value||data.conversation||'';projectSelect.replaceChildren(node('option','Χωρίς έργο',{value:''}));for(const p of projects)projectSelect.append(node('option',p.name,{value:p.id}));projectSelect.value=keep;fillEntries();
 const d=await rpc('list');documents=d.documents.filter(d=>d.totalPages);const previous=documentSelect.value;documentSelect.replaceChildren();for(const m of documents)documentSelect.append(node('option',m.title+' · '+m.totalPages+' σελίδες',{value:m.id}));if(previous)documentSelect.value=previous;else documentSelect.onchange();jobs.replaceChildren(node('h3','Πρόοδος εργασιών'));
 const labels={queued:'Σε αναμονή',running:'Εκτελείται',paused:'Σε παύση',error:'Χρειάζεται συνέχεια',done:'Ολοκληρώθηκε',cancelled:'Ακυρώθηκε'};
 for(const j of data.jobs){const row=node('article');row.style.cssText='border-top:1px solid #526b7a;padding:10px 0';row.append(node('p',j.title+' · '+j.kind+' · '+labels[j.status]+' · σελίδα '+Math.min(j.page,j.to)+' / '+j.to+' · '+j.completed+' αποσπάσματα'+(j.error?' · '+j.error:'')));jobs.append(row);
  if(!['done','cancelled'].includes(j.status))for(const [caption,verb] of [['Παύση','pause'],['Συνέχεια','resume'],['Ακύρωση','cancel']])action(caption,async()=>{await rpc('book_control',{id:j.id,action:verb});await refresh(projectSelect.value);},row);
  action('Προβολή αποτελεσμάτων',async()=>{const d=await rpc('book_export',{id:j.id});resultView.textContent=d.results.map(r=>'Φυσική σελίδα '+r.page+' · από χαρακτήρα '+r.offset+' · ΠΡΟΣΧΕΔΙΟ ΠΡΟΣ ΕΛΕΓΧΟ'+(r.possibleOmission?' · πιθανή παράλειψη':'')+'\n'+r.output).join('\n\n');},row);
  action('Εξαγωγή',async()=>download(await rpc('book_export',{id:j.id}),'n7-book-'+j.id+'.json'),row);
 }
}
const openButton=action('Έργα & βιβλία',async()=>{await refresh();dialog.showModal();},side.querySelector('.n7-navigation')||side);openButton.id='n7-projects-button';action('Ανανέωση',()=>refresh(projectSelect.value));action('Κλείσιμο',()=>dialog.close());setInterval(()=>{if(dialog.open&&!preparing&&!dialog.contains(document.activeElement))refresh(projectSelect.value).catch(e=>status.textContent=e.message);},5000);
})();
