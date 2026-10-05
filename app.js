const state={book:"All",search:"",verifiedOnly:false,showPlaces:true,showRoutes:true,routeTypes:new Set()};
const placeMarkers=L.layerGroup(), routeLines=L.layerGroup();
let atlasData={places:[],routes:[]};
const byId=new Map();

const map=L.map("map",{zoomControl:true}).setView([39.1,18.5],5);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
  maxZoom:18,
  attribution:"&copy; OpenStreetMap contributors"
}).addTo(map);
placeMarkers.addTo(map); routeLines.addTo(map);

const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
const textHit=(obj,q)=>!q||Object.values(obj).some(v=>{
  if(Array.isArray(v)) return v.join(" ").toLowerCase().includes(q);
  if(v&&typeof v==="object") return JSON.stringify(v).toLowerCase().includes(q);
  return String(v??"").toLowerCase().includes(q);
});
const coordClass=p=>p.coordinateStatus==="VERIFIED"?"documented":p.coordinateStatus==="NEEDS RESEARCH"?"research":"mixed";
const routeDashed=t=>t!=="DEPICTED TRAVEL";

function markerIcon(p){
  return L.divIcon({className:"",html:`<div class="marker-icon marker-${coordClass(p)}"></div>`,iconSize:[14,14],iconAnchor:[7,7]});
}
function showPlace(p){
  const d=document.getElementById("detailPanel"); d.className="detail";
  d.innerHTML=`
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
  `;
}
function showRoute(r){
  const d=document.getElementById("detailPanel"); d.className="detail";
  d.innerHTML=`
    <h1>${esc(r.name||"Route")}</h1>
    <div class="sub">${esc(r.character||"")}</div>
    <div class="badges"><span class="badge">${esc(r.type||"TYPE UNAVAILABLE")}</span><span class="badge">${esc(r.status||"STATUS UNAVAILABLE")}</span>${(r.books||[]).map(b=>`<span class="badge">${esc(b)}</span>`).join("")}</div>
    ${field("Period",r.period)}
    ${field("From",(r.from||[]).map(x=>x.name).join(", ")||"Unavailable")}
    ${field("To",(r.to||[]).map(x=>x.name).join(", ")||"Unavailable")}
    ${field("Evidence / scene",r.evidence)}
    ${field("Atlas display note",r.note)}
    ${field("Geometry note","Schematic straight segment between Airtable nodes; not an exact historical track.")}
  `;
}
function field(k,v){return `<div class="field"><div class="k">${esc(k)}</div><div class="v">${esc(v||"Unavailable")}</div></div>`}

function rebuildFilters(){
  const books=["All",...Array.from(new Set(atlasData.places.flatMap(p=>p.books||[]))).sort()];
  document.getElementById("bookFilters").innerHTML=books.map(b=>`<button class="chip ${state.book===b?"active":""}" data-book="${esc(b)}">${esc(b)}</button>`).join("");
  document.querySelectorAll("[data-book]").forEach(b=>b.onclick=()=>{state.book=b.dataset.book;rebuildFilters();render();});
  const types=Array.from(new Set(atlasData.routes.map(r=>r.type).filter(Boolean))).sort();
  if(!state.routeTypes.size) types.forEach(t=>state.routeTypes.add(t));
  document.getElementById("routeFilters").innerHTML=types.map(t=>`<label><input type="checkbox" data-route="${esc(t)}" ${state.routeTypes.has(t)?"checked":""}> ${esc(t)}</label>`).join("");
  document.querySelectorAll("[data-route]").forEach(c=>c.onchange=()=>{c.checked?state.routeTypes.add(c.dataset.route):state.routeTypes.delete(c.dataset.route);render();});
}

function render(){
  placeMarkers.clearLayers(); routeLines.clearLayers();
  const q=state.search.trim().toLowerCase();
  const visiblePlaces=atlasData.places.filter(p=>
    Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&
    (state.book==="All"||(p.books||[]).includes(state.book))&&
    (!state.verifiedOnly||p.coordinateStatus==="VERIFIED")&&textHit(p,q)
  );
  const visibleIds=new Set(visiblePlaces.map(p=>p.id));
  if(state.showPlaces) visiblePlaces.forEach(p=>{
    const m=L.marker([p.lat,p.lon],{icon:markerIcon(p),title:p.place});
    m.bindTooltip(p.place,{direction:"top"});
    m.bindPopup(`<strong>${esc(p.place)}</strong><br><small>${esc(p.period||"")}</small>`);
    m.on("click",()=>showPlace(p)); m.addTo(placeMarkers);
  });

  let routeCount=0;
  if(state.showRoutes){
    atlasData.routes.filter(r=>
      state.routeTypes.has(r.type)&&
      (state.book==="All"||(r.books||[]).includes(state.book))&&textHit(r,q)
    ).forEach(r=>{
      const a=(r.from||[])[0],b=(r.to||[])[0];
      if(!a||!b) return;
      const pa=byId.get(a.id),pb=byId.get(b.id);
      if(!pa||!pb||!Number.isFinite(pa.lat)||!Number.isFinite(pb.lat)) return;
      if(state.verifiedOnly&&(pa.coordinateStatus!=="VERIFIED"||pb.coordinateStatus!=="VERIFIED")) return;
      const opts={weight:2,opacity:.8};
      if(routeDashed(r.type)) opts.dashArray="7 7";
      const line=L.polyline([[pa.lat,pa.lon],[pb.lat,pb.lon]],opts);
      line.bindTooltip(r.name); line.on("click",()=>showRoute(r)); line.addTo(routeLines); routeCount++;
    });
  }
  document.getElementById("countBadge").textContent=`${state.showPlaces?visiblePlaces.length:0} places · ${routeCount} routes`;
}
function fitAll(){
  const latlngs=atlasData.places.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)).map(p=>[p.lat,p.lon]);
  if(latlngs.length) map.fitBounds(latlngs,{padding:[35,35]});
}
fetch("./data.json").then(r=>r.json()).then(data=>{
  atlasData=data; atlasData.places.forEach(p=>byId.set(p.id,p));
  rebuildFilters(); render(); fitAll();
}).catch(err=>{
  document.getElementById("countBadge").textContent="Could not load atlas data";
  console.error(err);
});
document.getElementById("searchInput").addEventListener("input",e=>{state.search=e.target.value;render();});
document.getElementById("verifiedOnly").addEventListener("change",e=>{state.verifiedOnly=e.target.checked;render();});
document.getElementById("placesToggle").addEventListener("change",e=>{state.showPlaces=e.target.checked;e.target.checked?placeMarkers.addTo(map):map.removeLayer(placeMarkers);render();});
document.getElementById("routesToggle").addEventListener("change",e=>{state.showRoutes=e.target.checked;e.target.checked?routeLines.addTo(map):map.removeLayer(routeLines);render();});
document.getElementById("fitBtn").addEventListener("click",fitAll);
