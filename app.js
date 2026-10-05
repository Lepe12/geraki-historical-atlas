const state={book:"All",search:"",year:"All",verifiedOnly:false,showPlaces:true,showRoutes:true,routeTypes:new Set()};
const placeMarkers=L.layerGroup(),routeLines=L.layerGroup();
let atlasData={places:[],routes:[]};
const byId=new Map();

const map=L.map("map",{zoomControl:true,preferCanvas:true}).setView([39.1,18.5],5);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:"&copy; OpenStreetMap contributors"}).addTo(map);
placeMarkers.addTo(map);routeLines.addTo(map);
map.zoomControl.setPosition("bottomright");

const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
const textHit=(obj,q)=>!q||Object.values(obj).some(v=>{
  if(Array.isArray(v))return v.join(" ").toLowerCase().includes(q);
  if(v&&typeof v==="object")return JSON.stringify(v).toLowerCase().includes(q);
  return String(v??"").toLowerCase().includes(q);
});
const coordClass=p=>p.coordinateStatus==="VERIFIED"?"documented":p.coordinateStatus==="NEEDS RESEARCH"?"research":"mixed";
const routeDashed=t=>t!=="DEPICTED TRAVEL";
const yearsFrom=s=>Array.from(new Set((String(s||"").match(/15\d{2}/g)||[])));
const yearHit=(obj,year)=>year==="All"||yearsFrom(obj.period).includes(year);
const bookHit=(obj)=>state.book==="All"||(obj.books||[]).includes(state.book);

function markerIcon(p){
  return L.divIcon({
    className:"",
    html:`<div class="marker-wrap"><div class="marker-icon marker-${coordClass(p)}"></div></div>`,
    iconSize:[22,22],iconAnchor:[11,11]
  });
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
  openDetail(`
    <div class="mini-kicker">PLACE DOSSIER</div>
    <h1>${esc(p.place||"Unavailable")}</h1>
    <div class="sub">${esc(p.historicalNames||p.modernName||"")}</div>
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
  document.querySelectorAll("[data-book]").forEach(b=>b.onclick=()=>{state.book=b.dataset.book;rebuildFilters();render();});

  const years=Array.from(new Set([...atlasData.places,...atlasData.routes].flatMap(x=>yearsFrom(x.period)))).sort();
  const yearSelect=document.getElementById("yearFilter");
  yearSelect.innerHTML='<option value="All">Όλες οι περίοδοι</option>'+years.map(y=>`<option value="${y}" ${state.year===y?"selected":""}>${y}</option>`).join("");

  const types=Array.from(new Set(atlasData.routes.map(r=>r.type).filter(Boolean))).sort();
  if(!state.routeTypes.size)types.forEach(t=>state.routeTypes.add(t));
  document.getElementById("routeFilters").innerHTML=types.map(t=>`<label><input type="checkbox" data-route="${esc(t)}" ${state.routeTypes.has(t)?"checked":""}> <span>${esc(t)}</span></label>`).join("");
  document.querySelectorAll("[data-route]").forEach(c=>c.onchange=()=>{c.checked?state.routeTypes.add(c.dataset.route):state.routeTypes.delete(c.dataset.route);render();});
}

function routeStyle(type){
  const base={weight:2.2,opacity:.82,color:"#c3a15e"};
  if(type==="INTELLIGENCE / NETWORK")return {...base,dashArray:"2 8",weight:2.4,opacity:.7};
  if(type==="PLANNED — NOT EXECUTED")return {...base,dashArray:"10 9",opacity:.52};
  if(type==="STRONG RECONSTRUCTION")return {...base,dashArray:"7 7",opacity:.66};
  return base;
}

function render(){
  placeMarkers.clearLayers();routeLines.clearLayers();
  const q=state.search.trim().toLowerCase();
  const visiblePlaces=atlasData.places.filter(p=>
    Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&bookHit(p)&&yearHit(p,state.year)&&
    (!state.verifiedOnly||p.coordinateStatus==="VERIFIED")&&textHit(p,q)
  );

  if(state.showPlaces)visiblePlaces.forEach(p=>{
    const m=L.marker([p.lat,p.lon],{icon:markerIcon(p),title:p.place,riseOnHover:true});
    m.bindTooltip(p.place,{direction:"top",offset:[0,-8]});
    m.bindPopup(`<strong>${esc(p.place)}</strong><br><small>${esc(p.period||"")}</small>`);
    m.on("click",()=>showPlace(p));
    m.addTo(placeMarkers);
  });

  let routeCount=0;
  if(state.showRoutes){
    atlasData.routes.filter(r=>state.routeTypes.has(r.type)&&bookHit(r)&&yearHit(r,state.year)&&textHit(r,q)).forEach(r=>{
      const a=(r.from||[])[0],b=(r.to||[])[0];
      if(!a||!b)return;
      const pa=byId.get(a.id),pb=byId.get(b.id);
      if(!pa||!pb||!Number.isFinite(pa.lat)||!Number.isFinite(pb.lat))return;
      if(state.verifiedOnly&&(pa.coordinateStatus!=="VERIFIED"||pb.coordinateStatus!=="VERIFIED"))return;
      const line=L.polyline([[pa.lat,pa.lon],[pb.lat,pb.lon]],routeStyle(r.type));
      line.bindTooltip(r.name,{sticky:true});
      line.on("click",()=>showRoute(r));
      line.addTo(routeLines);routeCount++;
    });
  }
  document.getElementById("countBadge").textContent=`${state.showPlaces?visiblePlaces.length:0} τόποι · ${routeCount} διαδρομές`;
}
function fitAll(){
  const latlngs=atlasData.places.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)).map(p=>[p.lat,p.lon]);
  if(latlngs.length)map.fitBounds(latlngs,{padding:[70,70]});
}
function openFilters(){
  document.getElementById("controlPanel").classList.add("open");
  document.getElementById("scrim").classList.add("on");
}
function closeFilters(){
  document.getElementById("controlPanel").classList.remove("open");
  if(!document.getElementById("detailPanel").classList.contains("open"))document.getElementById("scrim").classList.remove("on");
}

fetch("./data.json").then(r=>r.json()).then(data=>{
  atlasData=data;atlasData.places.forEach(p=>byId.set(p.id,p));
  rebuildFilters();render();fitAll();
}).catch(err=>{
  document.getElementById("countBadge").textContent="Could not load atlas data";
  console.error(err);
});

document.getElementById("searchInput").addEventListener("input",e=>{state.search=e.target.value;render();});
document.getElementById("yearFilter").addEventListener("change",e=>{state.year=e.target.value;render();});
document.getElementById("verifiedOnly").addEventListener("change",e=>{state.verifiedOnly=e.target.checked;render();});
document.getElementById("placesToggle").addEventListener("change",e=>{state.showPlaces=e.target.checked;e.target.checked?placeMarkers.addTo(map):map.removeLayer(placeMarkers);render();});
document.getElementById("routesToggle").addEventListener("change",e=>{state.showRoutes=e.target.checked;e.target.checked?routeLines.addTo(map):map.removeLayer(routeLines);render();});
document.getElementById("fitBtn").addEventListener("click",fitAll);
document.getElementById("filtersBtn").addEventListener("click",openFilters);
document.getElementById("closeFilters").addEventListener("click",closeFilters);
document.getElementById("closeDetail").addEventListener("click",closeDetail);
document.getElementById("scrim").addEventListener("click",()=>{closeFilters();closeDetail();});
document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeFilters();closeDetail();}});
