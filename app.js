const state={mode:"STORY",book:"All",search:"",year:"All",routeStory:"All",storyStep:0,verifiedOnly:false,showPlaces:true,showRoutes:true,routeTypes:new Set(["DEPICTED TRAVEL","STRONG RECONSTRUCTION"])};
const placeMarkers=L.layerGroup(),routeLines=L.layerGroup(),historicalLabels=L.layerGroup(),vesselMarkers=L.layerGroup(),portolanLayer=L.layerGroup();
let routeAnimationCancels=[];
let atlasData={places:[],routes:[]};
const byId=new Map();
let empireRepIds=new Set();

const map=L.map("map",{zoomControl:true,preferCanvas:true,zoomSnap:.5}).setView([39.1,18.5],5);
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}",{
  maxNativeZoom:8,
  maxZoom:16,
  opacity:1,
  attribution:"Physical map tiles &copy; Esri"
}).addTo(map);
placeMarkers.addTo(map);routeLines.addTo(map);historicalLabels.addTo(map);vesselMarkers.addTo(map);

map.zoomControl.setPosition("bottomright");

function addPortolanLine(points,kind="grid"){
  const style=kind==="rhumb"
    ?{color:"#6e5334",weight:.72,opacity:.20,dashArray:"3 8",interactive:false}
    :{color:"#7a6241",weight:.55,opacity:.16,dashArray:"1 6",interactive:false};
  L.polyline(points,{...style,pane:"overlayPane"}).addTo(portolanLayer);
}
function buildPortolanLayer(){
  portolanLayer.clearLayers();
  // Geographic graticule: decorative only, not a historical route claim.
  for(let lat=30;lat<=50;lat+=5){
    const pts=[];
    for(let lon=-10;lon<=40;lon+=1)pts.push([lat,lon]);
    addPortolanLine(pts,"grid");
  }
  for(let lon=-10;lon<=40;lon+=5){
    const pts=[];
    for(let lat=28;lat<=52;lat+=1)pts.push([lat,lon]);
    addPortolanLine(pts,"grid");
  }
  // Portolan-style rhumb fans anchored in open water, purely decorative.
  const fans=[
    {c:[37.2,18.0],ends:[[49,-8],[49,38],[29,-8],[29,38],[43,-8],[43,38],[31,-8],[31,38]]},
    {c:[40.2,8.5],ends:[[49,-8],[49,30],[29,-8],[29,30],[45,-8],[45,30],[33,-8],[33,30]]}
  ];
  fans.forEach(f=>f.ends.forEach(e=>addPortolanLine([f.c,e],"rhumb")));
}
// Portolan line layer intentionally disabled: decorative lines obscured narrative routes.

const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
const textHit=(obj,q)=>!q||Object.values(obj).some(v=>{
  if(Array.isArray(v))return v.join(" ").toLowerCase().includes(q);
  if(v&&typeof v==="object")return JSON.stringify(v).toLowerCase().includes(q);
  return String(v??"").toLowerCase().includes(q);
});
const coordClass=p=>p.coordinateStatus==="VERIFIED"?"documented":p.coordinateStatus==="NEEDS RESEARCH"?"research":"mixed";
const COMMONS=file=>"https://commons.wikimedia.org/wiki/Special:Redirect/file/"+encodeURIComponent(file);
const POWERS={
  spain_pre1580:{id:"spain_pre1580",name:"Ισπανική Μοναρχία — Φίλιππος Β΄",type:"arms of Philip II, 1558–1580",file:"Coat of Arms of Philip II of Spain (1558-1580).svg"},
  spain_1580:{id:"spain_1580",name:"Ισπανική Μοναρχία — Φίλιππος Β΄",type:"royal arms, 1580–1668",file:"Royal Arms of Spain (1580-1668).svg"},
  france:{id:"france",name:"Βασίλειο της Γαλλίας",type:"royal arms",file:"Coat of Arms of the Kingdom of France (from Royal Standard).svg"},
  venice:{id:"venice",name:"Γαληνοτάτη Δημοκρατία της Βενετίας",type:"arms of the Republic of Venice",file:"Coat of arms of Republic of Venice.svg"},
  ottoman:{id:"ottoman",name:"Οθωμανική Αυτοκρατορία — Μουράτ Γ΄",type:"tughra of Murad III",file:"Tughra of Murad III.svg"},
  hospitaller:{id:"hospitaller",name:"Τάγμα του Αγίου Ιωάννη / Ιωαννίτες",type:"arms of the Knights Hospitaller",file:"Coat of arms of the Knights Hospitaller.svg"},
  ragusa:{id:"ragusa",name:"Δημοκρατία της Ραγούσας",type:"arms of the Republic of Ragusa",file:"Coat of Arms of the Republic of Ragusa.svg"}
};
Object.values(POWERS).forEach(p=>p.image=COMMONS(p.file));

