const state={mode:"STORY",book:"All",search:"",year:"All",routeStory:"All",verifiedOnly:false,showPlaces:true,showRoutes:true,routeTypes:new Set(["DEPICTED TRAVEL","STRONG RECONSTRUCTION"])};
const placeMarkers=L.layerGroup(),routeLines=L.layerGroup(),historicalLabels=L.layerGroup(),vesselMarkers=L.layerGroup();
let routeAnimationCancels=[];
let atlasData={places:[],routes:[]};
const byId=new Map();
let empireRepIds=new Set();

const map=L.map("map",{zoomControl:true,preferCanvas:true}).setView([39.1,18.5],5);
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",{
  maxZoom:16,
  attribution:"Tiles &copy; Esri"
}).addTo(map);
placeMarkers.addTo(map);routeLines.addTo(map);historicalLabels.addTo(map);vesselMarkers.addTo(map);
map.zoomControl.setPosition("bottomright");

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
    "village":44,
    "coastal-village":48,
    "town":54,
    "city":66,
    "fortified-city":72,
    "capital":84,
    "port":58,
    "fortress":62,
    "generic":52
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
      <span class="badge">${esc(p.coordinateStatus||"COORDINATE STATUS UNAVAILABLE")}</span>
      <span class="badge">${esc(p.historicalStatus||"HISTORICAL STATUS UNAVAILABLE")}</span>
      ${(p.books||[]).map(b=>`<span class="badge">${esc(b)}</span>`).join("")}
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
    <div class="badges"><span class="badge">${esc(r.type||"TYPE UNAVAILABLE")}</span><span class="badge">${esc(r.status||"STATUS UNAVAILABLE")}</span>${(r.books||[]).map(b=>`<span class="badge">${esc(b)}</span>`).join("")}</div>
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
    rebuildFilters();
    render();
    setTimeout(fitVisible,0);
  });

  const years=Array.from(new Set([...atlasData.places,...atlasData.routes].flatMap(x=>yearsFrom(x.period)))).sort();
  const yearSelect=document.getElementById("yearFilter");
  yearSelect.innerHTML='<option value="All">Όλες οι περίοδοι</option>'+years.map(y=>`<option value="${y}" ${state.year===y?"selected":""}>${y}</option>`).join("");

  const stories=["All",...Array.from(new Set(atlasData.routes.map(routeStory).filter(Boolean))).sort()];
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

