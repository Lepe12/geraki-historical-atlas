// N7_OWNER_MEMORY_UI_V1: explicitly approve, view, and delete persistent writing lessons.
(function initN7OwnerMemoryUI(){
  const navButton=document.createElement('button');
  navButton.type='button';navButton.id='n7-owner-memory-button';navButton.className='new';
  navButton.textContent='✎ Μνήμη επιμέλειας';
  const menu=document.getElementById('taskview');
  if(!menu||!menu.parentNode)return;
  menu.parentNode.insertBefore(navButton,menu.nextSibling);
  const dialog=document.createElement('dialog');
  dialog.id='n7-owner-memory-dialog';
  const header=document.createElement('h2');header.textContent='Εγκεκριμένοι κανόνες επιμέλειας';
  const info=document.createElement('p');
  info.textContent='Αποθηκεύονται μόνο κανόνες που εγκρίνεις εσύ. Εφαρμόζονται σε επόμενες εργασίες λογοτεχνικής επιμέλειας. Δεν εκπαιδεύουν τα βάρη του μοντέλου.';
  const form=document.createElement('form');
  const label=document.createElement('label');label.htmlFor='n7-owner-memory-rule';
  label.textContent='Νέος κανόνας';
  const input=document.createElement('textarea');
  input.id='n7-owner-memory-rule';input.rows=3;input.required=true;
  input.minLength=12;input.maxLength=380;
  input.placeholder='Π.χ. Διατήρησε τις κοφτές προτάσεις. Μην αλλάζεις ακόμη σε ακόμα.';
  const submit=document.createElement('button');submit.type='submit';
  submit.textContent='Αποθήκευση εγκεκριμένου κανόνα';
  const message=document.createElement('p');message.setAttribute('role','status');
  const items=document.createElement('ul');
  const close=document.createElement('button');close.type='button';close.textContent='Κλείσιμο';
  close.onclick=()=>dialog.close();
  form.append(label,input,submit);
  dialog.append(header,info,form,message,items,close);
  dialog.style.cssText='max-width:600px;width:90%;max-height:85vh;overflow:auto;border-radius:14px;padding:24px;background:#102134;color:#eaf4ff;border:1px solid #40728d';
  document.body.append(dialog);
  async function refresh(){
    const data=await api('/api/n7/approved-lessons');
    items.replaceChildren();
    if(!data.lessons.length){
      const empty=document.createElement('li');empty.textContent='Δεν έχουν αποθηκευτεί ακόμη κανόνες.';
      items.append(empty);return;
    }
    for(const lesson of data.lessons){
      const li=document.createElement('li');li.style.marginBottom='12px';
      const body=document.createElement('span');body.textContent=lesson.rule+' ';
      const del=document.createElement('button');del.type='button';del.textContent='Διαγραφή';
      del.onclick=async()=>{
        if(!window.confirm('Να διαγραφεί αυτός ο κανόνας;'))return;
        del.disabled=true;
        try{
          await api('/api/n7/approved-lessons/'+encodeURIComponent(lesson.id),{method:'DELETE'});
          message.textContent='Ο κανόνας διαγράφηκε.';
          await refresh();
        }catch(e){message.textContent='Σφάλμα: '+e.message;del.disabled=false;}
      };
      li.append(body,del);items.append(li);
    }
  }
  navButton.onclick=async()=>{
    message.textContent='';
    dialog.showModal();
    try{await refresh();}catch(e){message.textContent='Σφάλμα φόρτωσης: '+e.message;}
  };
  form.onsubmit=async e=>{
    e.preventDefault();
    submit.disabled=true;message.textContent='';
    try{
      await api('/api/n7/approved-lessons',{method:'POST',
        body:JSON.stringify({rule:input.value.trim()})});
      input.value='';
      message.textContent='Ο εγκεκριμένος κανόνας αποθηκεύτηκε.';
      await refresh();
    }catch(e){message.textContent='Σφάλμα αποθήκευσης: '+e.message;}
    finally{submit.disabled=false;}
  };
})();
