import {validateEvidenceCollection,validateCandidates,visibleFeatures,anchor} from "./historical-map-core.mjs";

const $=id=>document.getElementById(id);
const canvas=$("mapCanvas"),ctx=canvas.getContext("2d");
let collection=null,candidates=null,coast=[],selected=null,visible=[],year=1670;
let zoom=1,panX=0,panY=0,drag=false,dragStart=null,moved=false;
let mapAvailable=false,loadError="";
const BOUNDS={west:-18,east:48,south:24,north:48};

function alertState(message,error=false) {
  $("status").textContent=message;
  $("status").style.borderColor=error?"#b25f5f":"#6b8290";
}
function resize(){
  const r=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.max(1,Math.round(r.width*dpr));
  canvas.height=Math.max(1,Math.round(r.height*dpr));
  ctx.setTransform(dpr,0,0,dpr,0,0);
  render();
}
function dims(){return {w:canvas.clientWidth,h:canvas.clientHeight};}
function project(lon,lat){
  const {w,h}=dims(),pad=35;
  const baseX=pad+(lon-BOUNDS.west)/(BOUNDS.east-BOUNDS.west)*(w-2*pad);
  const baseY=pad+(BOUNDS.north-lat)/(BOUNDS.north-BOUNDS.south)*(h-2*pad);
  return [w/2+(baseX-w/2)*zoom+panX,h/2+(baseY-h/2)*zoom+panY];
}
function inflateArc(arc,transform){
  let x=0,y=0;return arc.map(([dx,dy])=>{
    x+=dx;y+=dy;
    return [x*transform.scale[0]+transform.translate[0],y*transform.scale[1]+transform.translate[1]];
  });
}
function decodeCoast(topo){
  if(!topo?.transform||!topo?.arcs||!topo?.objects?.land) throw Error("Invalid coastline topology");
  const arcs=topo.arcs.map(a=>inflateArc(a,topo.transform)),shapes=[];
  function arc(n){const a=arcs[n<0?~n:n];return n<0?[...a].reverse():a;}
  function polygon(ids){const coordinates=[];for(const id of ids)coordinates.push(...arc(id));
    if(coordinates.length>1)shapes.push(coordinates);
  }
  function visit(g){
    if(g.type==="Polygon")g.arcs.forEach(polygon);
    else if(g.type==="MultiPolygon")g.arcs.forEach(p=>p.forEach(polygon));
    else if(g.type==="GeometryCollection")g.geometries.forEach(visit);
  }
  visit(topo.objects.land);return shapes;
}
async function loadCoast(){
  try{
    const r=await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json");
    if(!r.ok)throw Error("HTTP "+r.status);
    coast=decodeCoast(await r.json());mapAvailable=true;
  }catch(e){loadError="Ακτογραμμές προσωρινά μη διαθέσιμες";console.warn("NABOU map basemap",e);}
  render();
}
function strokeGeo(points,{close=false,fill=false}={}){
  if(!points.length)return;let started=false;
  ctx.beginPath();
  for(const [lon,lat] of points){
    if(lon<BOUNDS.west-5||lon>BOUNDS.east+5||lat<BOUNDS.south-5||lat>BOUNDS.north+5){
      if(started){ctx.stroke();started=false;ctx.beginPath();}
      continue;
    }
    const [x,y]=project(lon,lat);
    if(!started){ctx.moveTo(x,y);started=true;}else ctx.lineTo(x,y);
  }
  if(close&&started)ctx.closePath();
  if(fill&&started)ctx.fill();
  if(started)ctx.stroke();
}
function outlineFeature(feature){
  const g=feature.geometry;
  if(g.type==="Polygon")for(const ring of g.coordinates)strokeGeo(ring,{close:true,fill:true});
  else if(g.type==="MultiPolygon")for(const poly of g.coordinates)for(const ring of poly)strokeGeo(ring,{close:true,fill:true});
}
function render(){
  if(!ctx)return;
  const {w,h}=dims();
  if(!w||!h)return;
  ctx.clearRect(0,0,w,h);
  const bg=ctx.createLinearGradient(0,0,w,h);
  bg.addColorStop(0,"#0b2535");bg.addColorStop(1,"#05111e");
  ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
  ctx.lineWidth=1;ctx.strokeStyle="rgba(79,152,171,.15)";
  for(let lon=-15;lon<=45;lon+=5)strokeGeo([[lon,24],[lon,48]]);
  for(let lat=25;lat<=45;lat+=5)strokeGeo([[-18,lat],[48,lat]]);
  ctx.lineWidth=1;ctx.strokeStyle="rgba(108,197,200,.56)";
  for(const coastLine of coast)strokeGeo(coastLine);
  if(!mapAvailable){ctx.font="12px monospace";ctx.fillStyle="#7cabb7";ctx.fillText(loadError||"Φόρτωση ακτογραμμών…",30,40);}
  visible=collection?visibleFeatures(collection,year,{includeUndated:$("undated").checked,filter:$("searchLabels").value}):[];
  for(const feature of visible){
    const isSelected=selected?.id===feature.id;
    ctx.strokeStyle=isSelected?"#f6e5a7":"rgba(246,194,110,.75)";
    ctx.fillStyle="rgba(246,194,110,.10)";ctx.lineWidth=isSelected?2.5:1.25;
    if(feature.geometry.type!=="Point")outlineFeature(feature);
    const [lon,lat]=anchor(feature.geometry),[x,y]=project(lon,lat);
    if(x<0||x>w||y<0||y>h)continue;
    ctx.beginPath();ctx.arc(x,y,isSelected?6:3.6,0,Math.PI*2);
    ctx.fillStyle=isSelected?"#fff1b5":"#f2c77a";ctx.fill();
    ctx.font="11px ui-monospace, monospace";ctx.fillStyle=isSelected?"#fff1b5":"#cfe4e9";
    ctx.fillText(feature.properties.label.slice(0,32),x+8,y-7);
  }
  $("mapCount").textContent=visible.length+" γεωαναφερμένες επιγραφές";
  if(!collection){
    ctx.fillStyle="#a8c7d1";ctx.font="14px system-ui";
    ctx.textAlign="center";
    ctx.fillText("Εισαγάγετε GeoJSON με πραγματική προέλευση για να εμφανιστούν επιγραφές.",w/2,h*.88);
    ctx.textAlign="start";
  }
}
function addField(dl,name,value){
  const dt=document.createElement("dt"),dd=document.createElement("dd");
  dt.textContent=name;dd.textContent=value==null?"Δεν έχει καταγραφεί":String(value);
  dl.append(dt,dd);
}
function externalLink(parent,label,url){
  try{
    const parsed=new URL(url);
    if(!["https:","http:"].includes(parsed.protocol))return;
    const link=document.createElement("a");
    link.href=parsed.href;link.target="_blank";link.rel="noopener noreferrer";
    link.textContent=label;parent.append(link);
  }catch(_){}
}
function detailsFor(feature){
  const root=$("details");root.replaceChildren();
  if(!feature){const p=document.createElement("p");p.textContent="Επιλέξτε γεωαναφερμένη επιγραφή στον χάρτη.";root.append(p);return;}
  const p=feature.properties;
  const status=document.createElement("span");status.className="hm-pending";status.textContent="ΥΠΟΨΗΦΙΑ / ΜΗ ΕΠΑΛΗΘΕΥΜΕΝΗ";
  const heading=document.createElement("h3");heading.textContent=p.label;
  const dl=document.createElement("dl");
  addField(dl,"Αρχική OCR ανάγνωση",p.raw_ocr_label);
  addField(dl,"Χάρτης / προέλευση",p.map_title);
  addField(dl,"Αναγνωριστικό πηγής",p.source_id);
  addField(dl,"Δικαιώματα",p.source_rights);
  addField(dl,"Χρονολογία",p.start_year==null&&p.end_year==null?"Άγνωστη":String(p.start_year??"…")+"–"+String(p.end_year??"…"));
  addField(dl,"OCR score (όχι ιστορική βεβαιότητα)",p.ocr_score??"Άγνωστο");
  addField(dl,"Γεωγραφική θέση","Περίγραμμα επιγραφής στον γεωαναφερμένο χάρτη · όχι βεβαιωμένη θέση τόπου");
  root.append(status,heading,dl);
  const linkbox=document.createElement("p");externalLink(linkbox,"Άνοιγμα αρχικού τεκμηρίου ↗",p.source_url);root.append(linkbox);
  const h=document.createElement("h3");h.textContent="Πιθανές ταυτίσεις WHG";root.append(h);
  const matches=(candidates?.candidates||[]).filter(x=>x.map_feature_id===feature.id);
  if(!matches.length){const hint=document.createElement("p");hint.textContent="Δεν έχουν εισαχθεί υποψήφιες ταυτίσεις για αυτή την επιγραφή.";root.append(hint);return;}
  const ul=document.createElement("ul");
  for(const m of matches.slice(0,12)){
    const li=document.createElement("li");
    li.textContent=String(m.candidate_name||m.candidate_place_id)+" — "+String(m.candidate_place_id)+
      " · WHG όνομα-confidence: "+String(m.name_confidence_absolute??"δεν μετρήθηκε")+
      " · ΑΠΑΙΤΕΙΤΑΙ ΕΡΕΥΝΗΤΙΚΟΣ ΕΛΕΓΧΟΣ";
    ul.append(li);
  }
  root.append(ul);
}
async function loadFile(file,kind) {
  if(!file)return;
  if(file.size>8*1024*1024){alertState("Το αρχείο υπερβαίνει τα 8 MB",true);return;}
  try{
    const data=JSON.parse(await file.text());
    if(kind==="features"){
      collection=validateEvidenceCollection(data);selected=null;
      // A previous candidate file may belong to a different dataset; discard it.
      candidates=null;$("candidatesFile").value="";
      alertState(collection.features.length+" επιγραφές φορτώθηκαν τοπικά");
    } else {
      if(!collection)throw Error("Φορτώστε πρώτα το GeoJSON");
      const parsed=validateCandidates(data);
      const ids=new Set(collection.features.map(x=>x.id));
      if(parsed.candidates.some(x=>!ids.has(x.map_feature_id)))throw Error("Οι υποψήφιες ταυτίσεις δεν ανήκουν στο τρέχον αρχείο");
      candidates=parsed;alertState(parsed.candidates.length+" υποψήφιες ταυτίσεις φορτώθηκαν");
    }
    detailsFor(null);render();
  }catch(e){alertState("Απορρίφθηκε αρχείο: "+String(e.message||e).slice(0,120),true);}
}
$("rawOcrFile").addEventListener("change",async e=>{
  const file=e.target.files?.[0];
  if(!file)return;
  const report=$("rawOcrReport");
  try{
    if(file.size>8*1024*1024)throw Error("Το OCR αρχείο υπερβαίνει τα 8 MB");
    const data=JSON.parse(await file.text());
    if(data.schema!=="nabou-unlocated-historical-map-ocr-v1" ||
       data.georeferencing_status!=="NOT_GEOREFERENCED" ||
       data.historically_verified!==0 ||
       !Array.isArray(data.labels) || data.labels.length>4000 ||
       data.labels.some(x=>x.geolocation!==null || x.historically_verified!==false ||
         typeof x.text_raw!=="string" || x.text_raw.length>140)) {
      throw Error("Δεν είναι ασφαλές μη γεωαναφερμένο OCR αρχείο");
    }
    const fragment=document.createDocumentFragment();
    const heading=document.createElement("strong");
    heading.textContent=data.labels.length+" OCR επιγραφές · ΧΩΡΙΣ γεωγραφική ταύτιση";
    fragment.append(heading);
    const paragraph=document.createElement("p");
    paragraph.textContent="Πηγή: "+String(data.source?.title||data.source?.id||"Άγνωστη")+
      ". Εμφανίζονται οι πρώτες 25 μη ελεγμένες αναγνώσεις. Δεν μεταφέρονται στον χάρτη.";
    fragment.append(paragraph);
    const list=document.createElement("ol");
    for(const item of data.labels.slice(0,25)){
      const li=document.createElement("li");
      li.textContent=item.text_raw+" · OCR "+
        Math.round(100*Number(item.ocr_confidence||0))+"% · pixels "+
        JSON.stringify(item.pixel_bbox||[]);
      list.append(li);
    }
    fragment.append(list);
    report.replaceChildren(fragment);
  }catch(error){
    report.textContent="Αδυναμία εισαγωγής OCR: "+String(error.message||error).slice(0,130);
  }
});
$("featuresFile").addEventListener("change",e=>loadFile(e.target.files?.[0],"features"));
$("candidatesFile").addEventListener("change",e=>loadFile(e.target.files?.[0],"candidates"));
$("year").addEventListener("input",e=>{year=Number(e.target.value);$("yearLabel").textContent=String(year);render();});
$("undated").addEventListener("change",render);
$("searchLabels").addEventListener("input",render);
$("resetMap").addEventListener("click",()=>{zoom=1;panX=0;panY=0;render();});
canvas.addEventListener("pointerdown",e=>{
  drag=true;moved=false;dragStart={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove",e=>{
  if(!drag)return;
  const dx=e.clientX-dragStart.x,dy=e.clientY-dragStart.y;
  if(Math.abs(dx)+Math.abs(dy)>2)moved=true;
  panX+=dx;panY+=dy;dragStart={x:e.clientX,y:e.clientY};render();
});
canvas.addEventListener("pointerup",e=>{
  drag=false;
  if(moved)return;
  const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
  let closest=null,distance=20*20;
  for(const f of visible){
    const xy=project(...anchor(f.geometry));
    const d=(x-xy[0])**2+(y-xy[1])**2;
    if(d<distance){distance=d;closest=f;}
  }
  selected=closest;detailsFor(closest);render();
});
canvas.addEventListener("pointercancel",()=>{drag=false;});
canvas.addEventListener("wheel",e=>{
  e.preventDefault();zoom=Math.max(.75,Math.min(12,zoom*Math.exp(-e.deltaY*.001)));render();
},{passive:false});
window.addEventListener("resize",resize);
resize();loadCoast();
