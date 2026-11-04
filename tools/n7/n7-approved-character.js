/* N7_APPROVED_CHARACTER_V1: original artwork, only UI behavior; isolated from NABOU */
(()=>{'use strict';
if(window.__N7_APPROVED_CHARACTER_V1)return;
window.__N7_APPROVED_CHARACTER_V1=true;
const art={base:'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',eyes:'UklGRnAEAABXRUJQVlA4WAoAAAAQAAAAvwAAvwAAQUxQSFoCAAABoAXbtmnbGePZtm3btm3btm2bsW3btu3k2X57juBsvJta5yuVExETgIT/E/5P+P///NL3X8KADvMnmfRIxIFpKnXo3Ll9zYJpAZBMSiSANEWadf5nx5J0VufXDx0+/PunT27qUSItAJBJhASS5eu84ZnvD//z0LI0oIuIVGsU2/vjxQ3dS2YgQPLaEUCGqpPu/8WT7+50rkqzwbOYkrw/Xtw9sUE2ACSvCQHm77Dl3bOSLKZnOxxmim0mSec+v3Fo+XQAyMgIJC807MGfPclMsU07nZV6necjycwknXh9a68SaQAyEgLJys949IgkM/m7C+DYMzI/SWYm2aHn17bMADACgsXGvXBOMlNg0y5XETU+DCHJTJL31YammcFwyNz/8ZOSmcLa5jTOyrDlaihJZtKVbzYUR1gi1+JfJTOFNR0bTMLNRL33ZeEkmXTh1kphkG7WCZkpvOmNcnBXqllnZFFIpiuP1AADpRjwg0wRml1amdZZIIrc60Ukk3dnMTAAW7wvUyR6txYIZxMtPpUXjUxnp6eAL5HlOpmi9HRoTGo4nEwz4ZDMLAqZXiwP+jX5PBIznduYHXQYiGyLfjbJzKI4NcIPyRdcCmVmkn5fXxDOz9J196cXJcnCenZhGmITqdZ5FlaS99v9fbMhHsxYf+59n51UhFemB1mr0Bd/e2NLlwIA3UcCyfPUGrb31S++DP7Fl58MDbLi7LmgJ39+97YZHculB0DEgyQAZCxTN3SdfD5A8nrjAg9uVTF7MgAk4kaSSPIkEV8y0kAMjYT/E/5P+D/h//+eBlZQOCDwAQAAMBEAnQEqwADAAD6lUqNOpiSjIiHWCEjAFIlnbvE7ddK9rDt7lf//xuUFiD2Y26I+siY4f1ds4fCGD6yJjh/V2zh70O2J9fx7EP6I+kUZaEwAogZ8xyzfzdrCqZcvJEtZih8j9MbNaZ2bD4Ngh827xUOEMJMZjboj6yJjh/V2zh8IYPrImOH9XbOHwhg+siY4feAA/v9/ZAACgzGYHEzUEfplYD1XY/7Jr4qYidR1ZCU4i9IzVBiNbnUHe9Tjz0+fbIXf20qz9l3XOvJQw/mp8jXZ/48NxWvcijro+bsi/d3F3BJnHBPd2eLWXlwI3Mao2b13R/N57X5DpT7gyWw4S4z3UlG8CkxMttao+ZE57EhH6P69C3OG8pHCFxNymj6G01G7Zu15L2kR/d6LMkisWqAovuaGdaQt+Mu1nJMrktUeJqr+ynjz4th2ckx57rzRUq9FzaK3F2oLb5ra1DwK05hlThPMik+k+cpZ7IqVJXts/LPlyICrLBcOT9Jv8pLKKSQ03SljjOfo+VjGGhykZFCjcdE7P3nwHQLEE8d6MP7fD2DwD8QGfsPXR9EI2xlM28lVF6HEo7+/gqOoAGvrwJD/QZqhHKtUXtilPy70XuEN0XEpj+XeP833TKwkiIAXR3Eohvk3L3nDsAAAAAAAAA=='};
const state={kind:'idle',previous:new Map(),latest:new Map(),mounted:new Set(),image:null,eyes:null,winkAt:-1};
const label={idle:'Έτοιμος',think:'Σκέφτεται',work:'Εργάζεται',done:'Ολοκληρώθηκε',error:'Σφάλμα'};
function bytes(s){const raw=atob(s);return Uint8Array.from(raw,c=>c.charCodeAt(0))}
async function loadArt(){try{
  const pair=await Promise.all([createImageBitmap(new Blob([bytes(art.base)],{type:'image/webp'})),createImageBitmap(new Blob([bytes(art.eyes)],{type:'image/webp'}))]);
  state.image=pair[0];state.eyes=pair[1];state.mounted.forEach(x=>x.style.visibility='visible');
}catch(e){console.warn('N7 artwork could not load:',e.name)}}
function setKind(kind){if(!label[kind])return;if(kind==='done'&&state.kind!=='done')state.winkAt=performance.now();state.kind=kind;for(const x of state.mounted){x.setAttribute('aria-label','N7: '+label[kind]);x.title='N7 · '+label[kind]}}
function mount(parent,small){if(!parent||parent.querySelector('.n7-live-presence'))return;
 const box=document.createElement('div');box.className='n7-live-presence'+(small?' n7-live-small':'');box.style.cssText=small?'width:52px;height:52px;flex:0 0 52px;':'width:min(210px,60vw);height:auto;aspect-ratio:1;margin:0 auto 8px;';
 box.style.visibility='hidden';box.setAttribute('role','img');box.setAttribute('aria-label','N7');
 const canvas=document.createElement('canvas');canvas.width=650;canvas.height=650;canvas.style.cssText='width:100%;height:100%;display:block;';
 box.append(canvas);parent.prepend(box);state.mounted.add(box);
 function draw(now){if(!box.isConnected){state.mounted.delete(box);return;}
 const ctx=canvas.getContext('2d');if(state.image&&state.eyes&&ctx){
 const wave=window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:Math.sin(now*.0011)*3;
 ctx.clearRect(0,0,650,650);ctx.save();ctx.translate(0,wave);
 ctx.drawImage(state.image,0,0,650,650);
 ctx.globalAlpha=state.kind==='think'?.86:1;ctx.drawImage(state.eyes,0,0,650,650);ctx.globalAlpha=1;
 const t=(now-state.winkAt)/1000;
 if(state.kind==='done'&&t>=0&&t<1.05){
 const closure=t<.18?t/.18:t<.65?1:Math.max(0,1-(t-.65)/.25);
 ctx.globalAlpha=closure;ctx.fillStyle='#03131b';ctx.beginPath();ctx.ellipse(382,304,49,18,-.18,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle='#76edff';ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(341,306);ctx.quadraticCurveTo(378,317,418,290);ctx.stroke();ctx.globalAlpha=1;
 }ctx.restore();
 }requestAnimationFrame(draw)}
 requestAnimationFrame(draw);
}
function ensureMounted(){
 const header=document.querySelector('#application header');
 if(header)mount(header,true);
 const welcome=document.querySelector('#messages .welcome');
 if(welcome)mount(welcome,false);
}
let polling=false;
async function syncTasks(){if(polling)return;polling=true;
try{
 const a=await fetch('/api/tasks',{credentials:'same-origin',cache:'no-store'});
 if(!a.ok)return;const x=await a.json();
 if(!Array.isArray(x.tasks))return;
 let success=false;const latest=new Map();
 for(const t of x.tasks){latest.set(t.id,t.status);
 if(state.previous.has(t.id)&&state.previous.get(t.id)!==t.status&&t.status==='completed')success=true;}
 const hadHistory=state.previous.size>0;state.previous=latest;
 if(success){setKind('done');return;}
 if(x.tasks.some(t=>t.status==='running')){setKind('work');return;}
 if(x.tasks.some(t=>t.status==='queued')){setKind('think');return;}
 if(x.tasks[0]?.status==='failed'){setKind('error');return;}
 if(state.kind==='work'||state.kind==='think')setKind('idle');
}catch(_){/* No user-visible false success after a network error */}
finally{polling=false}}
function init(){
 ensureMounted();
 const observer=new MutationObserver(()=>ensureMounted());
 const messages=document.getElementById('messages');if(messages)observer.observe(messages,{childList:true,subtree:false});
 const form=document.getElementById('chat');
 if(form)form.addEventListener('submit',()=>setKind('think'),{capture:true});
 setInterval(()=>{ensureMounted();syncTasks();},4000);
 syncTasks();
 loadArt();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();