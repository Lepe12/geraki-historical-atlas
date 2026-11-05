// N7_CHAT_CORRECTION_CONFIRM_V1
// Offers an explicit owner approval in the chat after a correction. Does not auto-save.
(function(){
  function candidate(input){
    if(typeof input!=='string')return null;
    const msg=input.trim();
    if(msg.length<12)return null;
    const correction=/(?:λάθος|λανθασμέν|το\s+σωστό\s+είναι|η\s+σωστή\s+μορφή|όχι\s*,?\s*(?:έτσι|αυτό)|διόρθωσ[εέ]|μην\s+(?:αλλάζεις|αντικαθιστάς|προσθέτεις|γράφεις|διορθώνεις|πειράζεις)|να\s+διατηρείς|πρέπει\s+να\s+(?:διατηρείς|διορθώνεις|αποφεύγεις))/iu;
    if(!correction.test(msg))return null;
    // A suggestion only. The user can revise it before explicit approval.
    if(msg.length<=380)return msg.replace(/\s+/g,' ');
    const matched=msg.match(correction);
    const start=matched?Math.max(0,matched.index-65):0;
    return msg.slice(start,start+380).replace(/\s+/g,' ').trim();
  }
  if(typeof module!=='undefined' && module.exports)module.exports={suggestLesson:candidate};
  if(typeof document==='undefined')return;
  const chat=document.getElementById('chat');
  const compose=chat?.parentNode;
  if(!chat||!compose||document.getElementById('n7-correction-approval'))return;
  const panel=document.createElement('section');
  panel.id='n7-correction-approval';
  panel.setAttribute('aria-label','Προτεινόμενη μνήμη από τη διόρθωσή σου');
  panel.style.cssText='display:none;margin:9px 0;padding:12px;border:1px solid #3c7186;border-radius:12px;background:#10283a;color:#e9f4fc;';
  const heading=document.createElement('strong');
  heading.textContent='Να το θυμάμαι για τις επόμενες επιμέλειες;';
  const info=document.createElement('p');
  info.textContent='Εντόπισα πιθανή διόρθωση. Έλεγξε ή άλλαξε τον κανόνα και ενέκρινέ τον. Τίποτα δεν αποθηκεύεται χωρίς την επιλογή σου.';
  info.style.cssText='margin:7px 0;font-size:13px;';
  const field=document.createElement('textarea');
  field.rows=3;
  field.maxLength=380;
  field.setAttribute('aria-label','Κανόνας που θα θυμάται το N7');
  field.style.cssText='display:block;width:100%;box-sizing:border-box;margin:8px 0;padding:9px;background:#0a1b29;color:#e8f4fc;border:1px solid #365f75;border-radius:8px;';
  const controls=document.createElement('div');
  controls.style.cssText='display:flex;flex-wrap:wrap;gap:8px;align-items:center;';
  const approve=document.createElement('button');
  approve.type='button';
  approve.textContent='Ναι, αποθήκευσέ το';
  const dismiss=document.createElement('button');
  dismiss.type='button';
  dismiss.textContent='Όχι, άφησέ το';
  const status=document.createElement('span');
  status.setAttribute('role','status');
  status.style.cssText='font-size:13px;';
  controls.append(approve,dismiss,status);
  panel.append(heading,info,field,controls);
  chat.insertAdjacentElement('afterend',panel);
  function hide(){panel.style.display='none';field.value='';status.textContent='';}
  dismiss.addEventListener('click',hide);
  approve.addEventListener('click',async()=>{
    const rule=field.value.trim();
    if(rule.length<12 || rule.length>380){
      status.textContent='Ο κανόνας πρέπει να έχει 12–380 χαρακτήρες.';
      return;
    }
    approve.disabled=true;
    status.textContent='Αποθήκευση...';
    try{
      const response=await fetch('/api/n7/approved-lessons',{
        method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({rule})
      });
      const result=await response.json();
      if(!response.ok)throw Error(result.error||'HTTP '+response.status);
      hide();
      const notice=document.getElementById('notice');
      if(notice)notice.textContent='Η διόρθωσή σου αποθηκεύτηκε στη μνήμη επιμέλειας.';
    }catch(error){status.textContent='Δεν αποθηκεύτηκε: '+error.message;}
    finally{approve.disabled=false;}
  });
  // Capture the user's message BEFORE the existing asynchronous chat handler clears it.
  // Never interfere with the chat request or with the Groq response.
  chat.addEventListener('submit',()=>{
    if(typeof busy!=='undefined' && busy)return;
    const message=document.getElementById('message')?.value||'';
    const suggestion=candidate(message);
    if(!suggestion){hide();return;}
    field.value=suggestion;
    status.textContent='';
    panel.style.display='block';
  },true);
})();