const POWER_LABELS={
  spain_pre1580:"ΙΣΠΑΝΙΚΗ ΜΟΝΑΡΧΙΑ",
  spain_1580:"ΙΣΠΑΝΙΚΗ ΜΟΝΑΡΧΙΑ",
  france:"ΒΑΣΙΛΕΙΟ ΤΗΣ ΓΑΛΛΙΑΣ",
  venice:"ΓΑΛΗΝΟΤΑΤΗ ΒΕΝΕΤΙΑ",
  ottoman:"ΟΘΩΜΑΝΙΚΗ ΑΥΤΟΚΡΑΤΟΡΙΑ",
  hospitaller:"ΙΩΑΝΝΙΤΕΣ",
  ragusa:"ΔΗΜΟΚΡΑΤΙΑ ΤΗΣ ΡΑΓΟΥΣΑΣ"
};
const selectedYear=()=>state.year==="All"?null:Number(state.year);
const spanishPower=()=>selectedYear()&&selectedYear()>=1580?POWERS.spain_1580:POWERS.spain_pre1580;
const powerForPlace=p=>{
  const a=(p.authority||"").toLowerCase();
  if(a.includes("venice")||a.includes("venetian"))return POWERS.venice;
  if(a.includes("ottoman"))return POWERS.ottoman;
  if(a.includes("hospitaller")||a.includes("order of st john")||a.includes("sovereign order"))return POWERS.hospitaller;
  if(a.includes("ragusa"))return POWERS.ragusa;
  if(a.includes("philip ii")||a.includes("spanish habsburg")||a.includes("kingdom of naples"))return spanishPower();
  if(a.includes("france")||a.includes("french"))return POWERS.france;
  return null;
};
const routeDashed=t=>t!=="DEPICTED TRAVEL";
const routeStory=r=>{
  if(r.story)return r.story;
  const n=r.name||"";
  if(n.startsWith("Acuña 1577")) return "Acuña mission 1577";
  if(n.startsWith("Cyprus intelligence")) return "Cyprus intelligence 1578";
  if(n.startsWith("Otranto surveillance")) return "Otranto surveillance 1578";
  if(n.startsWith("Cyprus proposal")) return "Cyprus proposal 1578";
  if(n.startsWith("Lantzas/Ferlaino 1577")) return "Lantzas–Ferlaino 1577";
  if(n.startsWith("Artemis 1577")) return "Artemis search 1577";
  if(n.startsWith("Ferlaino 1577")) return "Ferlaino / Hospitallers 1577";
  return r.character||r.name||"Other";
};
const yearsFrom=s=>{
  const text=String(s||"");
  const out=new Set(text.match(/15\d{2}/g)||[]);
  for(const m of text.matchAll(/(15\d{2})\s*[–-]\s*(15\d{2})/g)){
    const a=Number(m[1]),b=Number(m[2]);
    if(b>=a&&b-a<=40)for(let y=a;y<=b;y++)out.add(String(y));
  }
  return Array.from(out);
};
const yearHit=(obj,year)=>year==="All"||yearsFrom(obj.period).includes(year);
const bookHit=(obj)=>state.book==="All"||(obj.books||[]).includes(state.book);
function primaryStoryRoutes(){
  return atlasData.routes.filter(r=>Boolean(r.story));
}
function defaultStoryForBook(book){
  if(book==="All")return "All";
  const stories=Array.from(new Set(
    primaryStoryRoutes().filter(r=>(r.books||[]).includes(book)).map(r=>r.story)
  ));
  return stories.length===1?stories[0]:"All";
}
function routeVisibleInCurrentMode(r){
  if(r.atlasHidden||!hasCuratedSeaGeometry(r)||!bookHit(r)||!yearHit(r,state.year))return false;
  if(state.mode==="EMPIRES"||state.mode==="EVIDENCE")return false;
  if(state.mode==="STORY"){
    if(state.book==="All")return false;
    if(!r.story)return false;
    if(state.routeStory==="All")return false;
    if(r.story!==state.routeStory)return false;
    return state.routeTypes.has(r.type);
  }
  if(state.mode==="INTELLIGENCE")return r.type==="INTELLIGENCE / NETWORK"&&state.routeTypes.has(r.type);
  if(state.mode==="VOYAGES"){
    if(state.book==="All")return false;
    if(!["DEPICTED TRAVEL","STRONG RECONSTRUCTION"].includes(r.type))return false;
    if(state.routeStory==="All"){
      if(!r.story)return false;
    }else if(routeStory(r)!==state.routeStory)return false;
    return state.routeTypes.has(r.type);
  }
  if(state.mode==="PEOPLE"){
    if(!["DEPICTED TRAVEL","STRONG RECONSTRUCTION"].includes(r.type))return false;
    if(state.routeStory!=="All"&&routeStory(r)!==state.routeStory)return false;
    return state.routeTypes.has(r.type);
  }
  if(state.routeStory!=="All"&&routeStory(r)!==state.routeStory)return false;
  return state.routeTypes.has(r.type);
}
function currentRouteNodeIds(){
  const ids=new Set();
  atlasData.routes.filter(routeVisibleInCurrentMode).forEach(r=>{
    (r.from||[]).forEach(x=>ids.add(x.id));
    (r.to||[]).forEach(x=>ids.add(x.id));
  });
  return ids;
}

