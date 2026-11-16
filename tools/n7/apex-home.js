/* N7_APEX_HOME_V1 — ONE N7. After login the approved APEX Humanoid (/n7-apex/, same origin) is the home
   screen. The written Chat and NABOU stay the existing screens of this page; they share ONE active
   conversation with the Humanoid through the shared N7 state (n7-shared-state-v1), so moving between them
   never creates a conversation. This file only decides where the visitor lands and offers the way back.
   The old Humanoid stage (humanoid-stage.js) is no longer an entry screen: it remains only as the container
   of the NABOU workspace, with its own figure hidden, so there is never a second Humanoid. */
(()=>{'use strict';
if(window.__N7_APEX_HOME_V1)return;window.__N7_APEX_HOME_V1=true;
const HOME='/n7-apex/',RELEASE='/n7-apex/.n7-apex-release.json',GREETED='n7-apex-greeted-v1';
const view=new URLSearchParams(location.search).get('view')||'';
// A window opened by the atlas for the voice link (#n7voice) or a map handoff (#atlas) keeps the classic view.
const handoff=window.N7_CLASSIC_START===true||/[#&](?:n7voice|atlas)=/.test(location.hash);
// The stage is never the entry screen; only the NABOU view shows it (without its figure).
// N7_LEGACY_STAGE_ENTRY is a test-harness global (no URL reaches it): the stage tests use it to exercise the stage itself.
const legacyEntry=window.N7_LEGACY_STAGE_ENTRY===true;
if(!handoff&&!legacyEntry&&view!=='nabou')window.N7_CLASSIC_START=true;
const $=id=>document.getElementById(id);
const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};

/* ---------- navigation phrases (same rules and test sentences as N7Navigation.ts in the atlas) ---------- */
const plain=t=>String(t||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[.,!;:·…«»"'()?]/g,' ').replace(/\s+/g,' ').trim();
const NAME='(?:n7|ν7|ενεπτα|εν 7|η n7|n 7)';
const OPEN='(?:ανοιξε|ανοιξε μου|πηγαινε|παμε|παω|μεταβαση|μεταφερε με|δειξε μου|δειξε|επεστρεψε|γυρνα|γυρισε|επιστροφη)';
const ARTICLE='(?:(?:στο|στον|στην|στη|στους|στα|στις|σε|το|τον|την|τη|τα|τις|τους)\\s+)?';
const CHAT='(?:γραπτο\\s+)?(?:chat|τσατ|συνομιλια|συνομιλιες|γραπτη συνομιλια|γραπτο περιβαλλον)';
const MAP='(?:nabou|ναμπου|ναμπο|ιστορικο\\s+χαρτη|ιστορικο\\s+χαρτη\\s+nabou|χαρτη|χαρτη nabou|ιστορικους\\s+χαρτες|χαρτες nabou)';
const LIBRARY='(?:ιστορικη\\s+)?(?:βιβλιοθηκη|βιβλιοθηκη πηγων|βιβλιοθηκη n7)';
const AGENTS='(?:agents|agent|αγεντς|αγεντ|ατζεντς|ατζεντ|εργασιες)';
const HUMANOID='(?:ολογραμμα|ολογραμμα n7|humanoid|χιουμανοιντ|ουμανοιντ|αρχικη|αρχικη οθονη|γυναικεια μορφη)';
const wrap=what=>new RegExp('^(?:'+NAME+'\\s+)?(?:παρακαλω\\s+)?'+OPEN+'\\s+'+ARTICLE+what+'(?:\\s+παρακαλω)?$');
const RULES=[['chat',wrap(CHAT)],['nabou',wrap(MAP)],['humanoid',wrap(HUMANOID)],['library',wrap(LIBRARY)],['agents',wrap(AGENTS)]];
function command(text){const c=plain(text);if(!c||c.length>80)return null;for(const [t,re] of RULES)if(re.test(c))return t;return null;}

/* ---------- moving ---------- */
const url=t=>t==='humanoid'?HOME:'/?view='+t;
function go(t){location.assign(url(t));}
// Called by the stage before it routes a command: true when the command was a move and was carried out here.
function handle(text,{inStage=false}={}){
  const t=command(text);if(!t)return false;
  if(t==='humanoid'){go('humanoid');return true;}
  if(t==='chat'){if(inStage&&window.N7Stage){window.N7Stage.nav('chat');return true;}if(view==='chat'||!view){return true;}go('chat');return true;}
  if(t==='nabou'){if(inStage)return false;go('nabou');return true;} // inside the stage the existing NABOU intent opens it and waits for the map's confirmation
  if(t==='library'||t==='agents'){if(window.N7Stage){window.N7Stage.nav(t);return true;}go(t);return true;}
  return false;
}
// The stage's own «Humanoid» entries lead to the APEX Humanoid, not to the old figure.
function toHumanoid(){go('humanoid');return true;}
window.N7ApexHome={command,handle,toHumanoid,url,view:()=>view};

/* ---------- small, discreet navigation strip ---------- */
function strip(items){
  document.querySelector('.n7-home-nav')?.remove();
  const bar=make('nav',null,'n7-home-nav');bar.setAttribute('aria-label','Πλοήγηση N7');
  for(const [t,label] of items){const b=make('button',label);b.type='button';b.dataset.nav=t;b.addEventListener('click',()=>go(t));bar.append(b);}
  document.body.append(bar);document.body.classList.add('n7-home-strip');
}

/* ---------- arrival ---------- */
function overlay(text){
  const o=make('div',null,'n7-home-loading');o.id='n7HomeLoading';o.setAttribute('role','status');
  o.append(make('strong','N7','n7-home-brand'),make('p',text));document.body.append(o);return o;
}
async function apexAvailable(){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4500);
  try{
    const r=await fetch(RELEASE,{cache:'no-store',credentials:'same-origin',redirect:'error',signal:controller.signal});
    if(!r.ok||!(r.headers.get('content-type')||'').includes('json'))return false;
    const d=await r.json();return d&&d.product==='N7-APEX-PREVIEW';
  }catch{return false;}finally{clearTimeout(timer);}
}
let arrived=false;
async function arrive(){
  if(arrived)return;arrived=true;
  if(handoff||legacyEntry)return;
  if(view==='chat'){strip([['humanoid','Humanoid'],['nabou','NABOU']]);return;}
  if(view==='library'||view==='agents'){
    strip([['humanoid','Humanoid'],['chat','Chat']]);
    // The existing library panel / task view of this page, opened through the stage's own navigation.
    const started=Date.now(),wait=setInterval(()=>{
      if(window.N7Stage&&document.getElementById('n7Stage')?.isConnected){clearInterval(wait);window.N7Stage.nav(view);}
      else if(Date.now()-started>10000)clearInterval(wait);
    },150);
    return;
  }
  if(view==='nabou'){
    document.body.classList.add('n7-apex-home-nabou');strip([['humanoid','Humanoid'],['chat','Chat']]);
    const started=Date.now(),wait=setInterval(()=>{
      if(window.N7Stage&&document.getElementById('n7Stage')?.isConnected){clearInterval(wait);window.N7Stage.nav('nabou');}
      else if(Date.now()-started>10000)clearInterval(wait);
    },150);
    return;
  }
  const cover=overlay('Άνοιγμα του N7 Humanoid…');
  if(await apexAvailable()){location.replace(HOME);return;}
  // Safe entrance: the Humanoid cannot be reached, so the written Chat opens with its history. Nothing is blank.
  cover.remove();
  strip([['humanoid','Humanoid'],['nabou','NABOU']]);
  const note=make('p','Το Humanoid δεν είναι διαθέσιμο αυτή τη στιγμή. Συνεχίζεις στο γραπτό Chat· μπορείς να ξαναδοκιμάσεις με το κουμπί «Humanoid».','n7-home-notice');
  note.setAttribute('role','alert');document.body.append(note);setTimeout(()=>note.classList.add('n7-home-notice-quiet'),12000);
}
function watch(){
  const app=$('application');if(!app)return;
  const check=()=>{if(!app.classList.contains('hidden'))void arrive();};
  new MutationObserver(check).observe(app,{attributes:true,attributeFilter:['class']});check();
}
// A new login gets a new welcome.
document.addEventListener('click',e=>{if(e.target?.closest?.('#logout')){try{sessionStorage.removeItem(GREETED);}catch{}}},true);
// Written Chat: a spoken or typed move is not a question for the model.
function guardComposer(){
  const message=$('message'),form=message?.form;if(!form)return;
  form.addEventListener('submit',e=>{if(window.N7Stage&&document.getElementById('n7Stage')&&!document.getElementById('n7Stage').hidden)return;
    const text=message.value;if(command(text)&&handle(text)){e.preventDefault();e.stopImmediatePropagation();message.value='';}},true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{watch();guardComposer();},{once:true});else{watch();guardComposer();}
})();
