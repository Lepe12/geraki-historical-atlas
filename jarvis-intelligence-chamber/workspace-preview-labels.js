// Accessible labels follow the unchanged renderer's projected nodes.
const $=id=>document.getElementById(id);
export const sectors=[
 ['spanish_simancas','Ισπανία','Ισπανικά αρχεία'],['venetian','Βενετία','Βενετικά αρχεία'],['french','Γαλλία','Γαλλικά αρχεία'],['british','Βρετανία','Βρετανικές συλλογές'],['dutch','Ολλανδία','Ολλανδικές συλλογές'],['german','Γερμανία','Γερμανικές συλλογές'],['italian_states','Ιταλία','Ιταλικά αρχεία'],['greek','Ελλάδα','Ελληνικές συλλογές'],['ottoman','Οθωμανικά αρχεία','Οθωμανικές πηγές'],['north_african','Βόρεια Αφρική','Πηγές Βόρειας Αφρικής'],['travellers','Περιηγητές','Περιηγητές και αφηγηματικές πηγές'],['source_genealogy','Εξάρτηση πηγών','Έλεγχος αν οι πηγές αντιγράφουν η μία την άλλη'],['identity_resolution','Ταύτιση προσώπων','Έλεγχος ταυτότητας και παραλλαγών ονομάτων'],['contradiction','Αντιφάσεις','Διαφωνίες ανάμεσα στις πηγές'],['relationship_network','Σχέσεις','Σχέσεις προσώπων και τόπων'],['timeline','Χρονολόγηση','Έλεγχος χρονολογιών'],['pirate_base','Πειρατικές βάσεις','Έλεγχος τοποθεσιών και αποδόσεων']
];
export const focusSector=id=>window.dispatchEvent(new CustomEvent('jarvis:focus-agent',{detail:{agent_id:id}}));
let snapshot=null,selected='',lastFrame=0;
const overlay=document.createElement('div');overlay.id='readableLabels';overlay.setAttribute('aria-label','Ερευνητές στον χάρτη');
const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('label-leaders');svg.setAttribute('aria-hidden','true');overlay.append(svg);$('mapStage').append(overlay);
const measurement=document.createElement('canvas').getContext('2d');measurement.font='13px Arial';
const labels=sectors.map(([id,name,description],i)=>{const button=document.createElement('button');button.type='button';button.className='sector-label';button.dataset.agent=id;button.textContent=name;button.title=description;button.onclick=()=>{selected=id;focusSector(id);};overlay.append(button);const line=document.createElementNS(svg.namespaceURI,'line');svg.append(line);return {id,name,description,i,button,line,w:Math.ceil(measurement.measureText(name).width)+23,h:28};});
export function updateLabels(s){snapshot=s;for(const label of labels){const agent=s.agents.find(a=>a.id===label.id);const active=agent&&['RUNNING','ACTIVE','PREPARING'].includes(agent.status);label.button.classList.toggle('working',!!active);label.button.setAttribute('aria-label',label.name+(active?' · εργάζεται τώρα':''));}}
window.addEventListener('jarvis:focus-agent',e=>{selected=e.detail?.agent_id||'';});
$('closeDetail').addEventListener('click',()=>selected='');$('resetView').addEventListener('click',()=>selected='');
const overlaps=(a,b)=>a.x<b.x+b.w+7&&a.x+a.w+7>b.x&&a.y<b.y+b.h+5&&a.y+a.h+5>b.y;
function position(now){requestAnimationFrame(position);if(now-lastFrame<70)return;lastFrame=now;const source=[...$('nodeLabels').children];if(source.length!==labels.length)return;const stage=$('mapStage').getBoundingClientRect(),w=stage.width,h=stage.height;if(w<1||h<1)return;const used=[];
 for(const id of ['operatorCommand','missionCard']){const r=$(id).getBoundingClientRect();used.push({x:r.left-stage.left-8,y:r.top-stage.top-8,w:r.width+16,h:r.height+16});}
 used.push({x:w-245,y:110,w:245,h:55});
 const ordered=[...labels].sort((a,b)=>{const ap=a.id===selected?2:a.button.classList.contains('working')?1:0,bp=b.id===selected?2:b.button.classList.contains('working')?1:0;return bp-ap||parseFloat(source[a.i].style.top)-parseFloat(source[b.i].style.top);});
 let placed=0;for(const label of ordered){const raw=source[label.i],x=parseFloat(raw.style.left),y=parseFloat(raw.style.top);const show=Number.isFinite(x)&&Number.isFinite(y)&&x>=8&&x<w-8&&y>75&&y<h-35;let box=null;if(show){const dy=[0,-30,30,-60,60,-90,90,-120,120];for(const d of dy){for(const side of [1,-1]){const candidate={x:Math.max(8,Math.min(w-label.w-8,side===1?x+18:x-label.w-18)),y:Math.max(100,Math.min(h-42,y-14+d)),w:label.w,h:label.h};if(!used.some(r=>overlaps(candidate,r))){box=candidate;break;}}if(box)break;}}
 label.button.hidden=!box;label.line.style.display=box?'':'none';if(!box)continue;used.push(box);placed++;label.button.style.left=box.x+'px';label.button.style.top=box.y+'px';label.button.style.width=box.w+'px';label.button.setAttribute('aria-pressed',String(label.id===selected));label.line.setAttribute('x1',x);label.line.setAttribute('y1',y);label.line.setAttribute('x2',x<box.x?box.x:x>box.x+box.w?box.x+box.w:x);label.line.setAttribute('y2',box.y+14);
 }
 overlay.dataset.visible=String(placed);
}
requestAnimationFrame(position);
