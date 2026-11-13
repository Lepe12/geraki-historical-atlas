/* N7_HUMANOID_STAGE_V1 — the Humanoid is the main entry screen of the authenticated N7 app.
   It routes each command (N7CommandRouter) to an EXISTING capability: the N7 chat transport,
   the private library endpoint, the server weather tool, or NABOU through n7-map/v1.
   Nothing is reported as done unless the capability returned it. */
(()=>{'use strict';
if(window.__N7_HUMANOID_STAGE_V1)return;window.__N7_HUMANOID_STAGE_V1=true;
const R=window.N7CommandRouter,M=window.N7MapProtocol;if(!R||!M)return;
// A window opened by the atlas for the voice link (#n7voice) or a map handoff (#atlas) needs the classic
// view, where the voice-connection card and the handoff appear; it starts there instead of the stage.
// voice-bridge-ui / workspace-ui clear the fragment and set N7_CLASSIC_START before this is read.
const classicStart=()=>window.N7_CLASSIC_START===true||/[#&](?:n7voice|atlas)=/.test(location.hash);
const $=id=>document.getElementById(id);
const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
const btn=(text,fn,cls,label)=>{const b=make('button',text,cls);b.type='button';b.addEventListener('click',fn);if(label)b.setAttribute('aria-label',label);return b;};

/* ---------- shared, persistent N7 session state (owner's browser, this origin only) ---------- */
const KEY='n7-shared-state-v1';
const blank=()=>({schema:'n7-shared-state/v1',conversationId:null,topic:null,place:null,map:null,results:null,actions:[],prefs:{tts:true,continuous:false,semanticDevice:(navigator.deviceMemory||4)>=4&&innerWidth>760}});
const S=(()=>{try{const v=JSON.parse(localStorage.getItem(KEY)||'null');if(v&&v.schema==='n7-shared-state/v1')return {...blank(),...v,prefs:{...blank().prefs,...v.prefs}};}catch{}return blank();})();
function save(){S.updated=new Date().toISOString();try{localStorage.setItem(KEY,JSON.stringify(S));}catch{}}
function forget(){for(const k of Object.keys(S))delete S[k];Object.assign(S,blank());try{localStorage.removeItem(KEY);}catch{}paintAll();}
function log(kind,text,status){
 const entry={at:new Date().toISOString(),kind,text:String(text).slice(0,240),status};
 if(S.actions[0]&&S.actions[0].kind===kind&&S.actions[0].text===entry.text&&S.actions[0].status===status)return; // no duplicate rows
 S.actions.unshift(entry);S.actions=S.actions.slice(0,40);save();paintLog();
}

/* ---------- DOM ---------- */
const stage=make('section',null,'n7-stage');stage.id='n7Stage';stage.setAttribute('aria-label','Humanoid N7');stage.hidden=true;
const rail=make('nav',null,'n7-rail');rail.setAttribute('aria-label','Περιοχές N7');
const RAIL=[['humanoid','◉','Humanoid'],['nabou','◈','NABOU'],['library','▤','Βιβλιοθήκη'],['agents','⌬','Agents'],['chat','☰','Συνομιλίες'],['settings','⚙','Ρυθμίσεις']];
for(const [id,icon,label] of RAIL){const b=btn('',()=>nav(id),'n7-rail-item',label);b.dataset.nav=id;b.append(make('span',icon,'n7-rail-icon'),make('span',label,'n7-rail-label'));b.title=label;rail.append(b);}
const main=make('div',null,'n7-stage-main');
const figure=make('div',null,'n7-stage-figure');figure.id='n7StageFigure';
const stateLine=make('p','Έτοιμος','n7-stage-state');stateLine.id='n7StageState';stateLine.setAttribute('role','status');stateLine.setAttribute('aria-live','polite');
const reply=make('div',null,'n7-stage-reply');reply.id='n7StageReply';reply.setAttribute('aria-live','polite');
const results=make('div',null,'n7-stage-results');results.id='n7StageResults';
const form=make('form',null,'n7-stage-compose');form.id='n7StageForm';
const mic=btn('',()=>toggleMic(),'n7-stage-mic','Μικρόφωνο');mic.id='n7StageMic';mic.setAttribute('aria-pressed','false');{const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','n7-mic-icon');svg.setAttribute('aria-hidden','true');
 for(const d of ['M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z','M5 11a7 7 0 0 0 14 0','M12 18v3']){const p=document.createElementNS(ns,'path');p.setAttribute('d',d);svg.append(p);}
 mic.append(svg,make('span','●','n7-mic-dot'));}
const input=make('textarea',null,'n7-stage-input');input.id='n7StageInput';input.rows=1;input.placeholder='Γράψε ή μίλησε στο N7…';input.setAttribute('aria-label','Εντολή προς τον N7');
const send=make('button','➤','n7-stage-send');send.type='submit';send.setAttribute('aria-label','Αποστολή');send.id='n7StageSend';
const hush=btn('■',()=>stopSpeaking(),'n7-stage-hush','Διακοπή εκφώνησης');hush.id='n7StageHush';hush.hidden=true;
form.append(mic,input,hush,send);
const mapLine=make('p','NABOU: κλειστό','n7-stage-map');mapLine.id='n7StageMap';
// N7_SPLIT_MAP_V1: quick actions (right), and the NABOU map docked below N7 in an iframe.
const quick=make('nav',null,'n7-stage-quick');quick.setAttribute('aria-label','Γρήγορες ενέργειες');
const QUICK=[['search','⌕','Αναζήτηση',()=>{input.focus();}],
 ['research','▥','Ιστορική Έρευνα',()=>{input.value='Αναζήτησε στη βιβλιοθήκη: ';input.focus();}],
 ['places','⌖','Τόποι & Μνημεία',()=>openSplit().then(()=>presence('done','Ο χάρτης NABOU είναι ανοιχτός.')).catch(fail)],
 ['maps','◈','Χάρτες NABOU',()=>openMap().then(()=>presence('done','Ο χάρτης NABOU άνοιξε σε νέο παράθυρο.')).catch(fail)]];
for(const [id,icon,label,fn] of QUICK){const b=btn('',fn,'n7-quick-item',label);b.dataset.quick=id;b.append(make('span',icon,'n7-quick-icon'),make('span',label,'n7-quick-label'));quick.append(b);}
const dock=make('section',null,'n7-stage-mapdock');dock.id='n7MapDock';dock.setAttribute('aria-label','Χάρτης NABOU');
const dockBar=make('div',null,'n7-mapdock-bar');
const dockTitle=make('p','','n7-mapdock-title');dockTitle.id='n7MapDockTitle';
const dockClose=btn('⌃',()=>closeSplit(),'n7-mapdock-close','Κλείσιμο χάρτη');dockClose.id='n7MapDockClose';dockClose.title='Κλείσιμο χάρτη';
dockBar.append(dockTitle,dockClose);dock.append(dockBar);
// Brand and clock (style guide: N7 · research companion of NABOU). The clock is the device's own time.
const brandBox=make('div',null,'n7-stage-brand');brandBox.setAttribute('aria-hidden','true');
brandBox.append(make('span','N7','n7-sb-mark'),make('span','Έρευνα · Ιστορία · Πολιτισμός','n7-sb-tag'),make('span','Ερευνητικός σύνοδος του NABOU','n7-sb-role'));
const clock=make('time',null,'n7-stage-clock');clock.id='n7StageClock';
const tick=()=>{const d=new Date();clock.dateTime=d.toISOString();clock.textContent=d.toLocaleTimeString('el-GR',{hour:'2-digit',minute:'2-digit'});};tick();setInterval(tick,15000);
main.append(brandBox,clock,figure,stateLine,quick,reply,results,form,mapLine,dock);
const settings=make('aside',null,'n7-stage-settings');settings.id='n7StageSettings';settings.hidden=true;settings.setAttribute('aria-label','Ρυθμίσεις N7');
const logList=make('ol',null,'n7-stage-log');logList.id='n7StageLog';
function toggle(label,key){const l=make('label',null,'n7-switch');const c=make('input');c.type='checkbox';c.checked=!!S.prefs[key];c.addEventListener('change',()=>{S.prefs[key]=c.checked;save();});l.append(c,make('span',label));return l;}
settings.append(make('h2','Ρυθμίσεις'),toggle('Φωνητική απάντηση (TTS, el-GR)','tts'),toggle('Συνεχής φωνητική συνομιλία μετά από φωνητική εντολή','continuous'),toggle('Αναζήτηση βιβλιοθήκης με βάση το νόημα στη συσκευή (λήψη ≈140 MB μία φορά)','semanticDevice'),
 make('p','Η μνήμη συνεδρίας (συνομιλία, τόπος, κατάσταση χάρτη, αποτελέσματα, ενέργειες) αποθηκεύεται μόνο σε αυτόν τον browser. Οι συνομιλίες αποθηκεύονται στον server του N7.','n7-note'),
 btn('Διαγραφή μνήμης συνεδρίας',()=>{if(confirm('Να διαγραφεί η τοπική μνήμη συνεδρίας; Οι συνομιλίες στον server δεν επηρεάζονται.'))forget();},'n7-danger'),
 make('h3','Ενέργειες'),logList);
const back=btn('◉ Humanoid',()=>nav('humanoid'),'n7-stage-return','Επιστροφή στον Humanoid');back.id='n7StageReturn';back.hidden=true;
stage.append(rail,main,settings);

/* ---------- presence ---------- */
const STATES={idle:['idle','Έτοιμος'],listening:['listen','Ακούει'],thinking:['think','Σκέφτεται'],speaking:['speak','Μιλάει'],done:['done','Ολοκληρώθηκε'],error:['error','Σφάλμα']};
function presence(kind,text){const [k,l]=STATES[kind]||STATES.idle;stage.dataset.state=kind;window.N7Presence?.setKind(k);stateLine.textContent=text||l;}

/* ---------- navigation ---------- */
function showStage(on){stage.hidden=!on;back.hidden=on;document.body.classList.toggle('n7-stage-on',on);for(const b of rail.children)b.setAttribute('aria-current',String(on&&b.dataset.nav==='humanoid'));}
function nav(id){
 settings.hidden=id!=='settings'||!settings.hidden;
 if(id==='humanoid'){showStage(true);input.focus();return;}
 if(id==='settings'){showStage(true);return;}
 if(id==='nabou'){showStage(true);(split.open?Promise.resolve(closeSplit()):openSplit().then(()=>presence('done','Ο χάρτης NABOU είναι ανοιχτός.'))).catch(fail);return;}
 showStage(false);
 if(id==='library')$('n7-library-button')?.click();
 if(id==='agents')$('taskview')?.click();
}

/* ---------- output ---------- */
function say(text,{error=false,speak=true}={}){
 reply.replaceChildren(make('p',text,error?'n7-error':''));
 if(!error&&speak)speakText(text);
}
function fail(e){const m=e instanceof Error?e.message:String(e);presence('error');say(m,{error:true});log('error',m,'failed');}
function cite(x){return [x.author,x.title,x.publication_year].filter(Boolean).join(', ');}

/* ---------- NABOU link (n7-map/v1) ---------- */
const hex=n=>[...crypto.getRandomValues(new Uint8Array(n))].map(b=>b.toString(16).padStart(2,'0')).join('');
const map={win:null,nonce:'',ready:false,places:[],waiters:[],pending:new Map()};
// app.js declares a global `async function open(id)` (open a conversation), which replaces window.open
// on this page. Use the browser's own open() from a same-origin about:blank frame, called on this window
// so that NABOU's window.opener is this N7 page.
let nativeOpen=null;
function popup(url,name){
 if(!nativeOpen){const f=document.createElement('iframe');f.hidden=true;f.setAttribute('aria-hidden','true');f.tabIndex=-1;document.documentElement.append(f);
  const o=f.contentWindow?.open;if(typeof o!=='function')throw Error('Το άνοιγμα παραθύρων δεν είναι διαθέσιμο σε αυτή τη σελίδα.');nativeOpen=(u,n)=>o.call(window,u,n);}
 return nativeOpen(url,name);
}
function openMap(){
 if(map.win&&!map.win.closed&&map.ready){map.win.focus();return Promise.resolve();}
 map.nonce=hex(16);map.ready=false;
 try{map.win=popup(M.openUrl(map.nonce),'n7-nabou');}catch(e){return Promise.reject(e);}
 if(!map.win)return Promise.reject(Error('Ο browser μπλόκαρε το άνοιγμα του NABOU. Επίτρεψε τα αναδυόμενα παράθυρα για το N7 ή πάτησε το κουμπί NABOU.'));
 paintMap('ανοίγει…');
 return new Promise((resolve,reject)=>{const t=setTimeout(()=>{map.waiters=map.waiters.filter(w=>w.resolve!==resolve);paintMap('χωρίς απόκριση');
  reject(Error('Το NABOU άνοιξε αλλά δεν επιβεβαίωσε τη σύνδεση N7. Η δημοσιευμένη έκδοση του χάρτη ίσως δεν περιέχει ακόμη τη σύνδεση n7-map/v1.'));},25000);
  map.waiters.push({resolve:()=>{clearTimeout(t);resolve();}});});
}
async function mapCommand(command){
 await openMap();
 const id=crypto.randomUUID();
 return new Promise((resolve,reject)=>{
  const t=setTimeout(()=>{map.pending.delete(id);reject(Error('Το NABOU δεν επιβεβαίωσε την εντολή.'));},10000);
  map.pending.set(id,a=>{clearTimeout(t);resolve(a);});
  map.win.postMessage({schema:M.SCHEMA,nonce:map.nonce,type:'command',id,...command},M.ATLAS);
 });
}
window.addEventListener('message',e=>{
 if(e.origin!==M.ATLAS||!map.win||e.source!==map.win||!M.envelope(e.data,map.nonce))return;
 const d=e.data;
 if(d.type==='ready'){map.ready=true;map.places=Array.isArray(d.places)?d.places.filter(p=>M.placeOK(p?.id)).map(p=>({id:p.id,name:String(p.name||'').slice(0,80)})):[];
  const st=M.state(d.state);if(st){S.map=st;save();}paintMap();const w=map.waiters;map.waiters=[];w.forEach(x=>x.resolve());return;}
 if(d.type==='ack'&&M.idOK(d.id)){const ackState=M.state(d.state);if(ackState){S.map=ackState;save();paintMap();}const f=map.pending.get(d.id);if(f){map.pending.delete(d.id);f({ok:d.ok===true,error:typeof d.error==='string'?d.error.slice(0,80):null,located:d.located|0,unlocated:d.unlocated|0,state:M.state(d.state)});}return;}
 if(d.type==='state'){const st=M.state(d.state);if(st){S.map=st;save();paintMap();}return;}
 if(d.type==='return'){nav('humanoid');window.focus();log('nabou','Επιστροφή από το NABOU','done');return;}
 if(d.type==='closed'){map.ready=false;paintMap('κλειστό');}
});
setInterval(()=>{if(map.win&&map.win.closed&&map.ready){map.ready=false;paintMap('κλειστό');}},1500);
/* ---------- N7_SPLIT_MAP_V1: embedded NABOU atlas below N7 (same n7-map/v1 checks) ---------- */
const split={frame:null,nonce:'',ready:false,records:[],waiters:[],pending:new Map(),open:false};
function setSplit(on){split.open=on;stage.dataset.split=on?'1':'0';if(!on)dockTitle.textContent='';}
function openSplit(){
 setSplit(true);
 if(split.frame&&split.ready)return Promise.resolve();
 if(!split.frame){
  split.nonce=hex(16);
  const f=document.createElement('iframe');f.className='n7-mapdock-frame';f.id='n7MapFrame';f.title='Χάρτης NABOU';
  f.setAttribute('sandbox','allow-scripts allow-same-origin allow-popups');f.referrerPolicy='no-referrer';f.loading='eager';
  f.src=M.embedUrl(split.nonce);dock.append(f);split.frame=f;
 }
 paintMap('ο χάρτης φορτώνει…');
 return new Promise((resolve,reject)=>{const t=setTimeout(()=>{split.waiters=split.waiters.filter(w=>w!==done);paintMap('χωρίς απόκριση');
   reject(Error('Ο χάρτης NABOU δεν επιβεβαίωσε τη σύνδεση N7. Η δημοσιευμένη έκδοση του άτλαντα ίσως δεν περιέχει ακόμη την ενσωμάτωση.'));},30000);
  const done=()=>{clearTimeout(t);resolve();};split.waiters.push(done);});
}
function closeSplit(){setSplit(false);paintMap();log('nabou','Κλείσιμο χάρτη','done');input.focus();}
function splitFocus(placeId){
 const id=crypto.randomUUID();
 return new Promise((resolve,reject)=>{
  const t=setTimeout(()=>{split.pending.delete(id);reject(Error('Ο χάρτης NABOU δεν επιβεβαίωσε την εστίαση.'));},15000);
  split.pending.set(id,a=>{clearTimeout(t);resolve(a);});
  split.frame.contentWindow.postMessage({schema:M.SCHEMA,nonce:split.nonce,type:'map_focus',id,placeId},M.ATLAS);
 });
}
window.addEventListener('message',e=>{
 if(e.origin!==M.ATLAS||!split.frame||e.source!==split.frame.contentWindow||!M.envelope(e.data,split.nonce))return;
 const d=e.data;
 if(d.type==='ready'){split.ready=true;split.records=M.records(d.records);paintMap();const w=split.waiters;split.waiters=[];w.forEach(x=>x());return;}
 if(d.type==='ack'&&M.idOK(d.id)){const f=split.pending.get(d.id);if(f){split.pending.delete(d.id);f({ok:d.ok===true,error:typeof d.error==='string'?d.error.slice(0,80):null,state:M.state(d.state)});}return;}
 if(d.type==='error'){paintMap('σφάλμα χάρτη');}
});
const STATUS_TEXT={VERIFIED:'επαληθευμένο σημείο',APPROXIMATE:'σημείο κατά προσέγγιση','NEEDS RESEARCH':'σημείο που χρειάζεται έρευνα'};
async function focusInSplit(r,text){
 await openSplit();delete reply.dataset.show;
 const m=R.matchRecord(text,split.records);
 if(!m){presence('done');reply.dataset.show='1';say('Δεν βρήκα «'+(r.place?.name||text.replace(/^\S+\s+(?:μου\s+)?(?:(?:την|τη|τον|το|τα|τις|τους|στην|στη|στον|στο)\s+)?/u,'').replace(/[;?.!]+$/,'').slice(0,60))+'» στις εγγραφές του NABOU. Δεν τοποθετώ τόπο που δεν υπάρχει στον χάρτη.');return 'not_in_nabou';}
 const a=await splitFocus(m.id);
 if(!a.ok||a.state?.selected!==m.id)throw Error('Ο χάρτης δεν επιβεβαίωσε την εστίαση στο '+m.name+(a.error?' ('+a.error+')':'')+'.');
 S.place={id:m.id,name:m.name,atlas:r.place?.atlas||null,record:m.id,coordinateStatus:m.coordinateStatus};save();
 dockTitle.textContent='Με εντολή: '+text.slice(0,80);
 paintMap();
 // Owner's design: a place command shows the map only. No answer panel; the place card and the side
 // bar on the map carry the record's own fields.
 reply.replaceChildren();delete reply.dataset.show;
 presence('done','Ο χάρτης δείχνει: '+m.name);
 return 'done';
}
function placeName(id){return split.records.find(p=>p.id===id)?.place||map.places.find(p=>p.id===id)?.name||R.PLACES.find(p=>p.atlas===id)?.name||id;}
function paintMap(note){
 const sel=split.open&&S.place?.record?S.place.name:S.map?.selected?placeName(S.map.selected):null;
 mapLine.textContent='NABOU: '+(note||(split.open&&split.ready?'ανοιχτό κάτω':map.ready?'συνδεδεμένο':'κλειστό'))+(sel?' · επιλεγμένος τόπος: '+sel:'')+(S.map?.sourcesOpen?' · πηγές ανοιχτές':'');
}

/* ---------- capabilities ---------- */
async function call(path,payload){
 const r=await fetch(path,{method:payload?'POST':'GET',credentials:'same-origin',cache:'no-store',redirect:'error',
  headers:payload?{'Content-Type':'application/json'}:{},body:payload?JSON.stringify(payload):undefined});
 let d={};try{d=await r.json();}catch{}
 if(!r.ok)throw Error(d.error||('HTTP '+r.status));return d;
}
async function chat(text){
 if(typeof window.N7VoiceChat?.send!=='function')throw Error('Η συνομιλία N7 δεν είναι διαθέσιμη σε αυτή τη σελίδα.');
 if(!active)await create();
 S.conversationId=active;save();
 const out=await window.N7VoiceChat.send(active,text);
 if(out.queued){presence('thinking','Σε ουρά επεξεργασίας');say('Η εντολή μπήκε σε ουρά του μοντέλου. Η απάντηση θα εμφανιστεί στη συνομιλία όταν ολοκληρωθεί.',{speak:false});return 'queued';}
 presence('done');
 say(out.text||'');return out.cancelled?'cancelled':'done';
}
/* ---------- N7_HYBRID_SEARCH_V1: on-device semantic leg (optional) ---------- */
const SEM={state:'off',ext:null,index:null,error:null};
async function semReady(){
 if(!S.prefs.semanticDevice)return false;
 if(SEM.state==='ready')return true;if(SEM.state==='failed')return false;
 try{
  SEM.state='loading';stateLine.textContent='Βιβλιοθήκη · φόρτωση σημασιολογικού μοντέλου στη συσκευή…';
  const [mod,manifest]=await Promise.all([import('/n7-model/transformers.min.js'),call('/api/library/semantic/manifest.json')]);
  if(manifest.schema!=='n7-semantic-index-v1'||manifest.dims!==384)throw Error('μη έγκυρο ευρετήριο');
  const get=async n=>{const r=await fetch('/api/library/semantic/'+n,{credentials:'same-origin',cache:'default'});if(!r.ok)throw Error('ευρετήριο '+r.status);return r;};
  const [vecs,meta]=await Promise.all([get('chunks.i8').then(r=>r.arrayBuffer()),get('chunks.meta.json').then(r=>r.json())]);
  if(vecs.byteLength!==manifest.chunks*384||meta.length!==manifest.chunks)throw Error('ασυνεπές ευρετήριο');
  const {pipeline,env}=mod;env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath='/n7-model/models/';
  env.backends.onnx.wasm.wasmPaths='/n7-model/ort/';env.backends.onnx.wasm.numThreads=1;
  SEM.ext=await pipeline('feature-extraction','Xenova/multilingual-e5-small',{dtype:'q8',device:'wasm'});
  SEM.index={vecs:new Int8Array(vecs),meta,manifest};SEM.state='ready';return true;
 }catch(e){SEM.state='failed';SEM.error=e.message;return false;}
}
async function semRank(question){
 const o=await SEM.ext('query: '+question,{pooling:'mean',normalize:true});const q=o.data,{vecs,meta}=SEM.index,best=new Map();
 for(let c=0;c<meta.length;c++){let d=0;const at=c*384;for(let k=0;k<384;k++)d+=q[k]*vecs[at+k];d/=508;
  if(d<0.5)continue;const key=meta[c][0]+':'+meta[c][1];if(!best.has(key)||best.get(key).score<d)best.set(key,{score:d,chunk:meta[c]});}
 return [...best].sort((a,b)=>b[1].score-a[1].score).slice(0,30);
}
async function sha256Hex(text){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
/** Excerpt for a device-semantic hit: cut from the CURRENT page text, only if it is the text that was indexed. */
async function semExcerpt(hit){
 const [sid,scan,start,end,hash]=hit.chunk;const d=await call('/api/library/page',{source_id:sid,scan_index:scan});const p=d.page||d;
 if(typeof p.ocr_text!=='string'||await sha256Hex(p.ocr_text)!==hash)return null;
 const cp=Array.from(p.ocr_text);if(end>cp.length||start<0||end<=start)return null;
 const text=cp.slice(start,Math.min(end,start+560)).join('').trim();
 return {source_id:sid,scan_index:scan,printed_page:p.printed_page,title:p.title,author:p.author,publication_year:p.publication_year,
  excerpt:(start>0?'…':'')+text+(end<cp.length||start+560<end?'…':''),retrieval:'semantic-device',semantic_score:Math.round(hit.score*1e4)/1e4};
}
// Weighted reciprocal-rank fusion: [list, weight]. Exact (lexical) matches count double; measured on the
// real library (20 questions): MRR@10 0.70 -> 0.78 with the device leg, 0.55 -> 0.58 server-only.
const LEXICAL_WEIGHT=2;
const rrf=lists=>{const s=new Map();for(const [l,w] of lists)l.forEach((k,i)=>s.set(k,(s.get(k)||0)+w/(60+i)));return [...s].sort((a,b)=>b[1]-a[1]).map(x=>x[0]);};
const RETR={lexical:'Λεξική','lexical+semantic':'Λεξική + νόημα',semantic:'Νόημα (server)','semantic-device':'Νόημα (συσκευή)'};
async function library(r){
 if(!r.terms?.length&&r.text.length<12)throw Error('Δεν προέκυψε όρος αναζήτησης. Γράψε το τοπωνύμιο ή τον όρο μέσα σε «εισαγωγικά».');
 const rows=new Map(),errors=[],layers={lexical:false,server:false,device:false};let counts=null;
 const keep=(m,how)=>{const k=m.source_id+':'+m.scan_index;const prev=rows.get(k);
  if(prev){if(how&&!prev.how.includes(how))prev.how.push(how);return k;}
  rows.set(k,{source_id:m.source_id,scan_index:m.scan_index,printed_page:m.printed_page,title:m.title,author:m.author,publication_year:m.publication_year,
   excerpt:m.excerpt,how:[how||m.retrieval||'lexical'],semantic_score:m.semantic_score??null,terms:[],categories:R.classify(m.excerpt),
   places:R.linkPlaces(m.excerpt).map(p=>({id:p.id,name:p.name,atlas:p.atlas}))});return k;};
 // 1. Exact names, toponyms and historical spellings: one lexical list ordered by match count.
 const lexScore=new Map();
 for(const term of (r.terms||[]).slice(0,8)){
  stateLine.textContent='Βιβλιοθήκη · αναζήτηση «'+term+'»';
  try{const d=await call('/api/library/search',{query:term});counts={sources:d.source_count,pages:d.page_count};layers.lexical=true;
   for(const m of d.matches||[]){const k=keep(m,'lexical');rows.get(k).terms.push(term);lexScore.set(k,(lexScore.get(k)||0)+(m.relevance_score||0));}}
  catch(e){errors.push('«'+term+'»: '+e.message);}
 }
 const lexical=[...lexScore].sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
 // 2. The whole question on the server (hybrid when a semantic index is installed there).
 let server=[];const question=r.text.replace(/\s+/g,' ').trim()
  .replace(/^(?:n7[\s,]+)?(?:αναζήτησε|αναζητησε|ψάξε|ψαξε|βρες)(?:\s+(?:στη|στην|στις|στα)\s+(?:βιβλιοθήκη|βιβλιοθηκη|πηγές|πηγες|βιβλία|βιβλια)(?:\s+μας)?)?\s*[:,·-]?\s*/iu,'').slice(0,150);
 if(question.split(' ').length>=3){
  try{const d=await call('/api/library/search',{query:question});counts=counts||{sources:d.source_count,pages:d.page_count};
   layers.server=(d.matches||[]).some(m=>String(m.retrieval||'').includes('semantic'));server=(d.matches||[]).map(m=>keep(m,m.retrieval||'lexical'));}
  catch(e){errors.push('ερώτηση: '+e.message);}
 }
 // 3. On-device meaning search (if enabled and available).
 let device=[];
 if(await semReady()){
  stateLine.textContent='Βιβλιοθήκη · αναζήτηση με βάση το νόημα';
  try{const hits=await semRank(question.length>=6?question:r.text);layers.device=true;
   for(const [k,hit] of hits){if(rows.has(k)){keep(rows.get(k),'semantic-device');rows.get(k).semantic_score??=Math.round(hit.score*1e4)/1e4;device.push(k);continue;}
    if(device.length>=12)continue;const x=await semExcerpt(hit).catch(()=>null);if(x){keep(x,'semantic-device');device.push(k);}}}
  catch(e){errors.push('σημασιολογική: '+e.message);}
 }
 if(!rows.size&&errors.length)throw Error('Η βιβλιοθήκη δεν απάντησε: '+errors.join(' · '));
 const list=rrf([[lexical,LEXICAL_WEIGHT],[server,1],[device,1]].filter(x=>x[0].length)).map(k=>rows.get(k)).filter(Boolean);
 S.results={query:r.text,terms:r.terms||[],from:r.years?.from??null,to:r.years?.to??null,place:r.place||null,at:new Date().toISOString(),counts,layers,items:list.slice(0,60),errors};
 S.topic=r.text.slice(0,200);if(r.place)S.place=r.place;save();
 paintResults();
 const scope=counts?' ('+counts.sources+' πηγές, '+counts.pages+' σελίδες στη βιβλιοθήκη)':'';
 const how='Αναζήτηση: λεξική '+(layers.lexical?'✓':'—')+' · νόημα στον server '+(layers.server?'✓':'—')+' · νόημα στη συσκευή '+(layers.device?'✓':(S.prefs.semanticDevice?'— ('+(SEM.error||'μη διαθέσιμη')+')':'— (ανενεργή)'))+'.';
 if(!list.length){presence('done');say('Δεν εντοπίστηκαν αναφορές'+scope+'. '+how+' Η απουσία ευρήματος δεν αποδεικνύει ότι δεν υπάρχουν στοιχεία.');return 'empty';}
 presence('done');
 say('Βρέθηκαν '+list.length+' αποσπάσματα σε '+new Set(list.map(x=>x.source_id)).size+' πηγές'+scope+'. '+how+' Τα αποσπάσματα είναι αυτούσιο κείμενο πηγής· η αντιστοίχιση με βάση το νόημα και οι κατηγορίες χρειάζονται ανάγνωση.'+(errors.length?' Ορισμένα σκέλη απέτυχαν.':'')+(r.years?' Η περίοδος '+r.years.from+'–'+r.years.to+' δεν φιλτράρει αυτόματα τα αποσπάσματα.':''),{speak:true});
 return 'done';
}
const CAT={base:'Ορμητήριο;',attack:'Επίθεση;',refuge:'Καταφύγιο/οχύρωση;',piracy:'Πειρατεία'};
// N7_STAGE_CLEAR_RESULTS_V1: a new question starts on a clean stage. The map commands keep the results
// because they act on them; everything else clears them. The owner can also clear them by hand.
const KEEP_RESULTS=new Set(['nabou.open','nabou.focus','nabou.sources','nabou.results','humanoid.return']);
function clearResults(){if(!S.results)return;S.results=null;save();paintResults();}
function paintResults(){
 results.replaceChildren();const R0=S.results;stage.dataset.results=R0?.items?.length?'1':'0';if(!R0||!R0.items?.length)return;
 const table=make('table',null,'n7-results-table');table.setAttribute('aria-label','Αποσπάσματα βιβλιοθήκης');
 const head=make('tr');for(const h of ['Πηγή','Σελ.','Απόσπασμα (αυτούσιο)','Εντοπίστηκε','Ενδείξεις','Τόποι',''])head.append(make('th',h));
 const thead=make('thead');thead.append(head);table.append(thead);const body=make('tbody');
 for(const x of R0.items.slice(0,30)){
  const tr=make('tr');tr.append(make('td',cite(x)),make('td',x.printed_page?x.printed_page+' (σάρ. '+x.scan_index+')':'σάρ. '+x.scan_index),make('td',x.excerpt),make('td',(x.how||['lexical']).map(h=>RETR[h]||h).join(' · ')+(x.semantic_score!=null?' ('+x.semantic_score.toFixed(2)+')':'')),
   make('td',x.categories.map(c=>CAT[c]).join(', ')||'—'),make('td',x.places.map(p=>p.name+(p.atlas?'':' (χωρίς γεωεντοπισμό)')).join(', ')||'—'));
  const td=make('td');td.append(btn('Σελίδα',()=>showPage(x,tr),'n7-link'));tr.append(td);body.append(tr);
 }
 table.append(body);const bar=make('div',null,'n7-results-bar');
 bar.append(make('p','Ερώτημα: '+R0.query,'n7-note'),btn('✕ Καθαρισμός',()=>{clearResults();input.focus();},'n7-link n7-results-clear','Καθαρισμός ευρημάτων'));
 results.append(bar,table,
  btn('Δείξε τα αποτελέσματα στο NABOU',()=>run('Δείξε μου τα αποτελέσματα στο NABOU'),'n7-secondary'));
}
async function showPage(x,row){
 try{const d=await call('/api/library/page',{source_id:x.source_id,scan_index:x.scan_index});const p=d.page||d;
  const box=make('tr',null,'n7-page-row');const td=make('td',null);td.colSpan=7;
  td.append(make('p','Πλήρες κείμενο σελίδας · '+cite(x)+' · σάρωση '+x.scan_index+(p.ocr_status?' · OCR: '+p.ocr_status:''),'n7-note'),make('pre',String(p.ocr_text||'').slice(0,20000)));
  box.append(td);row.after(box);}catch(e){fail(Error('Η σελίδα δεν ανακτήθηκε: '+e.message));}
}
function mapResults(){
 const R0=S.results;if(!R0?.items?.length)throw Error('Δεν υπάρχουν ακόμη αποτελέσματα βιβλιοθήκης σε αυτή τη συνεδρία.');
 const byPlace=new Map();
 const add=(p,x)=>{const k=p.id;if(!byPlace.has(k))byPlace.set(k,{place:p.atlas||null,name:p.name,excerpts:[]});const e=byPlace.get(k).excerpts;
  if(e.length<6)e.push({title:x.title,author:x.author,year:x.publication_year,printed_page:x.printed_page,scan_index:x.scan_index,text:x.excerpt,source_id:x.source_id,categories:x.categories});};
 for(const x of R0.items){const ps=[...x.places];if(R0.place&&!ps.some(p=>p.id===R0.place.id))ps.push(R0.place);for(const p of ps)add(p,x);}
 return {query:R0.query,from:R0.from,to:R0.to,places:[...byPlace.values()]};
}
async function weather(r){
 if(!r.location)throw Error('Δεν αναγνωρίστηκε τόπος για τον καιρό. Γράψε π.χ. «καιρός στην Αθήνα».');
 const d=await call('/api/tools/weather?place='+encodeURIComponent(r.location));
 results.replaceChildren();const t=make('table',null,'n7-results-table');const h=make('tr');for(const x of ['Ημέρα','Καιρός','Μέγ.','Ελάχ.','Βροχή','Άνεμος'])h.append(make('th',x));t.append(h);
 for(const x of d.days){const tr=make('tr');tr.append(make('td',x.date),make('td',x.summary),make('td',x.max_c+' °C'),make('td',x.min_c+' °C'),make('td',(x.precipitation_probability??'—')+'%'),make('td',(x.wind_max_kmh??'—')+' km/h'));t.append(tr);}
 results.append(t,make('p','Πηγή: '+d.provider+' · '+d.place.name+(d.place.country?', '+d.place.country:'')+' · ανακτήθηκε '+new Date(d.retrieved_at).toLocaleString('el-GR'),'n7-note'));
 const tomorrow=d.days[1]||d.days[0];
 presence('done');say(d.place.name+': '+tomorrow.date+' — '+tomorrow.summary+', από '+tomorrow.min_c+' έως '+tomorrow.max_c+' °C, πιθανότητα βροχής '+(tomorrow.precipitation_probability??'άγνωστη')+'%. Πηγή: Open-Meteo.');
 return 'done';
}

/* ---------- N7_CODING_AGENT_LINK_V1: existing coding workflow, explicit confirmation ---------- */
const CODER_FILES=['navigation-rail.css','photon-windows.css','nabou-shell.css','command-deck.css','redesign-v2-panels.css','nabou-shell.js','workspace-insights.js','command-deck.js','redesign-v2-panels.js'];
async function coding(r){
 const f=R.fold(r.text);
 if(/(?:^|[^a-z])pr(?:[^a-z]|$)|pull request|ελεγξ|καταστασ|\bci\b/u.test(f)){
  const repo=/nabou|atlas|χαρτ|geraki/u.test(f)?'geraki-historical-atlas':'independent-ai-bot';
  const d=await call('/api/coding/pr?repo='+repo);results.replaceChildren();
  if(!d.pull_request){presence('done');say('Δεν βρέθηκε pull request στο '+repo+'.');return 'done';}
  const p=d.pull_request,t=make('table',null,'n7-results-table'),h=make('tr');for(const x of ['Έλεγχος','Κατάσταση','Αποτέλεσμα'])h.append(make('th',x));t.append(h);
  for(const c of d.checks){const tr=make('tr');tr.append(make('td',c.name),make('td',c.status),make('td',c.conclusion||'—'));t.append(tr);}
  const link=make('a','#'+p.number+' '+p.title);link.href=p.url;link.target='_blank';link.rel='noopener noreferrer';
  results.append(make('p','Πηγή: GitHub API · '+repo,'n7-note'),link,t);
  presence('done');say('Το τελευταίο PR του '+repo+' είναι το #'+p.number+' ('+(p.draft?'draft, ':'')+p.state+'). Έλεγχοι: '+d.summary.success+' επιτυχείς, '+d.summary.failure+' αποτυχημένοι, '+d.summary.pending+' σε εξέλιξη από '+d.summary.total+'.');
  return 'done';
 }
 // A code change is an external action: nothing is dispatched until the owner confirms.
 results.replaceChildren();const box=make('section',null,'n7-coding-confirm');box.id='n7CodingConfirm';
 box.append(make('h3','Coding Agent · επιβεβαίωση'),make('p','Εργασία: '+r.text,'n7-note'),
  make('p','Εκτελεί το υπάρχον workflow «NABOU Coding Agent v0.3» (Qwen2.5-Coder 7B, έλεγχοι, μόνο draft PR — ποτέ merge ή deploy). Επίλεξε 2–3 εγκεκριμένα αρχεία:','n7-note'));
 const picks=[];for(const name of CODER_FILES){const l=make('label',null,'n7-switch'),c=make('input');c.type='checkbox';c.value='jarvis-intelligence-chamber/'+name;c.checked=name==='navigation-rail.css'||name==='photon-windows.css';picks.push(c);l.append(c,make('span',name));box.append(l);}
 const go=apply=>async()=>{const files=picks.filter(c=>c.checked).map(c=>c.value);
  if(files.length<2||files.length>3){say('Επίλεξε 2 έως 3 αρχεία.',{error:true,speak:false});return;}
  box.querySelectorAll('button').forEach(b=>b.disabled=true);presence('thinking','Coding Agent · αποστολή');
  try{const d=await call('/api/coding/tasks',{task:r.text,files,apply});log('coding','Coding Agent '+(apply?'draft PR':'προεπισκόπηση')+': '+r.text,'dispatched');
   if(!d.run){presence('done');say('Η εργασία στάλθηκε στο GitHub, αλλά δεν εντοπίστηκε ακόμη το run. Έλεγξε τα Actions του '+d.repo+'.');return;}
   const link=make('a','GitHub Actions run #'+d.run.id);link.href=d.run.url;link.target='_blank';link.rel='noopener noreferrer';box.append(link);
   presence('done');say('Ο Coding Agent ξεκίνησε ('+(apply?'draft PR':'μόνο προεπισκόπηση')+'). Η εκτέλεση διαρκεί έως ~45 λεπτά· θα ενημερώσω όταν ολοκληρωθεί.');
   watchCoding(d.run.id,box);}
  catch(e){fail(Error('Ο Coding Agent δεν ξεκίνησε: '+e.message));box.querySelectorAll('button').forEach(b=>b.disabled=false);}};
 const row=make('div',null,'n7-coding-actions');row.append(btn('Προεπισκόπηση (χωρίς αλλαγές)',go(false),'n7-secondary'),btn('Draft PR',go(true),'n7-secondary'),btn('Ακύρωση',()=>{box.remove();say('Ακυρώθηκε· δεν στάλθηκε τίποτα.',{speak:false});},'n7-link'));
 box.append(row);results.append(box);
 presence('done');say('Η αλλαγή κώδικα χρειάζεται επιβεβαίωση. Διάλεξε αρχεία και «Προεπισκόπηση» ή «Draft PR».',{speak:false});
 return 'awaiting-confirmation';
}
function watchCoding(id,box){
 const line=make('p','Κατάσταση: σε εκτέλεση…','n7-note');box.append(line);let n=0;
 const tick=async()=>{try{const d=await call('/api/coding/runs/'+id);line.textContent='Κατάσταση: '+d.run.status+(d.run.conclusion?' · '+d.run.conclusion:'');
   if(d.run.status==='completed'){if(d.pull_request){const a=make('a','Draft PR #'+d.pull_request.number);a.href=d.pull_request.url;a.target='_blank';a.rel='noopener noreferrer';box.append(a);}
    log('coding','Coding Agent run '+id+': '+d.run.conclusion,d.run.conclusion);return;}}catch(e){line.textContent='Κατάσταση: '+e.message;}
  if(++n<180)setTimeout(tick,20000);};
 setTimeout(tick,15000);
}

/* ---------- router dispatch ---------- */
let running=false;
async function run(text,{voice=false}={}){
 if(running){say('Ο N7 επεξεργάζεται ήδη μια εντολή.',{error:true,speak:false});return;}
 const r=R.route(text);
 running=true;send.disabled=true;stopSpeaking();
 if(!KEEP_RESULTS.has(r.intent))clearResults();
 // window.open must happen inside the user's gesture, before any await.
 // N7_SPLIT_MAP_V1: places open the map below N7; only an explicit «νέο παράθυρο» uses a separate window.
 const inWindow=/παραθυρ|window/u.test(R.fold(text));
 const needsMap=['nabou.sources','nabou.results'].includes(r.intent)||(['nabou.open','nabou.focus'].includes(r.intent)&&inWindow&&!!(r.intent==='nabou.open'||r.place?.atlas));
 const opening=needsMap?openMap():null;opening?.catch(()=>{});
 presence('thinking','Επεξεργάζεται · '+(r.agent||'N7'));stage.dataset.agent=r.intent;
 log(r.intent,text,'started');
 try{
  let status='done';
  if(r.intent==='invalid')throw Error(r.error);
  else if(r.intent==='humanoid.return'){nav('humanoid');if(split.open)setSplit(false);presence('done');say('Είσαι στον Humanoid. Η συνομιλία και η κατάσταση του χάρτη διατηρούνται.');}
  else if(r.intent==='nabou.open'&&!inWindow){await openSplit();presence('done');say('Ο ιστορικός χάρτης NABOU είναι ανοιχτός κάτω.');}
  else if(r.intent==='nabou.focus'&&!inWindow)status=await focusInSplit(r,text);
  else if(r.intent==='nabou.open'){await opening;presence('done');say('Ο ιστορικός χάρτης NABOU είναι ανοιχτός.');}
  else if(r.intent==='nabou.focus'){
   if(!r.place){presence('done');say('Ο τόπος δεν αναγνωρίστηκε στο NABOU.');status='unlocated';}else
   if(!r.place.atlas){presence('done');say('Το τοπωνύμιο «'+r.place.name+'» αναγνωρίστηκε, αλλά δεν υπάρχει εγκεκριμένο σημείο αναφοράς στο NABOU. Δεν τοποθετείται σε αυθαίρετες συντεταγμένες.');status='unlocated';}
   else{await opening;const a=await mapCommand({action:'focus',place:r.place.atlas});
    if(!a.ok||a.state?.selected!==r.place.atlas)throw Error('Το NABOU δεν επιβεβαίωσε την εστίαση στο '+r.place.name+(a.error?' ('+a.error+')':'')+'.');
    S.place=r.place;save();presence('done');say('Το NABOU εστίασε στο '+r.place.name+'.');}
  }
  else if(r.intent==='nabou.sources'){await opening;const place=S.map?.selected||S.place?.atlas||null;
   if(!place)throw Error('Δεν έχει επιλεγεί τόπος στο NABOU.');
   const a=await mapCommand({action:'sources',place});if(!a.ok||!a.state?.sourcesOpen)throw Error('Το NABOU δεν άνοιξε το πάνελ πηγών'+(a.error?' ('+a.error+')':'')+'.');
   presence('done');say('Άνοιξαν οι πηγές για '+placeName(place)+' στο NABOU.');}
  else if(r.intent==='nabou.results'){const payload=mapResults();await opening;const a=await mapCommand({action:'results',results:payload});
   if(!a.ok)throw Error('Το NABOU δεν εμφάνισε τα αποτελέσματα'+(a.error?' ('+a.error+')':'')+'.');
   presence('done');say('Στο NABOU: '+a.located+' τόποι με σημείο αναφοράς, '+a.unlocated+' χωρίς γεωεντοπισμό.');}
  else if(r.intent==='library.search')status=await library(r);
  else if(r.intent==='weather')status=await weather(r);
  else if(r.intent==='coding')status=await coding(r);
  else status=await chat(text);
  log(r.intent,text,status);
 }catch(e){fail(e);}
 finally{running=false;send.disabled=false;if(voice)lastVoice=true;}
}
form.addEventListener('submit',e=>{e.preventDefault();const t=input.value.trim();if(!t)return;input.value='';lastVoice=false;run(t);});
input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.requestSubmit();}});

/* ---------- voice: STT (browser) and TTS (device voices) ---------- */
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
let rec=null,listening=false,lastVoice=false;
function toggleMic(){
 if(listening){rec?.stop();return;}
 if(!SR){fail(Error('Η αναγνώριση ομιλίας δεν υποστηρίζεται σε αυτόν τον browser. Χρησιμοποίησε πληκτρολόγηση.'));return;}
 stopSpeaking();
 rec=new SR();rec.lang='el-GR';rec.interimResults=true;rec.continuous=false;rec.maxAlternatives=1;
 let finalText='';
 rec.onstart=()=>{listening=true;mic.setAttribute('aria-pressed','true');stage.dataset.mic='on';presence('listening','Ακούει — μίλησε τώρα');};
 rec.onresult=e=>{let t='';for(const x of e.results){t+=x[0].transcript;if(x.isFinal)finalText=t;}input.value=t;};
 rec.onerror=e=>{const m={'not-allowed':'Δεν δόθηκε άδεια χρήσης μικροφώνου.','service-not-allowed':'Ο browser δεν επιτρέπει την υπηρεσία αναγνώρισης ομιλίας.','no-speech':'Δεν ακούστηκε ομιλία.','audio-capture':'Δεν βρέθηκε μικρόφωνο.','network':'Η υπηρεσία αναγνώρισης ομιλίας του browser δεν είναι προσβάσιμη.','language-not-supported':'Τα ελληνικά δεν υποστηρίζονται από την αναγνώριση ομιλίας αυτού του browser.'}[e.error];
  if(e.error!=='aborted')fail(Error(m||('Σφάλμα αναγνώρισης ομιλίας: '+e.error)));};
 rec.onend=()=>{listening=false;mic.setAttribute('aria-pressed','false');delete stage.dataset.mic;
  const t=(finalText||'').trim();if(t){input.value='';run(t,{voice:true});}else if(stage.dataset.state==='listening')presence('idle');};
 try{rec.start();}catch(e){fail(Error('Το μικρόφωνο δεν ξεκίνησε: '+e.message));return;}
 const current=rec;setTimeout(()=>{if(rec===current&&!listening&&stage.dataset.state!=='error'){try{current.abort();}catch{}fail(Error('Η αναγνώριση ομιλίας δεν ξεκίνησε: ο browser δεν απάντησε. Χρησιμοποίησε πληκτρολόγηση.'));}},5000);
}
let utter=null;
function greekVoice(){return (window.speechSynthesis?.getVoices()||[]).find(v=>/^el(-|_|$)/i.test(v.lang))||null;}
function speakText(text){
 if(!S.prefs.tts||!text)return;
 if(!window.speechSynthesis){stateLine.textContent='Η φωνητική απάντηση δεν υποστηρίζεται σε αυτόν τον browser.';return;}
 const v=greekVoice();if(!v){stateLine.textContent='Δεν υπάρχει ελληνική φωνή στη συσκευή· η απάντηση εμφανίζεται μόνο ως κείμενο.';return;}
 const clean=String(text).replace(/[*_#`>|⟦⟧]/g,' ').replace(/https?:\/\/\S+/g,'').replace(/\s+/g,' ').trim().slice(0,1400);
 utter=new SpeechSynthesisUtterance(clean);utter.voice=v;utter.lang=v.lang;
 utter.onstart=()=>{hush.hidden=false;presence('speaking');};
 const end=()=>{hush.hidden=true;utter=null;if(stage.dataset.state==='speaking')presence('idle');if(S.prefs.continuous&&lastVoice&&!stage.hidden)setTimeout(()=>{if(!listening&&!running)toggleMic();},350);};
 utter.onend=end;utter.onerror=e=>{end();if(e.error!=='interrupted'&&e.error!=='canceled')stateLine.textContent='Η εκφώνηση απέτυχε ('+e.error+').';};
 window.speechSynthesis.cancel();window.speechSynthesis.speak(utter);
}
function stopSpeaking(){if(window.speechSynthesis&&(utter||window.speechSynthesis.speaking)){lastVoice=false;window.speechSynthesis.cancel();}hush.hidden=true;}
window.speechSynthesis?.addEventListener?.('voiceschanged',()=>{});

/* ---------- lifecycle ---------- */
function paintLog(){logList.replaceChildren();for(const a of S.actions.slice(0,15))logList.append(make('li',new Date(a.at).toLocaleTimeString('el-GR')+' · '+(R.AGENTS[a.kind]||a.kind)+' · '+a.status+' · '+a.text));}
function paintAll(){paintMap();paintResults();paintLog();if(!S.results)reply.replaceChildren();}
function mountStage(){
 if(stage.isConnected)return;
 document.body.append(stage,back);
 window.N7Presence?.mountStage(figure);
 paintAll();showStage(!classicStart());presence('idle');
 if(S.conversationId&&!active&&/^[a-f0-9-]{36}$/.test(S.conversationId))open(S.conversationId).catch(()=>{S.conversationId=null;save();});
 if(S.results)stateLine.textContent='Έτοιμος · διατηρήθηκαν τα αποτελέσματα: '+S.results.query.slice(0,80);
}
function watch(){const app=$('application');if(!app)return;const check=()=>{if(!app.classList.contains('hidden'))mountStage();else{stage.hidden=true;back.hidden=true;}};new MutationObserver(check).observe(app,{attributes:true,attributeFilter:['class']});check();}
document.addEventListener('click',e=>{if(e.target?.closest?.('#logout'))forget();},true);
// Keep the shared conversation ID aligned with the conversation chosen in the classic view.
setInterval(()=>{if(active&&S.conversationId!==active){S.conversationId=active;save();}},2000);
window.N7Stage={run,nav,state:()=>JSON.parse(JSON.stringify(S)),map:()=>({ready:map.ready,open:!!map.win&&!map.win.closed})};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch,{once:true});else watch();
})();
