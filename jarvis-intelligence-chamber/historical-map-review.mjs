import {validateOcr,fileHash,newReview,applyReading,addGcp,csvForQgisGcps,reviewStats} from "./historical-map-review-core.mjs";
const $=id=>document.getElementById(id);
const canvas=$("reviewCanvas"),ctx=canvas.getContext("2d");
let ocr=null,review=null,image=null,imageHash=null,imageObjectUrl=null,chosen=null;
let zoom=1,offsetX=0,offsetY=0,dragged=false,start=null,gcpMode=false;
function status(t,error=false){
  $("reviewStatus").textContent=t;
  $("reviewStatus").style.borderColor=error?"#a65252":"#537e90";
}
function imageCoords(){
  const w=canvas.clientWidth,h=canvas.clientHeight;
  if(!image||!w||!h)return {scale:1,ox:0,oy:0};
  const base=Math.min(w/image.naturalWidth,h/image.naturalHeight);
  const scale=base*zoom;
  return {scale,ox:(w-image.naturalWidth*scale)/2+offsetX,
    oy:(h-image.naturalHeight*scale)/2+offsetY};
}
function viewPoint(x,y){
  const {scale,ox,oy}=imageCoords();
  return [ox+x*scale,oy+y*scale];
}
function unproject(px,py){
  const {scale,ox,oy}=imageCoords();
  return [(px-ox)/scale,(py-oy)/scale];
}
function resize(){
  const dpr=Math.min(devicePixelRatio||1,2),r=canvas.getBoundingClientRect();
  canvas.width=Math.max(1,Math.round(r.width*dpr));
  canvas.height=Math.max(1,Math.round(r.height*dpr));
  ctx.setTransform(dpr,0,0,dpr,0,0);render();
}
function filtered(){
  if(!review)return [];
  const text=$("readingFilter").value.trim().toLowerCase();
  const threshold=Number($("minConfidence").value)/100;
  return review.labels.filter(x=>x.ocr_confidence>=threshold &&
    (!text||x.ocr_text.toLowerCase().includes(text)||
      (x.final_reading||"").toLowerCase().includes(text)));
}
function render(){
  const w=canvas.clientWidth,h=canvas.clientHeight;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle="#091824";ctx.fillRect(0,0,w,h);
  if(!image){
    ctx.fillStyle="#9ec1cb";ctx.textAlign="center";
    ctx.font="14px system-ui";
    ctx.fillText("Επιλέξτε πρωτότυπη εικόνα και το αντίστοιχο OCR JSON",w/2,h/2);
    ctx.textAlign="left";return;
  }
  const {scale,ox,oy}=imageCoords();
  ctx.drawImage(image,ox,oy,image.naturalWidth*scale,image.naturalHeight*scale);
  if(!review)return;
  const items=filtered();
  for(const label of items){
    const [x,y,width,height]=label.pixel_bbox;
    const [sx,sy]=viewPoint(x,y);
    const selected=label.label_id===chosen?.label_id;
    ctx.strokeStyle=selected?"#fff58d":label.decision==="READING_ACCEPTED"?"#5fe2b5":
      label.decision==="READING_REJECTED"?"#da5b63":"#6be0ee";
    ctx.lineWidth=selected?3:1;
    ctx.strokeRect(sx,sy,width*scale,height*scale);
    if(selected){
      ctx.fillStyle="rgba(255,245,141,.14)";
      ctx.fillRect(sx,sy,width*scale,height*scale);
    }
  }
  for(const g of review.gcps){
    const [x,y]=viewPoint(g.pixel_x,g.pixel_y);
    ctx.strokeStyle="#efc57d";ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(x-7,y);ctx.lineTo(x+7,y);
    ctx.moveTo(x,y-7);ctx.lineTo(x,y+7);ctx.stroke();
  }
  $("labelCount").textContent=items.length+" επιγραφές στο φίλτρο · "+
      (chosen? "επιλεγμένη: "+chosen.ocr_text : "χωρίς επιλογή");
}
function select(label){
  chosen=label||null;
  $("acceptReading").disabled=!chosen||!review;
  $("rejectReading").disabled=!chosen||!review;
  if(chosen){
    $("chosenLabel").textContent="Αυτόματη ανάγνωση: "+chosen.ocr_text+
      " · OCR "+Math.round(chosen.ocr_confidence*100)+"% · pixels "+
      chosen.pixel_bbox.join(", ")+" · "+chosen.decision;
    $("correctedReading").value=chosen.final_reading||chosen.ocr_text;
    // navigate to the original source label while remaining inside map view
    const [x,y,w,h]=chosen.pixel_bbox,[sx,sy]=viewPoint(x+w/2,y+h/2);
    offsetX+=canvas.clientWidth/2-sx;offsetY+=canvas.clientHeight/2-sy;
  } else {
    $("chosenLabel").textContent="Δεν έχει επιλεγεί OCR.";
    $("correctedReading").value="";
  }
  render();
}
function stats(){
  $("reviewStats").textContent=review?JSON.stringify(reviewStats(review),null,2):
    "Δεν υπάρχουν διαθέσιμα ερευνητικά δεδομένα.";
  $("gcpCount").textContent=review?review.gcps.length+" προτεινόμενα GCP":"0 GCP";
}
async function tryMatch(){
  if(!ocr||!image||!imageHash){stats();render();return;}
  try{
    review=newReview(ocr,imageHash);
    chosen=null;select(null);stats();
    $("exportReview").disabled=false;
    $("exportGcpCsv").disabled=false;
    status("SHA-256 εικόνας: MATCH · "+review.labels.length+" OCR snippets");
    $("sourceState").textContent="Επιβεβαιώθηκε ότι το OCR προέρχεται από την ακριβή εικόνα. Οι αναγνώσεις παραμένουν μη ελεγμένες.";
  }catch(err){
    review=null;chosen=null;stats();render();
    $("exportReview").disabled=true;$("exportGcpCsv").disabled=true;
    status("Ασυμφωνία εικόνας / OCR",true);
    $("sourceState").textContent=String(err.message||err);
  }
}
$("originalImage").addEventListener("change",async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
    image=null;imageHash=null;review=null;chosen=null;
    $("exportReview").disabled=true;$("exportGcpCsv").disabled=true;
    render();
    if(file.size>35*1024*1024||!["image/jpeg","image/png"].includes(file.type))throw Error("Χρειάζεται JPG/PNG μέχρι 35 MB");
    const hash=await fileHash(file);
    if(imageObjectUrl)URL.revokeObjectURL(imageObjectUrl);
    imageObjectUrl=URL.createObjectURL(file);
    const img=new Image();
    await new Promise((resolve,reject)=>{
      img.onload=resolve;img.onerror=()=>reject(Error("Αποτυχία ανάγνωσης εικόνας"));
      img.src=imageObjectUrl;
    });
    image=img;imageHash=hash;zoom=1;offsetX=0;offsetY=0;
    $("imageInfo").textContent=img.naturalWidth+"×"+img.naturalHeight+" · SHA-256 "+hash.slice(0,12)+"…";
    await tryMatch();
  }catch(err){status("Αποτυχία εικόνας: "+String(err.message||err),true);}
});
$("ocrInput").addEventListener("change",async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
    if(file.size>8*1024*1024)throw Error("OCR JSON πάνω από 8 MB");
    ocr=validateOcr(JSON.parse(await file.text()));
    await tryMatch();
  }catch(err){ocr=null;review=null;chosen=null;
    $("exportReview").disabled=true;$("exportGcpCsv").disabled=true;
    status("Άκυρο OCR: "+String(err.message||err),true);stats();render();}
});
$("minConfidence").addEventListener("input",()=>{
  $("confidenceValue").textContent=$("minConfidence").value+"%";render();
});
$("readingFilter").addEventListener("input",render);
for(const [id,dir] of [["previousLabel",-1],["nextLabel",1]]){
  $(id).addEventListener("click",()=>{
    const items=filtered();if(!items.length)return;
    const at=items.findIndex(x=>x.label_id===chosen?.label_id);
    select(items[(at<0?(dir>0?0:items.length-1):(at+dir+items.length)%items.length)]);
  });
}
function decide(decision){
  try{
    if(!review||!chosen)return;
    applyReading(review,chosen.label_id,{
      decision,reading:$("correctedReading").value,reviewer:$("reviewer").value
    });
    stats();select(chosen);
    status("Καταγράφηκε ανθρώπινος έλεγχος ανάγνωσης · όχι ιστορική ταυτότητα");
  }catch(error){status(String(error.message||error),true);}
}
$("acceptReading").addEventListener("click",()=>decide("READING_ACCEPTED"));
$("rejectReading").addEventListener("click",()=>decide("READING_REJECTED"));
$("captureGcp").addEventListener("click",()=>{
  gcpMode=!gcpMode;
  $("captureGcp").setAttribute("aria-pressed",String(gcpMode));
  $("captureGcp").textContent="Σημείο ελέγχου: "+(gcpMode?"κλικ στην εικόνα":"ανενεργό");
});
$("addGcp").addEventListener("click",()=>{
  try{
    if(!review)throw Error("Χρειάζεται ταυτοποιημένη πηγή");
    for(const id of ["gcpX","gcpY","gcpLon","gcpLat"]) {
      if(!$(id).value.trim())throw Error("Συμπληρώστε όλα τα αριθμητικά πεδία του GCP");
    }
    if(Number($("gcpX").value)>image.naturalWidth || Number($("gcpY").value)>image.naturalHeight)
      throw Error("Το GCP βρίσκεται εκτός της πραγματικής εικόνας");
    addGcp(review,{
      pixel_x:Number($("gcpX").value),pixel_y:Number($("gcpY").value),
      longitude:Number($("gcpLon").value),latitude:Number($("gcpLat").value),
      placename:$("gcpPlace").value,reference_url:$("gcpReference").value,
      reviewer:$("reviewer").value
    });
    stats();render();status("Προστέθηκε προτεινόμενο GCP· ΔΕΝ έγινε γεωαναφορά");
  }catch(err){status(String(err.message||err),true);}
});
function saveText(name,data,type){
  const url=URL.createObjectURL(new Blob([data],{type}));
  const link=document.createElement("a");link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}
