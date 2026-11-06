// N7_GROQ_TRUE_STREAM_AND_UPLOADS_V1
// Overrides old wait-for-whole-response handler while keeping login, owner memory, tasks.
(function(){
 const chat=document.getElementById('chat'),send=document.getElementById('send'),
   input=document.getElementById('message');
 if(!chat||!send||!input)return;
 let pending=[],sending=false;
 // Convert cited HTTPS source URLs into clickable links without using innerHTML.
 const originalRender=render;
 render=function(messages){
  originalRender(messages);
  const wrap=document.getElementById('messages');
  for(const node of wrap.querySelectorAll('.bubble.assistant')){
   const source=node.textContent||'';
   if(!source.includes('https://'))continue;
   node.replaceChildren();
   const regex=/https:\/\/[^\s<>"'\[\]]+/g;
   let match,last=0;
   while((match=regex.exec(source))){
    node.append(document.createTextNode(source.slice(last,match.index)));
    const link=document.createElement('a');
    const url=match[0].replace(/[),.;]+$/,'');
    link.href=url;link.target='_blank';link.rel='noopener noreferrer';
    link.style.cssText='color:#70d7fb;text-decoration:underline;overflow-wrap:anywhere;';
    link.textContent=url;
    node.append(link);
    if(url.length<match[0].length)node.append(document.createTextNode(match[0].slice(url.length)));
    last=regex.lastIndex;
   }
   node.append(document.createTextNode(source.slice(last)));
  }
 };
 const picker=document.createElement('input');
 picker.type='file';picker.multiple=true;picker.id='n7-file-picker';
 picker.accept='.png,.jpg,.jpeg,.webp,.txt,.md,.csv,.json,.docx,.pdf';
 picker.hidden=true;
 const add=document.createElement('button');
 add.type='button';add.textContent='＋';add.title='Επισύναψη εικόνας ή αρχείου';
 add.setAttribute('aria-label','Προσθήκη εικόνας ή αρχείου');
 add.style.cssText='background:transparent;color:#85dff4;border:1px solid #32586d;border-radius:9px;min-width:38px;height:40px;flex-shrink:0;font-size:25px;';
 add.onclick=()=>picker.click();
 input.before(add);chat.append(picker);
 const strip=document.createElement('div');
 strip.id='n7-file-strip';strip.style.cssText='display:none;flex-wrap:wrap;gap:7px;margin-bottom:8px;';
 const composer=chat.parentNode;
 composer.insertBefore(strip,chat);
 const notice=document.getElementById('notice');
 function showFiles(){
  strip.replaceChildren();strip.style.display=pending.length?'flex':'none';
  for(const [index,file] of pending.entries()){
   const chip=document.createElement('span');
   chip.style.cssText='display:inline-flex;gap:7px;align-items:center;background:#1a3445;color:#dcf2fc;border:1px solid #315a70;border-radius:9px;padding:5px 9px;max-width:100%;font-size:12px;';
   const label=document.createElement('span');label.textContent='📎 '+file.name+' ('+(file.size/1024).toFixed(0)+' KB)';
   label.style.cssText='overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
   const remove=document.createElement('button');remove.type='button';remove.textContent='×';
   remove.title='Αφαίρεση συνημμένου';remove.style.cssText='border:0;background:none;color:#e6eff7;';
   remove.onclick=()=>{pending.splice(index,1);showFiles();};
   chip.append(label,remove);strip.append(chip);
  }
 }
 picker.onchange=()=>{
  try{
   const added=Array.from(picker.files||[]);
   const all=[...pending,...added];
   if(all.length>4)throw Error('Μέχρι 4 συνημμένα ανά μήνυμα.');
   if(all.filter(x=>x.type.startsWith('image/')).length>3)
      throw Error('Μέχρι 3 εικόνες ανά μήνυμα.');
   if(all.some(x=>x.size>5*1024*1024)||all.reduce((n,x)=>n+x.size,0)>6*1024*1024)
      throw Error('Έως 5 MB ανά αρχείο και 6 MB συνολικά.');
   const extensions=/\.(png|jpg|jpeg|webp|txt|md|csv|json|docx|pdf)$/i;
   if(all.some(x=>!extensions.test(x.name)))throw Error('Μη υποστηριζόμενος τύπος αρχείου.');
   pending=all;showFiles();notice.textContent='';
  }catch(e){notice.textContent='Συνημμένα: '+e.message;}
  finally{picker.value='';}
 };
 async function encode(file){
  const bytes=new Uint8Array(await file.arrayBuffer());
  let output='';
  for(let i=0;i<bytes.length;i+=16384){
   output+=String.fromCharCode(...bytes.subarray(i,i+16384));
  }
  return {name:file.name,base64:btoa(output)};
 }
 // Render scanned PDF pages locally; use the existing visual model for transcription.
 // Text extraction stays on the server; no external OCR subscription or file hosting.
 async function encodeWithPdfPages(files){
  const prepared=[...files];let budget=3-files.filter(f=>f.type.startsWith('image/')).length;
  for(const file of files.filter(f=>/\.pdf$/i.test(f.name))){
   if(budget<=0||prepared.length>=4)break;
   if(notice)notice.textContent='Ελέγχω τις σελίδες του PDF…';
   const pdfjs=await import('/n7-pdf/pdf.mjs');
   pdfjs.GlobalWorkerOptions.workerSrc='/n7-pdf/pdf.worker.mjs';
   const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false});
   let doc;const timer=setTimeout(()=>task.destroy(),20000);
   try{
    doc=await task.promise;
    // Bound local work; only the first three physical pages are candidates for visual OCR.
    for(let n=1;n<=Math.min(3,doc.numPages)&&budget>0&&prepared.length<4;n++){
     const page=await doc.getPage(n),text=await page.getTextContent();
     if(text.items.some(x=>String(x.str||'').trim()))continue;
     const base=page.getViewport({scale:1}),scale=Math.min(1.8,1600/base.width,2000/base.height);
     const viewport=page.getViewport({scale}),canvas=document.createElement('canvas');
     canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
     await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
     const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.86));
     canvas.width=canvas.height=0;
     if(blob)prepared.push(new File([blob],file.name+' — PDF page '+n+'.jpg',{type:'image/jpeg'}));
     budget--;
    }
   }finally{clearTimeout(timer);if(doc)await doc.destroy();else await task.destroy();}
  }
  if(prepared.reduce((n,f)=>n+f.size,0)>6*1024*1024)throw Error('Το PDF μαζί με τις εικόνες σελίδων ξεπερνά τα 6 MB. Στείλε μικρότερο αρχείο ή μεμονωμένες σελίδες.');
  return Promise.all(prepared.map(encode));
 }
 async function readNdjson(response,onEvent){
  if(!response.ok){
   let detail='HTTP '+response.status;
   try{detail=(await response.json()).error||detail;}catch{}
   throw Error(detail);
  }
  if(!response.body)throw Error('Ο διακομιστής δεν υποστηρίζει ροή απάντησης.');
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let buffer='',finished=false;
  while(true){
   const part=await reader.read();
   if(part.done)break;
   buffer+=decoder.decode(part.value,{stream:true});
   if(buffer.length>250000)throw Error('Πολύ μεγάλο πακέτο απάντησης');
   let newline;
   while((newline=buffer.indexOf('\n'))>=0){
    const raw=buffer.slice(0,newline);buffer=buffer.slice(newline+1);
    if(!raw.trim())continue;
    const data=JSON.parse(raw);
    onEvent(data);
    if(data.type==='done')finished=true;
   }
  }
  if(!finished)throw Error('Η ροή ολοκληρώθηκε χωρίς επιβεβαίωση αποθήκευσης.');
 }
 chat.onsubmit=async e=>{
  e.preventDefault();
  if(sending||busy)return;
  const content=input.value.trim()||
    (pending.length===1&&pending[0].type.startsWith('image/')?'Περιέγραψε προσεκτικά αυτή τη μία εικόνα. Μην επινοήσεις άλλα πλάνα ή εικόνες.':pending.length?'Περιέγραψε και ανέλυσε τα '+pending.length+' συνημμένα αρχεία.':'');
  if(!content)return;
  sending=true;busy=true;send.disabled=true;add.disabled=true;
  input.disabled=true;
  let streamed='',confirmed=false,watchdog=null;
  if(notice)notice.textContent='';
  window.N7Presence?.setState('think',{source:'chat'});
  try{
   if(!active)await create();
   const original=await api('/api/conversations/'+active);
   const files=await encodeWithPdfPages(pending);
   const visible=content+(pending.length?'\n'+pending.map(x=>'📎 '+x.name).join('\n'):'');
   render([...original.conversation.messages,{role:'user',content:visible},{role:'assistant',content:''}]);
   const pane=document.getElementById('messages');
   const bubble=pane.lastElementChild;
   // N7_VISIBLE_PROGRESS_BUBBLE_V1: show the current stage where the user reads replies.
   bubble.textContent='Το N7 συνδέεται…';
   input.value='';pending=[];showFiles();
   window.N7Presence?.setState('work',{source:'chat'});
   if(notice)notice.textContent='Συνδέομαι με το N7…';
   const controller=new AbortController();
   watchdog=setTimeout(()=>controller.abort(),85000);
   const response=await fetch('/api/conversations/'+active+'/stream',{
    method:'POST',credentials:'same-origin',signal:controller.signal,
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({message:content,attachments:files})
   });
   await readNdjson(response,event=>{
    if(event.type==='status'){
     const label=event.message||'Το N7 εργάζεται…';
     if(notice)notice.textContent=label;
     if(!streamed)bubble.textContent=label;
     return;
    }
    if(event.type==='delta'){
     if(notice)notice.textContent='Το N7 γράφει…';
     streamed+=event.text||'';bubble.textContent=streamed;
     pane.scrollTop=pane.scrollHeight;
    }
    if(event.type==='error')throw Error(event.error||'Η ροή διακόπηκε');
    if(event.type==='done')confirmed=true;
   });
   if(!confirmed)throw Error('Δεν επιβεβαιώθηκε η αποθήκευση της απάντησης.');
   if(notice)notice.textContent='Η απάντηση ολοκληρώθηκε.';
   const updated=await api('/api/conversations/'+active);
   render(updated.conversation.messages);
   document.getElementById('currenttitle').textContent=updated.conversation.title;
   await list();
  }catch(error){
   window.N7Presence?.setState('error',{source:'chat'});
   const detail=error.name==='AbortError'?'Η αναμονή ξεπέρασε τα 85 δευτερόλεπτα. Το αίτημα ακυρώθηκε στον browser.':error.message;
   if(notice)notice.textContent='Σφάλμα: '+detail;
   if(!streamed){
    const pane=document.getElementById('messages');
    if(pane.lastElementChild?.classList.contains('assistant'))
      pane.lastElementChild.textContent='Η απάντηση δεν ολοκληρώθηκε. '+detail;
   }
   if(streamed){
    const pane=document.getElementById('messages');
    if(pane.lastElementChild?.classList.contains('assistant'))
      pane.lastElementChild.textContent=streamed+'\n\n[Μη ολοκληρωμένη απάντηση]';
   }else{
    input.value=content;
   }
  }finally{
   if(watchdog!==null)clearTimeout(watchdog);
   sending=false;busy=false;send.disabled=false;add.disabled=false;input.disabled=false;
   if(!notice?.textContent.startsWith('Σφάλμα:'))
     window.N7Presence?.setState('idle',{source:'chat'});
   input.focus();
  }
 };
 // A file-only message still requires a real user submission via the send button.
 input.required=false;
})();

