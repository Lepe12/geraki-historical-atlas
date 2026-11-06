// N7_SOURCE_LIBRARY_UI_V1 — private resumable source library, all content rendered as text.
(function(){
 const side=document.querySelector('.sidebar');if(!side||document.getElementById('n7-library-button'))return;
 const endpoint='/api/conversations/00000000-0000-4000-8000-000000000007/stream';
 const node=(tag,text,attrs={})=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;Object.assign(e,attrs);return e};
 const button=(text,fn)=>{const b=node('button',text,{type:'button'});b.onclick=fn;return b};
 const open=button('▤ Βιβλιοθήκη',()=>{dialog.showModal();refresh().catch(showError)});open.id='n7-library-button';open.className='new';const section=side.querySelector('.section');if(section)section.before(open);else side.append(open);
 const dialog=node('dialog');dialog.id='n7-source-library';dialog.style.cssText='background:#0c1a27;color:#e1edf6;border:1px solid #39677f;border-radius:12px;width:min(1100px,94vw);height:90vh;padding:22px;box-sizing:border-box;overflow:auto;';document.body.append(dialog);
 const style=node('style');style.textContent='#n7-source-library button{background:#15384c;color:#e4f8ff;border:1px solid #39728a;border-radius:6px;padding:8px 12px;cursor:pointer;margin:3px}#n7-source-library input,#n7-source-library textarea{background:#08131e;color:#eff7ff;border:1px solid #365365;border-radius:5px;padding:8px;max-width:100%;box-sizing:border-box}#n7-source-library label{display:flex;flex-direction:column;gap:4px;font-size:13px}#n7-source-library article{border-top:1px solid #294150;padding:12px 0}#n7-source-library blockquote{white-space:pre-wrap;margin:8px 0;color:#d5e5ec}#n7-source-library progress{width:100%}#n7-source-library::backdrop{background:#000a}';dialog.append(style);
 const title=node('h2','Μόνιμη βιβλιοθήκη N7');dialog.append(title);
 let cancelled=false,busy=false,editing=null,docs=[],knownFiles=new Map();
 const msg=node('p','Τα πρωτότυπα και το κείμενο ανά σελίδα παραμένουν ιδιωτικά στον server.');msg.setAttribute('role','status');dialog.append(msg);
 const progress=node('progress',undefined,{max:100,value:0});dialog.append(progress);
 const controls=node('div');controls.append(button('Ανανέωση',()=>refresh().catch(showError)),button('Διακοπή OCR μετά την τρέχουσα παρτίδα',()=>{cancelled=true;msg.textContent='Η τρέχουσα παρτίδα θα αποθηκευτεί και η μεταγραφή θα σταματήσει.'}),button('Κλείσιμο',()=>{cancelled=true;dialog.close()}));dialog.append(controls);
 const form=node('div');form.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:15px 0';
 function field(label,type='text'){const box=node('label',label),input=node('input',undefined,{type});box.append(input);form.append(box);return input;}
 const file=field('Αρχείο PDF / TXT / MD — έως 100 MB','file');file.accept='.pdf,.txt,.md';
 const bookTitle=field('Τίτλος'),author=field('Συγγραφέας'),year=field('Έτος'),aliases=field('Παραλλαγές ονομάτων / τίτλου'),offset=field('Έντυπη σελίδα = φυσική + μετατόπιση','number');offset.placeholder='Κενό: μόνο φυσική αρίθμηση';dialog.append(form);
 const imports=node('div');imports.append(button('Εισαγωγή / Συνέχεια ανεβάσματος',()=>upload().catch(showError)),button('Αποθήκευση στοιχείων επιλεγμένου βιβλίου',()=>saveMetadata().catch(showError)));dialog.append(imports);
 const explanation=node('p','Τα PDF με κείμενο επεξεργάζονται αυτόματα σε παρτίδες. Το OCR σαρωμένων σελίδων χρειάζεται αυτή την καρτέλα ανοικτή και συνεχίζεται από την αποθηκευμένη πρόοδο. Η μεταγραφή παραμένει προς έλεγχο.');explanation.style.fontSize='13px';dialog.append(explanation);
 const list=node('section');dialog.append(list);
 const searchBox=node('div'),query=node('input',undefined,{placeholder:'Αναζήτηση σε όλες τις πηγές',type:'search'});query.style.width='70%';searchBox.append(query,button('Αναζήτηση',()=>search().catch(showError)));dialog.append(searchBox);query.onkeydown=e=>{if(e.key==='Enter')search().catch(showError)};
 const hits=node('section');dialog.append(hits);
 const editor=node('section');editor.hidden=true;const editorTitle=node('h3'),editorText=node('textarea');editorText.rows=16;editorText.style.width='100%';let selectedPage=null;
 editor.append(editorTitle,editorText,button('Αποθήκευση ελεγμένης μεταγραφής',async()=>{try{await rpc({op:'review',id:selectedPage.id,page:selectedPage.page,text:editorText.value});msg.textContent='Η ελεγμένη μεταγραφή αποθηκεύτηκε. Η προηγούμενη έκδοση διατηρήθηκε.';editor.hidden=true;await refresh()}catch(e){showError(e)}}),button('Κλείσιμο σελίδας',()=>{editor.hidden=true}));dialog.append(editor);
 function showError(e){busy=false;msg.textContent='Δεν ολοκληρώθηκε: '+String(e.message||e)+'. Η ήδη αποθηκευμένη πρόοδος διατηρείται.';}
 async function rpc(body){const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),75000);try{const r=await fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:ctl.signal});const value=await r.json();if(!r.ok)throw Error(value.error||'HTTP '+r.status);return value;}finally{clearTimeout(timer)}}
 function base64(bytes){let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s)}
 function unbase64(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
 const labels={uploading:'Ανέβασμα',queued:'Σε αναμονή επεξεργασίας',processing:'Εξαγωγή κειμένου',needs_ocr:'Χρειάζεται OCR',needs_review:'OCR προς έλεγχο',ready:'Διαθέσιμο',error:'Διακοπή — δυνατότητα συνέχισης',duplicate:'Ήδη υπάρχει'};
 async function refresh(){const data=await rpc({op:'list'});docs=data.documents;list.replaceChildren();for(const m of docs){
  const row=node('article'),heading=node('strong',m.title+' — '+(m.author||'χωρίς συγγραφέα'));row.append(heading,node('p',(labels[m.status]||m.status)+' · '+(m.status==='uploading'?Math.floor(100*m.received/m.size)+'% ανεβάσματος':Math.max(0,m.nextPage-1)+' / '+(m.totalPages||'?')+' σελίδες')+(m.ocrRemaining?' · '+m.ocrRemaining+' για OCR':'')+(m.reviewRemaining?' · '+m.reviewRemaining+' προς έλεγχο':'')+(m.extractionTruncated?' · υπάρχει περικοπή εξαγωγής':'')+(m.error?' · '+m.error:'')));
  row.append(button('Στοιχεία',()=>{editing=m.id;bookTitle.value=m.title;author.value=m.author;year.value=m.year;aliases.value=m.aliases;offset.value=m.pageOffset??'';msg.textContent='Επεξεργασία στοιχείων: '+m.title;}));
  const pageInput=node('input',undefined,{type:'number',min:1,max:m.totalPages||5000,value:'1'});pageInput.style.width='85px';pageInput.setAttribute('aria-label','Φυσική σελίδα — '+m.title);row.append(pageInput,button('Σελίδα / Έλεγχος',()=>openPage(m.id,Number(pageInput.value)).catch(showError)));
  if(m.status==='needs_ocr')row.append(button('Έναρξη / Συνέχεια OCR',()=>runOCR(m.id).catch(showError)));
  if(m.status==='error')row.append(button('Συνέχεια εξαγωγής',async()=>{try{await rpc({op:'resume',id:m.id});await refresh()}catch(e){showError(e)}}));
  if(m.sourceHash)row.append(button('Εξαγωγή κειμένου και παραπομπών',()=>exportBook(m.id).catch(showError)));list.append(row);
 }}
 async function saveMetadata(){if(!editing)throw Error('Επίλεξε πρώτα «Στοιχεία» σε ένα βιβλίο');await rpc({op:'metadata',id:editing,title:bookTitle.value,author:author.value,year:year.value,aliases:aliases.value,pageOffset:offset.value});msg.textContent='Τα βιβλιογραφικά στοιχεία αποθηκεύτηκαν.';editing=null;await refresh()}
 async function upload(){if(busy)throw Error('Περίμενε την τρέχουσα εργασία');const f=file.files?.[0];if(!f)throw Error('Επίλεξε ένα αρχείο');if(f.size>100*1024*1024)throw Error('Μέγιστο μέγεθος 100 MB');busy=true;cancelled=false;
  try{msg.textContent='Υπολογίζω αποτύπωμα αρχείου…';const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await f.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');
   let m=docs.find(d=>d.status==='uploading'&&d.expectedHash===digest);if(!m)m=await rpc({op:'init',name:f.name,size:f.size,expectedHash:digest,title:bookTitle.value||f.name,author:author.value,year:year.value,aliases:aliases.value,pageOffset:offset.value});
   knownFiles.set(m.id,f);
   for(let at=m.received;at<f.size;at+=1024*1024){if(cancelled){msg.textContent='Το ανέβασμα σταμάτησε. Επίλεξε το ίδιο αρχείο για συνέχεια.';return;}const bytes=new Uint8Array(await f.slice(at,Math.min(f.size,at+1024*1024)).arrayBuffer());await rpc({op:'chunk',id:m.id,offset:at,base64:base64(bytes)});progress.value=100*(at+bytes.length)/f.size;msg.textContent='Ανέβασμα '+Math.round(progress.value)+'% — '+f.name;}
   const done=await rpc({op:'finalize',id:m.id});if(done.id!==m.id)knownFiles.set(done.id,f);msg.textContent=done.duplicate?'Το ίδιο πρωτότυπο υπάρχει ήδη στη βιβλιοθήκη.':'Το πρωτότυπο αποθηκεύτηκε. Η εξαγωγή κειμένου συνεχίζεται στον server.';await refresh();
  }finally{busy=false}
 }
 async function openPage(id,n){const r=await rpc({op:'page',id,page:n});selectedPage={id,page:n};editorTitle.textContent=r.document.title+' — φυσική σελίδα '+n+' · '+r.page.method;editorText.value=r.page.text;editor.hidden=false;editor.scrollIntoView({block:'nearest'});}
 async function search(){const r=await rpc({op:'search',query:query.value});hits.replaceChildren();if(!r.hits.length){hits.append(node('p','Δεν βρέθηκε αναγνωσμένο απόσπασμα.'));return;}for(const h of r.hits){const a=node('article');a.append(node('strong','['+h.ref+'] '+h.author+' — '+h.title+' · '+(h.kind==='web'?'απόσπασμα ιστοσελίδας':h.kind==='pdf'?'φυσική σ. '+h.page:'τμήμα κειμένου '+h.page)+(h.printedPage!==null?' / έντυπη σ. '+h.printedPage:'')),node('blockquote',h.text),node('small',h.method+(h.method==='vision_ocr'&&!h.reviewed?' — OCR προς έλεγχο':'')),button('Έλεγχος ολόκληρης σελίδας',()=>openPage(h.id,h.page).catch(showError)));hits.append(a)}}
 async function original(id,m){const local=knownFiles.get(id);if(local)return new Uint8Array(await local.arrayBuffer());const chunks=[];let at=0;while(at<m.size){if(cancelled)throw Error('Διακόπηκε από τον χρήστη');const r=await rpc({op:'download',id,offset:at});chunks.push(unbase64(r.base64));at=r.next;msg.textContent='Ανάκτηση ιδιωτικού πρωτοτύπου '+Math.round(100*at/m.size)+'%';}const all=new Uint8Array(m.size);at=0;for(const c of chunks){all.set(c,at);at+=c.length}return all}
 async function runOCR(id){if(busy)throw Error('Περίμενε την τρέχουσα εργασία');busy=true;cancelled=false;let pdf;
  try{let state=await rpc({op:'status',id});if(!state.ocrPages.length){msg.textContent='Δεν υπάρχουν σελίδες σε αναμονή OCR.';return;}
   const pdfjs=await import('/n7-pdf/pdf.js');pdfjs.GlobalWorkerOptions.workerSrc='/n7-pdf/pdf.worker.js';const task=pdfjs.getDocument({data:await original(id,state.document),isEvalSupported:false});pdf=await task.promise;
   while(state.ocrPages.length&&!cancelled){const images=[];for(const n of state.ocrPages.slice(0,3)){
    const page=await pdf.getPage(n),v=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(2,1800/v.width,2200/v.height)}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',0.88));canvas.width=canvas.height=0;if(!blob)throw Error('Αποτυχία εικόνας σελίδας');images.push({page:n,base64:base64(new Uint8Array(await blob.arrayBuffer()))});page.cleanup();}
    msg.textContent='Οπτική μεταγραφή σελίδων '+images.map(x=>x.page).join(', ')+'…';await rpc({op:'ocr',id,images});state=await rpc({op:'status',id});progress.value=100*(state.document.totalPages-state.ocrPages.length)/state.document.totalPages;
    msg.textContent='Αποθηκεύτηκε OCR · απομένουν '+state.ocrPages.length+' σελίδες. Η μεταγραφή χρειάζεται έλεγχο.';
   }await refresh();if(cancelled)msg.textContent='Η πρόοδος OCR αποθηκεύτηκε. Πάτησε «Συνέχεια OCR» για τα υπόλοιπα.';else msg.textContent='Η μεταγραφή όλων των εκκρεμών σελίδων ολοκληρώθηκε. Έλεγξε τα αποσπάσματα πριν τα χρησιμοποιήσεις ως πιστή μεταγραφή.';
  }finally{if(pdf)await pdf.destroy();busy=false}
 }
 async function exportBook(id){const data=await rpc({op:'export',id});const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=node('a',undefined,{href:url,download:'n7-source-'+id+'.json'});a.click();setTimeout(()=>URL.revokeObjectURL(url),10000)}
 setInterval(()=>{if(dialog.open&&!busy&&!editing)refresh().catch(showError)},5000);
})();
