import {connectResearchFeed} from './live-bridge.js';
import {overview,historyEntry,mergeHistory,statusLabel} from './research-overview.js';
import {dossierMarkup} from './research-dossier.js';
const $=id=>document.getElementById(id);
const summary=$('researchOverview'),list=$('historyList'),search=$('historySearch'),status=$('historyStatus');
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const storageKey='nabou-research-history-v1';
let catalog=[],recent=[],current='',unavailable=false,storageAvailable=true;
try{const saved=JSON.parse(localStorage.getItem(storageKey)||'[]');recent=Array.isArray(saved)?saved:[];}catch{storageAvailable=false;}
function dateLabel(value){if(!value)return 'Ημερομηνία μη διαθέσιμη';const date=new Date(value);return Number.isNaN(date.valueOf())?'Ημερομηνία μη διαθέσιμη':new Intl.DateTimeFormat('el-GR',{dateStyle:'medium',timeStyle:'short'}).format(date);}
function renderHistory(){
 const all=mergeHistory(catalog,recent),q=search.value.trim().toLocaleLowerCase('el');
 const rows=all.filter(r=>[r.target,r.run_id,r.date_range].join(' ').toLocaleLowerCase('el').includes(q));
 status.textContent=(unavailable?'Ο κατάλογος δεν είναι διαθέσιμος. Εμφανίζονται μόνο έρευνες που έχουν προβληθεί εδώ. ':all.length+' αποθηκευμένες έρευνες. ')+(storageAvailable?'':'Η τοπική αποθήκευση δεν είναι διαθέσιμη. ');
 list.innerHTML=rows.length?rows.slice(0,100).map(r=>'<button type="button" class="history-entry" data-history-run="'+r.run_id+'"'+(r.run_id===current?' aria-current="true"':'')+'><strong>'+escape(r.target)+'</strong><span>'+escape([r.date_range,statusLabel(r.status)].filter(Boolean).join(' · '))+'</span><small>'+escape(dateLabel(r.generated_utc))+' · #'+r.run_id+(r.run_id===current?' · Προβάλλεται':'')+'</small></button>').join(''):'<p class="history-empty">'+(q?'Δεν βρέθηκαν έρευνες με αυτό το θέμα.':'Δεν υπάρχουν ακόμη διαθέσιμες έρευνες.')+'</p>';
 if(rows.length>100)status.textContent+=' Εμφανίζονται οι 100 πιο πρόσφατες· χρησιμοποιήστε την αναζήτηση για τις υπόλοιπες.';
}
async function loadHistory(){
 $('historyRetry').disabled=true;
 try{const response=await fetch('../command-center/live/index.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('history_unavailable');const data=await response.json();if(data.schema!=='nabou-research-history-v1'||!Array.isArray(data.runs))throw Error('invalid_history');catalog=data.runs;unavailable=false;}
 catch{unavailable=true;}
 $('historyRetry').hidden=!unavailable;$('historyRetry').disabled=false;renderHistory();
}
search.addEventListener('input',renderHistory);$('historyRetry').addEventListener('click',loadHistory);
list.addEventListener('click',event=>{const button=event.target.closest('[data-history-run]');if(!button)return;$('researchRunId').value=button.dataset.historyRun;$('openResearchRun').requestSubmit();$('researchHistory').open=false;$('resultsDrawer').scrollTop=0;});
let dossierRun='';
function renderDossier(snapshot){
 const run=String(snapshot?.run_id||''),sameRun=!!run&&run===dossierRun,markup=dossierMarkup(snapshot);
 for(const key of ['progress','pending','updates']){
  const content=$('research'+key[0].toUpperCase()+key.slice(1)+'Content');
  const open=sameRun?[...content.querySelectorAll('details')].filter(element=>element.open).map(element=>element.dataset.dossierKey):[];
  content.innerHTML=markup[key];
  [...content.querySelectorAll('details')].forEach((element,index)=>{element.open=open.includes(element.dataset.dossierKey);});
 }
 dossierRun=run;
}
function empty(message){$('researchPermalink').hidden=true;document.title='NABOU//X — Έρευνα';summary.innerHTML='<p>'+escape(message)+'</p>';renderDossier(null);}
document.querySelector('.dossier-navigation').addEventListener('click',event=>{const button=event.target.closest('[data-dossier-section]');if(!button)return;const section=$(button.dataset.dossierSection);section.focus({preventScroll:true});section.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});
empty('Επιλέξτε μια προηγούμενη έρευνα ή ξεκινήστε ένα νέο ερώτημα.');
connectResearchFeed({
 onReset:()=>{current='';empty('Φόρτωση της επιλεγμένης έρευνας…');renderHistory();},
 onSnapshot:snapshot=>{const item=historyEntry(snapshot);if(item){current=item.run_id;recent=mergeHistory(recent,[item]).slice(0,50);try{localStorage.setItem(storageKey,JSON.stringify(recent));}catch{storageAvailable=false;}renderHistory();}
  const data=overview(snapshot);renderDossier(snapshot);const link=$('researchPermalink');link.href='?run='+encodeURIComponent(snapshot.run_id);link.hidden=false;document.title='NABOU//X · '+data.title;
  summary.innerHTML='<div class="overview-heading"><h2>'+escape(data.title)+'</h2><span>'+escape(data.status)+'</span></div><dl class="dossier-question"><div><dt>Το ερώτημά σας</dt><dd>'+escape(snapshot.mission?.purpose||snapshot.mission?.target||'Δεν καταγράφηκε αρχικό ερώτημα.')+'</dd></div><div><dt>Περίοδος</dt><dd>'+escape(snapshot.mission?.date_range||'Δεν ορίστηκε περίοδος')+'</dd></div></dl><p>'+escape(data.message)+'</p><dl class="overview-counts">'+[[data.related,'Σχετικές αναφορές'],[data.claims,'Ιστορικοί ισχυρισμοί'],[data.contradictions,'Καταγεγραμμένες αντιφάσεις'],[data.blockers,'Εμπόδια πρόσβασης']].map(([n,label])=>'<div><dt>'+label+'</dt><dd>'+n+'</dd></div>').join('')+'</dl><p class="overview-next"><strong>Επόμενο βήμα:</strong> '+escape(data.next)+'</p>';},
 onState:mode=>{if(mode==='OFFLINE'&&!current)empty('Δεν ήταν δυνατή η φόρτωση αποτελεσμάτων. Δοκιμάστε την πιο πρόσφατη ή μια προηγούμενη έρευνα.');}
});
window.addEventListener('jarvis:dispatch-accepted',()=>{current='';empty('Το αίτημα παραλήφθηκε. Αναμένουμε τη δική σας έρευνα· δεν εμφανίζονται αποτελέσματα άλλου αιτήματος.');renderHistory();});
loadHistory();
