// N7_MODERN_LIGHT_UI_V1 — preserves the existing authenticated N7 application.
(function(){
 'use strict';
 if(document.documentElement.classList.contains('n7-modern'))return;
 document.documentElement.classList.add('n7-modern');
 const $=id=>document.getElementById(id);
 const main=document.querySelector('#application main'),side=document.querySelector('.sidebar');
 if(!main||!side||!$('chat'))return;
 const icons={new:'↗',search:'⌕',library:'▤',memory:'◇',tasks:'☷',research:'⌁'};
 const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
 const button=(text,fn,cls='n7-button')=>{const e=make('button',text,cls);e.type='button';e.onclick=fn;return e;};
 let mode='chat',attachment=null;
 const editingInstruction='Επιμέλεια κειμένου: διατήρησε τη φωνή και τον ρυθμό μου. Κάνε μόνο τις απαραίτητες αλλαγές και εξήγησε σύντομα τι άλλαξες.\n\n';
 const report=text=>{$('notice').textContent=text;};
 const closeSide=()=>{side.classList.remove('show');$('toggle').setAttribute('aria-expanded','false');backdrop.hidden=true;};
 const backdrop=button('Κλείσιμο μενού',closeSide,'n7-sidebar-backdrop');backdrop.hidden=true;backdrop.tabIndex=-1;document.body.append(backdrop);
 $('toggle').setAttribute('aria-label','Άνοιγμα μενού');$('toggle').setAttribute('aria-expanded','false');
 $('toggle').onclick=()=>{const show=!side.classList.contains('show');side.classList.toggle('show',show);$('toggle').setAttribute('aria-expanded',String(show));backdrop.hidden=!show;};
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSide();if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();showSearch();}});
 const brand=side.querySelector('.brand');
 brand.replaceChildren(make('span','◆','n7-brand-mark'),make('span','N7','n7-wordmark'));
 $('new').textContent='＋ Νέα συνομιλία';$('new').setAttribute('aria-label','Νέα συνομιλία');
 side.querySelector('.section').textContent='Πρόσφατα';
 const nav=make('div',null,'n7-navigation');nav.setAttribute('aria-label','Εργαλεία N7');$('new').after(nav);
 const searchButton=button('⌕  Αναζήτηση',()=>showSearch(),'n7-nav-link');nav.append(searchButton);
 const search=make('input');search.type='search';search.id='n7-conversation-search';search.placeholder='Βρες μια συνομιλία…';search.setAttribute('aria-label','Αναζήτηση συνομιλιών');search.hidden=true;nav.after(search);
 const noResults=make('p','Δεν βρέθηκαν συνομιλίες.','n7-search-empty');noResults.hidden=true;$('conversations').after(noResults);
 function filter(){const q=search.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('el');let count=0;
  for(const b of $('conversations').querySelectorAll('button')){const text=b.textContent.replace(/^◉\s*/, '');if(b.textContent!==text)b.textContent=text;const match=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('el').includes(q);b.hidden=!match;if(match)count++;}
  noResults.hidden=!q||count>0;
 }
 function showSearch(){search.hidden=!search.hidden;if(!search.hidden){side.classList.add('show');if(matchMedia('(max-width: 760px)').matches)backdrop.hidden=false;search.focus();}else{search.value='';filter();}}
 search.oninput=filter;
 const navItems=[['n7-library-button','▤  Βιβλιοθήκη'],['n7-owner-memory-button','◇  Μνήμη επιμέλειας'],['taskview','☷  Εργασίες'],['missionview','⌁  Ιστορική έρευνα']];
 function organize(){let index=1;for(const [id,label] of navItems){const e=$(id);if(!e)continue;if(e.textContent!==label)e.textContent=label;e.classList.add('n7-nav-link');if(nav.children[index]!==e)nav.insertBefore(e,nav.children[index]||null);index++;}
  // Keep the separate archive library reachable without mixing its records with private uploads.
  for(const e of side.querySelectorAll('button.new'))if(!e.id&&/Ιστορική βιβλιοθήκη/.test(e.textContent)){e.textContent='▥  Αρχειακές πηγές';e.classList.add('n7-nav-link');nav.append(e);}
 }
 organize();new MutationObserver(()=>{organize();filter();}).observe(side,{childList:true,subtree:true});
 const oldList=list;list=async function(){await oldList();filter();};
 const header=main.querySelector('header');header.querySelector('.pill')?.remove();
 const breadcrumb=make('span','N7 /','n7-breadcrumb');header.insertBefore(breadcrumb,$('currenttitle'));
 const headerActions=make('div',null,'n7-header-actions');
 const exportChat=button('↓ Εξαγωγή',async()=>{if(!active){report('Άνοιξε πρώτα μια συνομιλία.');return;}try{const d=await api('/api/conversations/'+active);download(d.conversation.messages.map(m=>(m.role==='user'?'Εσύ':'Ν7')+'\n'+m.content).join('\n\n'),d.conversation.title);}catch(e){report(e.message);}});
 exportChat.title='Λήψη συνομιλίας ως αρχείο κειμένου';headerActions.append(exportChat);header.append(headerActions);
 const bottom=side.querySelector('.bottom');const account=make('div',null,'n7-account');account.append(make('span','Ν','n7-avatar'),make('span','Ο χώρος μου'));
 const settings=button('⚙',()=>preferences.showModal(),'n7-icon-button');settings.setAttribute('aria-label','Ρυθμίσεις εμφάνισης');account.append(settings);bottom.prepend(account);
 $('modelstatus').setAttribute('role','status');$('logout').textContent='Αποσύνδεση';
 const preferences=make('dialog',null,'n7-preferences');preferences.setAttribute('aria-labelledby','n7-preferences-title');const ph=make('h2','Εμφάνιση');ph.id='n7-preferences-title';
 const sizeLabel=make('label','Μέγεθος κειμένου');const size=make('select');size.setAttribute('aria-label','Μέγεθος κειμένου');
 for(const [value,text] of [['16','Κανονικό'],['18','Μεγάλο'],['20','Πολύ μεγάλο']]){const o=make('option',text);o.value=value;size.append(o);}
 let font='16';try{font=localStorage.getItem('n7-font-size')||font;}catch{}if(!['16','18','20'].includes(font))font='16';
 size.value=font;document.documentElement.style.setProperty('--n7-reading-size',font+'px');size.onchange=()=>{document.documentElement.style.setProperty('--n7-reading-size',size.value+'px');try{localStorage.setItem('n7-font-size',size.value);}catch{}};sizeLabel.append(size);
 preferences.append(ph,sizeLabel,button('Κλείσιμο',()=>preferences.close(),'n7-primary'));document.body.append(preferences);
 const modes=make('div',null,'n7-modes');modes.setAttribute('role','group');modes.setAttribute('aria-label','Τρόπος εργασίας');
 const modeButtons={};for(const [key,label] of [['chat','Συνομιλία'],['edit','Επιμέλεια'],['research','Έρευνα']]){modeButtons[key]=button(label,()=>chooseMode(key),'n7-mode');modeButtons[key].setAttribute('aria-pressed',String(key==='chat'));modes.append(modeButtons[key]);}header.after(modes);
 function chooseMode(key,internal=false){
  if(busy&&!internal){report('Περίμενε να ολοκληρωθεί η απάντηση.');return;}
  if(key==='research'){if(!$('missionview')){report('Η έρευνα δεν είναι διαθέσιμη.');return;}$('missionview').click();}
  else{taskMode=false;$('tasks').classList.add('hidden');$('missions')?.classList.add('hidden');$('messages').classList.remove('hidden');$('chat').classList.remove('hidden');$('message').placeholder=key==='edit'?'Πρόσθεσε το κείμενο που θέλεις να επιμεληθώ…':'Γράψε ή πρόσθεσε ένα κείμενο…';if(!internal)$('message').focus();}
  mode=key;for(const [k,b] of Object.entries(modeButtons))b.setAttribute('aria-pressed',String(k===key));closeSide();
  if(key!=='research')requestAnimationFrame(()=>{$('messages').scrollTop=$('messages').scrollHeight;});
 }
 const oldOpen=open;open=async function(id){await oldOpen(id);$('missions')?.classList.add('hidden');chooseMode('chat',true);closeSide();};
 const oldCreate=create;create=async function(){const selected=mode;await oldCreate();if(selected==='edit')chooseMode('edit',true);};
 const composer=$('chat');$('message').placeholder='Γράψε ή πρόσθεσε ένα κείμενο…';$('message').rows=2;$('message').setAttribute('aria-label','Μήνυμα στο N7');
 $('send').textContent='↑';$('send').setAttribute('aria-label','Αποστολή μηνύματος');
 const toolbar=make('div',null,'n7-composer-toolbar');const attachmentMenu=make('div',null,'n7-attachment-menu');attachmentMenu.hidden=true;
 const file=make('input');file.type='file';file.accept='.txt,.md,text/plain,text/markdown';file.hidden=true;
 const add=button('＋',()=>{attachmentMenu.hidden=!attachmentMenu.hidden;add.setAttribute('aria-expanded',String(!attachmentMenu.hidden));},'n7-icon-button');add.setAttribute('aria-label','Προσθήκη αρχείου');add.setAttribute('aria-expanded','false');
 attachmentMenu.append(button('Κείμενο TXT ή Markdown',()=>{attachmentMenu.hidden=true;file.click();}),button('PDF στη βιβλιοθήκη',()=>{attachmentMenu.hidden=true;const library=$('n7-library-button');if(library)library.click();else report('Η βιβλιοθήκη δεν έχει φορτωθεί.');}));
 document.addEventListener('click',e=>{if(!attachmentMenu.contains(e.target)&&!add.contains(e.target)){attachmentMenu.hidden=true;add.setAttribute('aria-expanded','false');}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){attachmentMenu.hidden=true;add.setAttribute('aria-expanded','false');}});
 const modeHint=make('span','Enter για αποστολή · Shift + Enter για νέα γραμμή','n7-key-hint');toolbar.append(add,modeHint);composer.append(toolbar,attachmentMenu,file);
 const fileChip=make('div',null,'n7-file-chip');fileChip.hidden=true;composer.prepend(fileChip);
 function refreshAttachment(){fileChip.replaceChildren();fileChip.hidden=!attachment;if(attachment)fileChip.append(make('span','▧ '+attachment.name),button('×',()=>{attachment=null;file.value='';refreshAttachment();},'n7-icon-button'));}
 file.onchange=async()=>{const f=file.files?.[0];if(!f)return;try{if(!/\.(txt|md)$/i.test(f.name)||f.size>60000)throw Error('Πρόσθεσε αρχείο TXT ή MD έως 60 KB. Για PDF χρησιμοποίησε τη βιβλιοθήκη.');const text=await f.text();if(!text.trim()||text.length>10000)throw Error('Το κείμενο πρέπει να έχει έως 10.000 χαρακτήρες. Χώρισέ το σε μικρότερα αποσπάσματα.');attachment={name:f.name,text};refreshAttachment();$('message').focus();}catch(e){file.value='';report(e.message);}};
 const originalApi=api;api=async function(url,opt={}){
  if(typeof url==='string'&&/\/api\/conversations\/[a-f0-9-]+\/chat$/.test(url)&&opt.method==='POST'){
   const payload=JSON.parse(opt.body),originalMessage=payload.message;const attached=attachment;
   let text=originalMessage;
   if(mode==='edit')text=editingInstruction+text;
   if(attached)text+='\n\nΣυνημμένο κείμενο: '+attached.name+'\n---\n'+attached.text;
   if(text.length>12000){$('message').value=originalMessage;throw Error('Το μήνυμα μαζί με το αρχείο ξεπερνά τους 12.000 χαρακτήρες.');}
   try{const result=await originalApi(url,{...opt,body:JSON.stringify({...payload,message:text})});if(attachment===attached){attachment=null;file.value='';refreshAttachment();}return result;}
   catch(e){$('message').value=originalMessage;throw e;}
  }
  return originalApi(url,opt);
 };
 function download(text,name){const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=make('a');a.href=url;a.download=(name||'N7').replace(/[\\/:*?"<>|]/g,'-').slice(0,90)+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),500);}
 async function copy(text,b){try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);else{const t=make('textarea');t.value=text;document.body.append(t);t.select();if(!document.execCommand('copy'))throw Error('Clipboard unavailable');t.remove();}b.textContent='Αντιγράφηκε';setTimeout(()=>b.textContent='Αντιγραφή',1800);}catch{report('Δεν επιτράπηκε η αντιγραφή. Μπορείς να επιλέξεις το κείμενο.');}}
 function decorate(){
  const welcome=$('messages').querySelector('.welcome');if(welcome&&!welcome.dataset.modern){welcome.dataset.modern='true';welcome.replaceChildren(make('div','◆','n7-welcome-mark'),make('p','Ο προσωπικός σου χώρος σκέψης.','n7-eyebrow'),make('h1','Τι θα δουλέψουμε σήμερα;'),make('p','Γράψε, επιμελήσου, αναζήτησε. Με τον δικό σου τρόπο.'));
   const suggestions=make('div',null,'n7-suggestions');for(const [label,key,text] of [['Επιμέλεια κειμένου','edit','Θέλω να επιμεληθείς το παρακάτω κείμενο: '],['Έρευνα πηγών','research',''],['Μια νέα ιδέα','chat','Βοήθησέ με να οργανώσω την ιδέα μου: ']])suggestions.append(button(label,()=>{chooseMode(key);if(key!=='research'){$('message').value=text;$('message').focus();}}));welcome.append(suggestions);
  }
  for(const bubble of $('messages').querySelectorAll('.bubble.assistant')){if(bubble.dataset.modern)continue;bubble.dataset.modern='true';const text=bubble.textContent;const content=make('div',text,'n7-answer-content');const identity=make('div','◆  N7','n7-answer-label');const actions=make('div',null,'n7-answer-actions');const cb=button('Αντιγραφή',()=>copy(text,cb));actions.append(cb,button('Λήψη',()=>download(text,'N7-απάντηση')),button('Διόρθωση',()=>{$('message').value='Διόρθωση στην προηγούμενη απάντηση: ';$('message').focus();}));bubble.replaceChildren(identity,content,actions);}
 }
 const oldRender=render;render=function(messages){oldRender(messages.map(m=>m.role==='user'&&m.content.startsWith(editingInstruction)?{...m,content:m.content.slice(editingInstruction.length)}:m));decorate();requestAnimationFrame(()=>{$('messages').scrollTop=$('messages').scrollHeight;});};decorate();
 $('notice').setAttribute('role','status');$('notice').setAttribute('aria-live','polite');
 if(/αυτόνομες ενέργειες/.test($('notice').textContent))$('notice').textContent='Οι κανόνες επιμέλειας αποθηκεύονται μόνο με την έγκρισή σου.';
 new MutationObserver(()=>{$('messages').setAttribute('aria-busy',String($('send').disabled));composer.classList.toggle('n7-is-busy',$('send').disabled);}).observe($('send'),{attributes:true,attributeFilter:['disabled']});
 const login=$('loginform');login.querySelector('h1').textContent='Καλώς ήρθες στο N7';login.querySelector('p').textContent='Ο προσωπικός σου χώρος για γράψιμο και έρευνα.';login.querySelector('.logo').textContent='◆';login.querySelector('input').setAttribute('aria-label','Κωδικός πρόσβασης');
 const passToggle=button('Εμφάνιση',()=>{const input=login.querySelector('input');const reveal=input.type==='password';input.type=reveal?'text':'password';passToggle.textContent=reveal?'Απόκρυψη':'Εμφάνιση';},'n7-password-toggle');login.querySelector('input').after(passToggle);
 // Close mobile navigation after activating an existing feature, preserving its listener.
 nav.addEventListener('click',e=>{if(e.target.closest('button')!==searchButton)closeSide();});
})();
