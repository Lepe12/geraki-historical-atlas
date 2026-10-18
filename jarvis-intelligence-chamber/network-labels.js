// Layout only the HTML labels; the scene, camera, particles and colours are unchanged.
const host=document.getElementById('nodeLabels');
let queued=false,last=0;
const overlaps=(a,b)=>a.left<b.right+8&&a.right>b.left-8&&a.top<b.bottom+8&&a.bottom>b.top-8;
function layout(){
 queued=false;
 const labels=[...host.querySelectorAll('.node-label')];
 if(innerWidth>800){for(const el of labels){delete el.dataset.compactHidden;el.style.removeProperty('--label-shift');}return;}
 const exclusions=['.nxs-dock','.workspace-welcome','#operatorCommand','.nxs-3d-tools'].map(s=>document.querySelector(s)).filter(e=>e&&e.getClientRects().length).map(e=>e.getBoundingClientRect());
 const accepted=[];
 labels.sort((a,b)=>Number(b.style.transform.includes('1.09'))-Number(a.style.transform.includes('1.09')));
 for(const el of labels){
  const x=parseFloat(el.style.left),y=parseFloat(el.style.top);
  const width=el.offsetWidth,height=el.offsetHeight;
  const left=Math.min(Math.max(x+17,12),innerWidth-width-12);
  el.style.setProperty('--label-shift',(left-x)+'px');
  const rect={left,right:left+width,top:y-height/2,bottom:y+height/2};
  const outside=!Number.isFinite(x)||x<0||x>innerWidth||rect.top<142||rect.bottom>innerHeight-164||el.style.opacity==='0';
  const hidden=outside||exclusions.some(r=>overlaps(rect,r))||accepted.some(r=>overlaps(rect,r));
  el.dataset.compactHidden=String(hidden);
  if(!hidden)accepted.push(rect);
 }
 last=performance.now();
}
function schedule(){if(!queued&&performance.now()-last>100){queued=true;requestAnimationFrame(layout);}}
// Renderer writes left/top/transform; own data attributes do not re-trigger this observer.
new MutationObserver(records=>{if(records.some(r=>r.attributeName==='style'))schedule();}).observe(host,{subtree:true,attributes:true,attributeFilter:['style'],childList:true});
addEventListener('resize',()=>{last=0;schedule();});schedule();
// Opening/closing a workspace changes which controls occupy the scene even when
// the renderer's node coordinates have not changed.
new MutationObserver(()=>{last=0;schedule();}).observe(document.body,{attributes:true,attributeFilter:['data-nxs-view']});