$("exportReview").addEventListener("click",()=>{
  if(!review)return;
  saveText("nabou-portolan-human-review.json",JSON.stringify(review,null,2)+"\n","application/json");
});
$("exportGcpCsv").addEventListener("click",()=>{
  if(!review||!review.gcps.length){status("Προσθέστε πρώτα ένα σημείο ελέγχου",true);return;}
  saveText("nabou-portolan-proposed-gcps.csv",csvForQgisGcps(review),"text/csv");
});
canvas.addEventListener("pointerdown",e=>{
  start={x:e.clientX,y:e.clientY};dragged=false;canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove",e=>{
  if(!start)return;
  const dx=e.clientX-start.x,dy=e.clientY-start.y;
  if(Math.abs(dx)+Math.abs(dy)>2)dragged=true;
  if(dragged){offsetX+=dx;offsetY+=dy;render();}
  start={x:e.clientX,y:e.clientY};
});
canvas.addEventListener("pointercancel",()=>{start=null;});
canvas.addEventListener("pointerup",e=>{
  if(!start)return;start=null;
  if(dragged||!review||!image)return;
  const bounds=canvas.getBoundingClientRect();
  const [x,y]=unproject(e.clientX-bounds.left,e.clientY-bounds.top);
  if(x<0||y<0||x>image.naturalWidth||y>image.naturalHeight)return;
  if(gcpMode){
    $("gcpX").value=x.toFixed(1);$("gcpY").value=y.toFixed(1);
    status("Ορίστηκαν μόνο pixel. Συμπληρώστε τεκμηριωμένες συντεταγμένες.");return;
  }
  let best=null,dist=Infinity;
  for(const item of filtered()){
    const [lx,ly,w,h]=item.pixel_bbox;
    const dx=Math.max(lx-x,0,x-(lx+w)),dy=Math.max(ly-y,0,y-(ly+h));
    const d=Math.hypot(dx,dy);
    if(d<dist){dist=d;best=item;}
  }
  if(best&&dist<30/Math.max(imageCoords().scale,.01))select(best);
});
canvas.addEventListener("wheel",e=>{
  e.preventDefault();
  zoom=Math.max(.05,Math.min(30,zoom*Math.exp(-e.deltaY*.001)));
  render();
},{passive:false});
window.addEventListener("resize",resize);
resize();stats();