function settlementClass(p){
  if(p.atlasSymbol)return p.atlasSymbol;
  const t=(p.type||"").toLowerCase();
  if(t.includes("fortress"))return "town";
  if(t.includes("port")||t.includes("harbor"))return "port";
  if(t.includes("village"))return "village";
  if(t.includes("city"))return "city";
  if(t.includes("island"))return "island-label";
  if(t.includes("sea")||t.includes("strait"))return "sea-label";
  if(t.includes("region"))return "region-label";
  return "generic";
}
function labelOnlyPlace(p){
  const s=settlementClass(p);
  return s==="island-label"||s==="region-label"||s==="sea-label";
}
function settlementIcon(p){
  const symbol=settlementClass(p);

  if(labelOnlyPlace(p)){
    const kind=symbol.replace("-label","");
    return L.divIcon({
      className:"cartographic-anchor",
      html:`<div class="cartographic-label-only ${kind}" title="${esc(atlasLabelFor(p))}">${esc(atlasLabelFor(p))}</div>`,
      iconSize:[1,1],
      iconAnchor:[0,0]
    });
  }

  const assetFor={
    "village":"mercator-village-1.png",
    "coastal-village":"mercator-village-2.png",
    "town":"mercator-town-1.png",
    "city":"mercator-city-1.png",
    "fortified-city":"mercator-city-1.png",
    "capital":"mercator-capital-1.png",
    "port":"mercator-town-2.png",
    "fortress":"mercator-town-1.png",
    "generic":"mercator-town-1.png"
  };
  const widthBySymbol={
    "village":32,
    "coastal-village":36,
    "town":44,
    "city":58,
    "fortified-city":66,
    "capital":78,
    "port":48,
    "fortress":56,
    "generic":40
  };
  const file=p.atlasAsset||assetFor[symbol]||assetFor.generic;
  const w=widthBySymbol[symbol]||52;

  return L.divIcon({
    className:"cartographic-anchor",
    html:`<img class="mercator-settlement-art ${symbol}" src="./icons/${file}" alt="" style="width:${w}px" title="${esc(p.place)}">`,
    iconSize:[1,1],
    iconAnchor:[0,0]
  });
}
function markerIcon(p){
  if(state.mode==="EMPIRES"){
    const power=powerForPlace(p);
    if(power){
      const showShield=map.getZoom()>=7||empireRepIds.has(p.id);
      if(showShield){
        const safe=power.image.replace(/"/g,"%22");
        const ottoman=power.id==="ottoman"?" ottoman-shield":"";
        return L.divIcon({
          className:"",
          html:`<div class="heraldic-shield${ottoman}" title="${esc(power.name)}"><span class="heraldic-art" style="background-image:url('${safe}')"></span></div>`,
          iconSize:[30,36],iconAnchor:[15,18]
        });
      }
      return L.divIcon({
        className:"",
        html:`<div class="sovereignty-node"></div>`,
        iconSize:[8,8],iconAnchor:[4,4]
      });
    }
  }
  return settlementIcon(p);
}
function openDetail(html){
  const d=document.getElementById("detailPanel");
  d.innerHTML=`<button id="closeDetail" class="detail-close" type="button" aria-label="Κλείσιμο λεπτομερειών">×</button>${html}`;
  d.classList.add("open");
  document.getElementById("scrim").classList.add("on");
  document.getElementById("closeDetail").onclick=closeDetail;
}
function closeDetail(){
  document.getElementById("detailPanel").classList.remove("open");
  document.getElementById("scrim").classList.remove("on");
}
function showPlace(p){
  const power=powerForPlace(p);
  openDetail(`
    <div class="mini-kicker">PLACE DOSSIER</div>
    <h1>${esc(p.place||"Unavailable")}</h1>
    <div class="sub">${esc(p.historicalNames||p.modernName||"")}</div>
    ${power?`<div class="power-badge">${power.image?`<img src="${power.image}" alt="">`:""}<div><div class="power-name">${esc(power.name)}</div><div class="sub">${esc(power.type)}</div></div></div>`:""}
    <div class="badges">
      <span class="badge">${esc(p.type||"TYPE UNAVAILABLE")}</span>
      ${(p.books||[]).map(b=>`<span class="badge">${esc(b)}</span>`).join("")}
    </div>
    <div class="dossier-status">
      <div class="dossier-status-item"><div class="dk">Coordinates</div><div class="dv">${esc(p.coordinateStatus||"Unavailable")}</div></div>
      <div class="dossier-status-item"><div class="dk">Historical status</div><div class="dv">${esc(p.historicalStatus||"Unavailable")}</div></div>
    </div>
    ${field("Period",p.period)}
    ${field("Characters",p.characters)}
    ${field("Trilogy role",p.trilogyRole)}
    ${field("Historical context",p.historicalContext)}
    ${field("Political control / authority",p.authority)}
    ${field("Sources / evidence",p.sources)}
    ${field("Atlas notes",p.notes)}
    ${field("Coordinates",Number.isFinite(p.lat)&&Number.isFinite(p.lon)?p.lat+", "+p.lon:"Unavailable")}
  `);
}
function showRoute(r){
  openDetail(`
    <div class="mini-kicker">ROUTE DOSSIER</div>
    <h1>${esc(r.name||"Route")}</h1>
    <div class="sub">${esc(r.character||"")}</div>
    <div class="badges"><span class="badge">${esc(r.type||"TYPE UNAVAILABLE")}</span>${(r.books||[]).map(b=>`<span class="badge">${esc(b)}</span>`).join("")}</div>
    <div class="dossier-status">
      <div class="dossier-status-item"><div class="dk">Evidence</div><div class="dv">${esc(r.status||r.type||"Unavailable")}</div></div>
      <div class="dossier-status-item"><div class="dk">Medium</div><div class="dv">${esc(r.medium||"Unavailable")}</div></div>
    </div>
    ${field("Period",r.period)}
    ${field("From",(r.from||[]).map(x=>x.name).join(", ")||"Unavailable")}
    ${field("To",(r.to||[]).map(x=>x.name).join(", ")||"Unavailable")}
    ${field("Evidence / scene",r.evidence)}
    ${field("Atlas display note",r.note)}
    ${field("Geometry note","Schematic straight segment between Airtable nodes; not an exact historical track.")}
  `);
}
function field(k,v){return `<div class="field"><div class="k">${esc(k)}</div><div class="v">${esc(v||"Unavailable")}</div></div>`}

function rebuildFilters(){
  const books=["All",...Array.from(new Set(atlasData.places.flatMap(p=>p.books||[]))).sort()];
  document.getElementById("bookStrip").innerHTML=books.map(b=>`<button class="book-chip ${state.book===b?"active":""}" data-book="${esc(b)}">${b==="All"?"Όλα":esc(b)}</button>`).join("");
  document.querySelectorAll("[data-book]").forEach(b=>b.onclick=()=>{
    state.book=b.dataset.book;
    state.routeStory=defaultStoryForBook(state.book);
    state.storyStep=0;
    rebuildFilters();
    render();
    setTimeout(fitVisible,0);
  });

  const years=Array.from(new Set([...atlasData.places,...atlasData.routes].flatMap(x=>yearsFrom(x.period)))).sort();
  const yearSelect=document.getElementById("yearFilter");
  yearSelect.innerHTML='<option value="All">Όλες οι περίοδοι</option>'+years.map(y=>`<option value="${y}" ${state.year===y?"selected":""}>${y}</option>`).join("");

  const storyPool=state.mode==="STORY"
    ? atlasData.routes.filter(r=>bookHit(r)&&Boolean(r.story)).map(r=>r.story)
    : atlasData.routes.filter(r=>bookHit(r)).map(routeStory).filter(Boolean);
  const stories=["All",...Array.from(new Set(storyPool)).sort()];
  const storySelect=document.getElementById("routeStoryFilter");
  storySelect.innerHTML=stories.map(s=>`<option value="${esc(s)}" ${state.routeStory===s?"selected":""}>${s==="All"?"Όλες οι διαδρομές":esc(s)}</option>`).join("");

  const types=Array.from(new Set(atlasData.routes.map(r=>r.type).filter(Boolean))).sort();
  document.getElementById("routeFilters").innerHTML=types.map(t=>`<label><input type="checkbox" data-route="${esc(t)}" ${state.routeTypes.has(t)?"checked":""}> <span>${esc(t)}</span></label>`).join("");
  document.querySelectorAll("[data-route]").forEach(c=>c.onchange=()=>{c.checked?state.routeTypes.add(c.dataset.route):state.routeTypes.delete(c.dataset.route);render();});

  const legendPowers=[POWERS.spain_pre1580,POWERS.france,POWERS.venice,POWERS.ottoman,POWERS.hospitaller,POWERS.ragusa];
  document.getElementById("powerLegend").innerHTML=legendPowers.map(p=>`
    <div class="power-card"><div class="legend-shield${p.id==="ottoman"?" ottoman-shield":""}"><span class="heraldic-art" style="background-image:url('${p.image.replace(/"/g,"%22")}')"></span></div><div><div class="pn">${esc(POWER_LABELS[p.id]||p.name)}</div><div class="pt">${esc(p.type)}</div></div></div>
  `).join("");
}

function routeStyle(type,medium,focused=true){
  const fade=focused?1:.22;
  if(type==="INTELLIGENCE / NETWORK")return {weight:1.05,opacity:.34*fade,color:"#756951",lineCap:"round",lineJoin:"round",dashArray:"1 9"};
  if(type==="PLANNED — NOT EXECUTED")return {weight:1.0,opacity:.28*fade,color:"#8b7659",lineCap:"round",lineJoin:"round",dashArray:"11 10"};
  if(type==="STRONG RECONSTRUCTION")return {weight:focused?2.0:1.1,opacity:.62*fade,color:"#745c3d",lineCap:"round",lineJoin:"round",dashArray:"5 7"};
  if(medium==="land")return {weight:focused?2.1:1.15,opacity:.72*fade,color:"#72583a",lineCap:"round",lineJoin:"round",dashArray:"5 4"};
  return {weight:focused?2.35:1.2,opacity:.88*fade,color:"#4f3924",lineCap:"round",lineJoin:"round"};
}
function routeUnderlayStyle(type,medium,focused=true){
  if(type!=="DEPICTED TRAVEL"||!focused)return null;
  return {weight:5.4,opacity:.42,color:"#efe2c4",lineCap:"round",lineJoin:"round"};
}

const MAJOR_PLACES=new Set(["Madrid","Lisbon","Naples","Constantinople","Corfu","Malta","Ragusa","Candia","Tunis","Otranto"]);
const CAPITAL_PLACES=new Set(["Madrid","Constantinople","Naples","Venice"]);
const FORCE_LABELS=new Set(["Candia","Malta","Lefkada","Ragusa"]);
function labelPriority(p){
  if(FORCE_LABELS.has(p.place))return 4;
  if(CAPITAL_PLACES.has(p.place))return 3;
  if(MAJOR_PLACES.has(p.place))return 2;
  if(["City","Port","Fortress"].includes(p.type))return 1;
  return 0;
}
function shouldShowLabel(p,routeNodeIds){
  const z=map.getZoom();
  const pri=labelPriority(p);
  const focused=routeNodeIds.has(p.id);
  if(pri>=4)return true;
  if(focused)return true;
  if(z>=9)return true;
  if(z===8)return pri>=1;
  if(z===7)return pri>=2;
  if(z===6)return pri>=3;
  return pri>=3;
}
const atlasLabelFor=p=>p.atlasLabel||p.place;
function historicalLabelIcon(p){
  const t=(p.type||"").toLowerCase();
  const port=t.includes("port")||t.includes("harbor")?" port":"";
  const fortress=t.includes("fortress")?" fortress":"";
  const capital=CAPITAL_PLACES.has(p.place)?" capital":"";
  const major=MAJOR_PLACES.has(p.place)?" major":"";
  return L.divIcon({
    className:"",
    html:`<div class="historical-place-label${port}${fortress}${capital}${major}">${esc(atlasLabelFor(p))}</div>`,
    iconSize:[118,18],iconAnchor:[-6,8]
  });
}

function curvedRoutePoints(a,b,steps=28){
  const dx=b.lon-a.lon,dy=b.lat-a.lat;
  const dist=Math.sqrt(dx*dx+dy*dy);
  const bend=Math.min(2.3,dist*.10);
  const mx=(a.lon+b.lon)/2, my=(a.lat+b.lat)/2;
  const nx=dist?(-dy/dist):0, ny=dist?(dx/dist):0;
  const cx=mx+nx*bend, cy=my+ny*bend;
  const pts=[];
  for(let i=0;i<=steps;i++){
    const t=i/steps,mt=1-t;
    const lon=mt*mt*a.lon+2*mt*t*cx+t*t*b.lon;
    const lat=mt*mt*a.lat+2*mt*t*cy+t*t*b.lat;
    pts.push([lat,lon]);
  }
  return pts;
}


function hasCuratedSeaGeometry(r){
  return r.medium!=="sea" || (
    r.routeGeometry==="CURATED MARITIME CORRIDOR" &&
    Array.isArray(r.waypoints) &&
    r.waypoints.length>0
  );
}

function routeLegPoints(r,pa,pb){
  if(!hasCuratedSeaGeometry(r))return [];
  const start=Array.isArray(r.displayStart)&&Number.isFinite(r.displayStart[0])&&Number.isFinite(r.displayStart[1])
    ?r.displayStart:[pa.lat,pa.lon];
  const end=Array.isArray(r.displayEnd)&&Number.isFinite(r.displayEnd[0])&&Number.isFinite(r.displayEnd[1])
    ?r.displayEnd:[pb.lat,pb.lon];
  const pts=[start];
  if(Array.isArray(r.waypoints)){
    r.waypoints.forEach(w=>{
      if(Array.isArray(w)&&Number.isFinite(w[0])&&Number.isFinite(w[1]))pts.push([w[0],w[1]]);
    });
  }
  pts.push(end);
  return pts;
}
function haversineKm(a,b){
  const R=6371;
  const rad=x=>x*Math.PI/180;
  const lat1=rad(a[0]),lat2=rad(b[0]);
  const dLat=lat2-lat1,dLon=rad(b[1]-a[1]);
  const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
}
function routeDistanceTable(points){
  const cumulative=[0];
  let total=0;
  for(let i=0;i<points.length-1;i++){
    total+=haversineKm(points[i],points[i+1]);
    cumulative.push(total);
  }
  return {cumulative,total};
}
function pointAtDistance(points,table,distanceKm){
  const {cumulative,total}=table;
  if(distanceKm<=0)return points[0];
  if(distanceKm>=total)return points[points.length-1];
  let i=0;
  while(i<cumulative.length-1 && cumulative[i+1]<distanceKm)i++;
  const a=points[i],b=points[i+1];
  const seg=cumulative[i+1]-cumulative[i];
  const t=seg>0?(distanceKm-cumulative[i])/seg:0;
  return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
}
function routeShipIcon(variant=1){
  const cls=variant===2?"route-ship route-ship-2":"route-ship route-ship-1";
  return L.divIcon({
    className:"moving-vessel-anchor",
    html:`<div class="${cls}" aria-label="historical sailing ship"></div>`,
    iconSize:[58,52],
    iconAnchor:[29,26]
  });
}
function routeFacing(points){
  if(!points||points.length<2)return "left";
  const dx=points[points.length-1][1]-points[0][1];
  return dx>=0?"right":"left";
}
function animateVessel(points,variant=1){
  if(!points||points.length<2)return;
  const distanceTable=routeDistanceTable(points);
  if(distanceTable.total<=0)return;

  // Deliberately slow atlas animation: readable rather than game-like.
  const VISUAL_KM_PER_SECOND=10;
  const rawDuration=(distanceTable.total/VISUAL_KM_PER_SECOND)*1000;
  const duration=Math.max(24000,Math.min(120000,rawDuration));

  const marker=L.marker(points[0],{icon:routeShipIcon(variant),interactive:false,zIndexOffset:900}).addTo(vesselMarkers);
  const facing=routeFacing(points);
  const start=performance.now();
  let rafId=0;
  let stopped=false;

  function tick(now){
    if(stopped||!map.hasLayer(vesselMarkers))return;
    const phase=((now-start)%duration)/duration;
    const travelled=phase*distanceTable.total;
    marker.setLatLng(pointAtDistance(points,distanceTable,travelled));

    const el=marker.getElement();
    if(el){
      const g=el.querySelector(".route-ship");
      if(g){
        g.classList.toggle("faces-right",facing==="right");
        g.classList.toggle("faces-left",facing!=="right");
      }
    }
    rafId=requestAnimationFrame(tick);
  }

  rafId=requestAnimationFrame(tick);
  routeAnimationCancels.push(()=>{stopped=true;cancelAnimationFrame(rafId);});
}

function visibleStoryRoutes(story=state.routeStory){
  if(story==="All")return [];
  return atlasData.routes.filter(r=>
    !r.atlasHidden&&routeStory(r)===story&&bookHit(r)&&yearHit(r,state.year)
  ).sort((a,b)=>(a.sequence||0)-(b.sequence||0));
}
function updateStoryDeck(){
  const deck=document.getElementById("storyDeck");
  if(!deck)return;
  const routes=visibleStoryRoutes();
  if(state.routeStory==="All"||!routes.length){
    deck.classList.remove("active");
    document.getElementById("storyDeckTitle").textContent="Επίλεξε μία διαδρομή";
    document.getElementById("storyDeckMeta").textContent="Η αφήγηση θα εμφανιστεί εδώ.";
    return;
  }
  state.storyStep=Math.max(0,Math.min(state.storyStep,routes.length-1));
  const r=routes[state.storyStep];
  deck.classList.add("active");
  document.getElementById("storyDeckKicker").textContent=`STORY MODE · ${state.storyStep+1}/${routes.length}`;
  document.getElementById("storyDeckTitle").textContent=r.name||state.routeStory;
  const from=r.from?.[0]?.name||"—",to=r.to?.[0]?.name||"—";
  document.getElementById("storyDeckMeta").textContent=`${from} → ${to} · ${r.period||""}`;
  document.getElementById("storyPrev").disabled=state.storyStep<=0;
  document.getElementById("storyNext").disabled=state.storyStep>=routes.length-1;
}
function focusStoryStep(delta=0){
  const routes=visibleStoryRoutes();
  if(!routes.length)return;
  state.storyStep=Math.max(0,Math.min(state.storyStep+delta,routes.length-1));
  const r=routes[state.storyStep],a=r.from?.[0],b=r.to?.[0];
  const pts=[];
  if(a&&byId.get(a.id)){const p=byId.get(a.id);pts.push([p.lat,p.lon]);}
  if(b&&byId.get(b.id)){const p=byId.get(b.id);pts.push([p.lat,p.lon]);}
  updateStoryDeck();
  render();
  if(pts.length)map.fitBounds(pts,{padding:[120,120],maxZoom:7});
}

function render(){
  routeAnimationCancels.forEach(fn=>fn());routeAnimationCancels=[];
  placeMarkers.clearLayers();routeLines.clearLayers();historicalLabels.clearLayers();vesselMarkers.clearLayers();
  const q=state.search.trim().toLowerCase();

  const intelligencePlaceIds=new Set();
  atlasData.routes.filter(r=>r.type==="INTELLIGENCE / NETWORK"&&bookHit(r)&&yearHit(r,state.year)).forEach(r=>{
    (r.from||[]).forEach(x=>intelligencePlaceIds.add(x.id));
    (r.to||[]).forEach(x=>intelligencePlaceIds.add(x.id));
  });

  const activeRouteNodeIds=currentRouteNodeIds();

  const visiblePlaces=atlasData.places.filter(p=>{
    const heroOverview=state.mode==="STORY"&&state.book==="All";
    const storyBookView=state.mode==="STORY"&&state.book!=="All";
    const storyPlaceAllowed=!heroOverview||labelPriority(p)>=2;
    const bookPlaceAllowed=!storyBookView||activeRouteNodeIds.has(p.id)||labelPriority(p)>=2;
    const base=Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&(bookHit(p)||activeRouteNodeIds.has(p.id))&&yearHit(p,state.year)&&
      (!state.verifiedOnly||p.coordinateStatus==="VERIFIED")&&textHit(p,q)&&storyPlaceAllowed&&bookPlaceAllowed;
    if(!base)return false;
    if(state.mode==="PEOPLE")return Boolean((p.characters||"").trim());
    if(state.mode==="VOYAGES"){
      if(state.book==="All")return labelPriority(p)>=2;
      return activeRouteNodeIds.has(p.id)||labelPriority(p)>=2;
    }
    if(state.mode==="EMPIRES")return Boolean(powerForPlace(p));
    if(state.mode==="INTELLIGENCE")return intelligencePlaceIds.has(p.id)||(p.trilogyRole||"").toLowerCase().includes("intelligence");
    return true;
  });

  empireRepIds=new Set();
  if(state.mode==="EMPIRES"){
    const preferred={
      venice:["Corfu","Candia"],
      ottoman:["Constantinople","Preveza waters"],
      hospitaller:["Malta"],
      ragusa:["Ragusa"],
      spain_pre1580:["Madrid","Naples","Otranto"],
      spain_1580:["Madrid","Naples","Otranto"],
      france:["Paris"]
    };
    const groups=new Map();
    visiblePlaces.forEach(p=>{
      const pw=powerForPlace(p); if(!pw)return;
      if(!groups.has(pw.id))groups.set(pw.id,[]);
      groups.get(pw.id).push(p);
    });
    groups.forEach((items,powerId)=>{
      const pref=preferred[powerId]||[];
      let rep=null;
      for(const name of pref){rep=items.find(p=>p.place===name);if(rep)break;}
      if(!rep)rep=items[0];
      if(rep)empireRepIds.add(rep.id);
    });
  }

  if(state.showPlaces)visiblePlaces.forEach(p=>{
    const m=L.marker([p.lat,p.lon],{icon:markerIcon(p),title:p.place,riseOnHover:true});
    const power=powerForPlace(p);
    const tip=state.mode==="EMPIRES"&&power?power.name+" · "+p.place:p.place;
    m.bindTooltip(tip,{direction:"top",offset:[0,-8]});
    m.bindPopup(`<strong>${esc(p.place)}</strong><br><small>${esc(p.period||"")}</small>`);
    m.on("click",()=>showPlace(p));
    m.addTo(placeMarkers);
    if(state.mode!=="EMPIRES" && !labelOnlyPlace(p) && shouldShowLabel(p,activeRouteNodeIds)){
      L.marker([p.lat,p.lon],{icon:historicalLabelIcon(p),interactive:false}).addTo(historicalLabels);
    }
  });

  let routeCount=0;
  if(state.showRoutes){
    const filtered=atlasData.routes.filter(r=>
      routeVisibleInCurrentMode(r)&&textHit(r,q)
    );

    const grouped=new Map();
    filtered.forEach(r=>{
      const a=(r.from||[])[0],b=(r.to||[])[0];
      if(!a||!b||a.id===b.id)return;
      const pa=byId.get(a.id),pb=byId.get(b.id);
      if(!pa||!pb||!Number.isFinite(pa.lat)||!Number.isFinite(pb.lat))return;
      if(state.verifiedOnly&&(pa.coordinateStatus!=="VERIFIED"||pb.coordinateStatus!=="VERIFIED"))return;
      const key=routeStory(r)+"||"+r.type+"||"+(r.medium||"unknown");
      if(!grouped.has(key))grouped.set(key,[]);
      grouped.get(key).push({r,pa,pb});
    });

    grouped.forEach(items=>{
      items.sort((x,y)=>(x.r.sequence||0)-(y.r.sequence||0));
      const story=routeStory(items[0].r);
      const points=[];
      items.forEach((it,i)=>{
        const leg=routeLegPoints(it.r,it.pa,it.pb);
        if(i>0&&points.length&&leg.length){
          const last=points[points.length-1],first=leg[0];
          if(last[0]===first[0]&&last[1]===first[1])leg.shift();
        }
        points.push(...leg);
      });
      if(points.length<2)return;
      const representative=items[0].r;
      const medium=representative.medium||"unknown";
      const focused=state.routeStory==="All"?true:state.routeStory===story;
      const under=routeUnderlayStyle(representative.type,medium,focused);
      if(under)L.polyline(points,under).addTo(routeLines);
      const line=L.polyline(points,routeStyle(representative.type,medium,focused));
      const label=items.length>1?story:representative.name;
      line.bindTooltip(label,{sticky:true});
      line.on("click",()=>{
        state.routeStory=story;
        state.storyStep=Math.max(0,(representative.sequence||1)-1);
        rebuildFilters();
        updateStoryDeck();
        render();
        if(items.length===1)showRoute(representative);
        else openDetail(`
          <div class="mini-kicker">ROUTE STORY</div>
          <h1>${esc(story)}</h1>
          <div class="sub">${esc(representative.character||"")}</div>
          <div class="badges"><span class="badge">${esc(representative.type)}</span><span class="badge">${items.length} legs</span></div>
          ${field("Period",representative.period)}
          ${field("Sequence",items.map(x=>x.r.name).join("\n→ "))}
          ${field("Evidence",items.map(x=>x.r.evidence).filter(Boolean).join("\n\n"))}
          ${field("Atlas note","The displayed polyline joins the stored Airtable nodes in sequence. It is a narrative/analytical route, not an asserted exact historical track.")}
        `);
      });
      line.addTo(routeLines);
      routeCount++;
    });

    // Animate one physical Lantzas vessel per route story, across all visible sea legs,
    // regardless of evidence styling. This prevents duplicate ships and keeps one
    // constant-speed movement over the actual curated maritime geometry.
    const voyageGroups=new Map();
    const animateActiveStory=state.mode==="STORY"&&state.book!=="All"&&state.routeStory!=="All";
    filtered.forEach(r=>{
      if(!animateActiveStory)return;
      if(routeStory(r)!==state.routeStory)return;
      if(r.medium!=="sea" || !r.vessel || !/petros lantzas/i.test(r.character||""))return;
      if(r.type==="INTELLIGENCE / NETWORK" || r.type==="PLANNED — NOT EXECUTED")return;
      const a=(r.from||[])[0],b=(r.to||[])[0];
      if(!a||!b)return;
      const pa=byId.get(a.id),pb=byId.get(b.id);
      if(!pa||!pb||!hasCuratedSeaGeometry(r))return;
      const key=routeStory(r);
      if(!voyageGroups.has(key))voyageGroups.set(key,[]);
      voyageGroups.get(key).push({r,pa,pb});
    });
    voyageGroups.forEach(items=>{
      items.sort((x,y)=>(x.r.sequence||0)-(y.r.sequence||0));
      const voyagePoints=[];
      items.forEach((it,i)=>{
        const leg=routeLegPoints(it.r,it.pa,it.pb);
        if(!leg.length)return;
        if(i>0&&voyagePoints.length){
          const last=voyagePoints[voyagePoints.length-1],first=leg[0];
          if(Math.abs(last[0]-first[0])<1e-6&&Math.abs(last[1]-first[1])<1e-6)leg.shift();
        }
        voyagePoints.push(...leg);
      });
      if(voyagePoints.length<2)return;
      const variant=items[0].r.shipVariant===1?1:2;
      animateVessel(voyagePoints,variant);
    });
  }
  updateStoryDeck();
  const modeLabels={STORY:"Story",PEOPLE:"People",VOYAGES:"Voyages",EMPIRES:"Empires",INTELLIGENCE:"Intelligence",EVIDENCE:"Evidence",TIMELINE:"Timeline"};
  document.getElementById("countBadge").textContent=`${modeLabels[state.mode]} · ${state.showPlaces?visiblePlaces.length:0} τόποι · ${routeCount} route stories`;
}
function fitVisible(){
  const q=state.search.trim().toLowerCase();
  const activeRouteNodeIds=currentRouteNodeIds();
  const latlngs=atlasData.places.filter(p=>{
    const heroOverview=state.mode==="STORY"&&state.book==="All";
    const storyBookView=state.mode==="STORY"&&state.book!=="All";
    return Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&(bookHit(p)||activeRouteNodeIds.has(p.id))&&yearHit(p,state.year)&&
      (!state.verifiedOnly||p.coordinateStatus==="VERIFIED")&&textHit(p,q)&&
      (!heroOverview||labelPriority(p)>=2)&&
      (!storyBookView||activeRouteNodeIds.has(p.id)||labelPriority(p)>=2);
  }).map(p=>[p.lat,p.lon]);
  if(latlngs.length)map.fitBounds(latlngs,{padding:[90,90],maxZoom:7});
}
function fitAll(){
  const latlngs=atlasData.places.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)).map(p=>[p.lat,p.lon]);
  if(latlngs.length)map.fitBounds(latlngs,{padding:[80,80],maxZoom:6});
}
function openFilters(){
  document.getElementById("controlPanel").classList.add("open");
  document.getElementById("scrim").classList.add("on");
}
function closeFilters(){
  document.getElementById("controlPanel").classList.remove("open");
  if(!document.getElementById("detailPanel").classList.contains("open"))document.getElementById("scrim").classList.remove("on");
}