function routeStyle(type,medium){
  if(type==="INTELLIGENCE / NETWORK")return {weight:1.15,opacity:.5,color:"#77664f",lineCap:"round",lineJoin:"round",dashArray:"1 8"};
  if(type==="PLANNED — NOT EXECUTED")return {weight:1.1,opacity:.42,color:"#806e58",lineCap:"round",lineJoin:"round",dashArray:"10 9"};
  if(type==="STRONG RECONSTRUCTION")return {weight:1.2,opacity:.52,color:"#6d5c46",lineCap:"round",lineJoin:"round",dashArray:"4 7"};
  if(medium==="land")return {weight:1.35,opacity:.7,color:"#665038",lineCap:"round",lineJoin:"round",dashArray:"5 4"};
  return {weight:1.4,opacity:.78,color:"#57442f",lineCap:"round",lineJoin:"round",dashArray:"1 6"};
}
function routeUnderlayStyle(type,medium){
  if(type!=="DEPICTED TRAVEL")return null;
  return {weight:4.2,opacity:.58,color:"#eee4cf",lineCap:"round",lineJoin:"round"};
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
  if(pri>=4)return true;
  if(z>=8)return true;
  if(z===7)return pri>=1||routeNodeIds.has(p.id);
  if(z===6)return pri>=2||routeNodeIds.has(p.id);
  return pri>=3||routeNodeIds.has(p.id);
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
    iconSize:[72,64],
    iconAnchor:[36,32]
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

  // One visual speed for every sea route: 32 km of route per screen-second.
  const VISUAL_KM_PER_SECOND=32;
  const duration=(distanceTable.total/VISUAL_KM_PER_SECOND)*1000;

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
function render(){
  routeAnimationCancels.forEach(fn=>fn());routeAnimationCancels=[];
  placeMarkers.clearLayers();routeLines.clearLayers();historicalLabels.clearLayers();vesselMarkers.clearLayers();
  const q=state.search.trim().toLowerCase();

  const intelligencePlaceIds=new Set();
  atlasData.routes.filter(r=>r.type==="INTELLIGENCE / NETWORK"&&bookHit(r)&&yearHit(r,state.year)).forEach(r=>{
    (r.from||[]).forEach(x=>intelligencePlaceIds.add(x.id));
    (r.to||[]).forEach(x=>intelligencePlaceIds.add(x.id));
  });

  const visiblePlaces=atlasData.places.filter(p=>{
    const base=Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&bookHit(p)&&yearHit(p,state.year)&&
      (!state.verifiedOnly||p.coordinateStatus==="VERIFIED")&&textHit(p,q);
    if(!base)return false;
    if(state.mode==="PEOPLE")return Boolean((p.characters||"").trim());
    if(state.mode==="VOYAGES")return true;
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

  const activeRouteNodeIds=new Set();
  atlasData.routes.filter(r=>
    bookHit(r)&&yearHit(r,state.year)&&
    (state.routeStory==="All"||routeStory(r)===state.routeStory)
  ).forEach(r=>{
    (r.from||[]).forEach(x=>activeRouteNodeIds.add(x.id));
    (r.to||[]).forEach(x=>activeRouteNodeIds.add(x.id));
  });

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
    const filtered=atlasData.routes.filter(r=>{
      if(r.atlasHidden)return false;
      if(!hasCuratedSeaGeometry(r))return false;
      if(state.mode==="EMPIRES"||state.mode==="EVIDENCE")return false;
      if(state.mode==="INTELLIGENCE"&&r.type!=="INTELLIGENCE / NETWORK")return false;
      if(state.mode==="PEOPLE"&&!["DEPICTED TRAVEL","STRONG RECONSTRUCTION"].includes(r.type))return false;
      if(state.mode==="VOYAGES"&&!["DEPICTED TRAVEL","STRONG RECONSTRUCTION"].includes(r.type))return false;
      return state.routeTypes.has(r.type)&&bookHit(r)&&yearHit(r,state.year)&&textHit(r,q)&&
        (state.routeStory==="All"||routeStory(r)===state.routeStory);
    });

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
      const under=routeUnderlayStyle(representative.type,medium);
      if(under)L.polyline(points,under).addTo(routeLines);
      const line=L.polyline(points,routeStyle(representative.type,medium));
      const label=items.length>1?story:representative.name;
      line.bindTooltip(label,{sticky:true});
      line.on("click",()=>{
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
    filtered.forEach(r=>{
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
  const modeLabels={STORY:"Story",PEOPLE:"People",VOYAGES:"Voyages",EMPIRES:"Empires",INTELLIGENCE:"Intelligence",EVIDENCE:"Evidence",TIMELINE:"Timeline"};
  document.getElementById("countBadge").textContent=`${modeLabels[state.mode]} · ${state.showPlaces?visiblePlaces.length:0} τόποι · ${routeCount} route stories`;
}
function fitVisible(){
  const q=state.search.trim().toLowerCase();
  const latlngs=atlasData.places.filter(p=>
    Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&bookHit(p)&&yearHit(p,state.year)&&
    (!state.verifiedOnly||p.coordinateStatus==="VERIFIED")&&textHit(p,q)
  ).map(p=>[p.lat,p.lon]);
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

fetch("./data.json?v=20261006-route-audit-2",{cache:"no-store"}).then(r=>r.json()).then(data=>{
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
  if(state.mode==="VOYAGES")state.routeTypes=new Set(["DEPICTED TRAVEL","STRONG RECONSTRUCTION"]);
  if(state.mode==="STORY")state.routeTypes=new Set(["DEPICTED TRAVEL","STRONG RECONSTRUCTION"]);
  rebuildFilters();render();
}));
document.getElementById("routeStoryFilter").addEventListener("change",e=>{state.routeStory=e.target.value;render();});
document.getElementById("verifiedOnly").addEventListener("change",e=>{state.verifiedOnly=e.target.checked;render();});
document.getElementById("placesToggle").addEventListener("change",e=>{state.showPlaces=e.target.checked;e.target.checked?placeMarkers.addTo(map):map.removeLayer(placeMarkers);render();});
document.getElementById("routesToggle").addEventListener("change",e=>{
  state.showRoutes=e.target.checked;
  if(e.target.checked){routeLines.addTo(map);vesselMarkers.addTo(map);}
  else{map.removeLayer(routeLines);map.removeLayer(vesselMarkers);}
  render();
});
document.getElementById("fitBtn").addEventListener("click",fitAll);
document.getElementById("filtersBtn").addEventListener("click",openFilters);
document.getElementById("closeFilters").addEventListener("click",closeFilters);
document.getElementById("closeDetail").addEventListener("click",closeDetail);
document.getElementById("scrim").addEventListener("click",()=>{closeFilters();closeDetail();});
document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeFilters();closeDetail();}});
map.on("zoomend",render);