fetch("./data.json?v=20261006-voyages-clean-1",{cache:"no-store"}).then(r=>r.json()).then(data=>{
  atlasData=data;atlasData.places.forEach(p=>byId.set(p.id,p));
  rebuildFilters();render();fitAll();
}).catch(err=>{
  document.getElementById("countBadge").textContent="Could not load atlas data";
  console.error(err);
});

document.getElementById("searchInput").addEventListener("input",e=>{state.search=e.target.value;render();});
document.getElementById("yearFilter").addEventListener("change",e=>{state.year=e.target.value;rebuildFilters();render();});
document.querySelectorAll("[data-mode]").forEach(btn=>btn.addEventListener("click",()=>{
  state.mode=btn.dataset.mode;
  document.querySelectorAll("[data-mode]").forEach(x=>x.classList.toggle("active",x===btn));
  if(state.mode==="INTELLIGENCE")state.routeTypes=new Set(["INTELLIGENCE / NETWORK"]);
  if(state.mode==="PEOPLE")state.routeTypes=new Set(["DEPICTED TRAVEL","STRONG RECONSTRUCTION"]);
  if(state.mode==="VOYAGES"){
    state.routeTypes=new Set(["DEPICTED TRAVEL","STRONG RECONSTRUCTION"]);
    state.routeStory=defaultStoryForBook(state.book);
    state.storyStep=0;
  }
  if(state.mode==="STORY"){
    state.routeTypes=new Set(["DEPICTED TRAVEL","STRONG RECONSTRUCTION"]);
    state.routeStory=defaultStoryForBook(state.book);
    state.storyStep=0;
  }
  rebuildFilters();render();
}));
document.getElementById("routeStoryFilter").addEventListener("change",e=>{state.routeStory=e.target.value;state.storyStep=0;updateStoryDeck();render();if(state.routeStory!=="All")focusStoryStep(0);});
document.getElementById("verifiedOnly").addEventListener("change",e=>{state.verifiedOnly=e.target.checked;render();});
document.getElementById("placesToggle").addEventListener("change",e=>{state.showPlaces=e.target.checked;e.target.checked?placeMarkers.addTo(map):map.removeLayer(placeMarkers);render();});
document.getElementById("routesToggle").addEventListener("change",e=>{
  state.showRoutes=e.target.checked;
  if(e.target.checked){routeLines.addTo(map);vesselMarkers.addTo(map);}
  else{map.removeLayer(routeLines);map.removeLayer(vesselMarkers);}
  render();
});
document.getElementById("storyPrev").addEventListener("click",()=>focusStoryStep(-1));
document.getElementById("storyNext").addEventListener("click",()=>focusStoryStep(1));
document.getElementById("fitBtn").addEventListener("click",fitAll);
document.getElementById("filtersBtn").addEventListener("click",openFilters);
document.getElementById("closeFilters").addEventListener("click",closeFilters);
document.getElementById("closeDetail").addEventListener("click",closeDetail);
document.getElementById("scrim").addEventListener("click",()=>{closeFilters();closeDetail();});
document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeFilters();closeDetail();}});
map.on("zoomend",render);
