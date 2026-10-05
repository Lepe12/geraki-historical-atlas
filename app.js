const state={mode:"STORY",book:"All",search:"",year:"All",routeStory:"All",verifiedOnly:false,showPlaces:true,showRoutes:true,routeTypes:new Set(["DEPICTED TRAVEL"])};
const placeMarkers=L.layerGroup(),routeLines=L.layerGroup();
let atlasData={places:[],routes:[]};
const byId=new Map();
let empireRepIds=new Set();

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
const COMMONS=file=>"https://commons.wikimedia.org/wiki/Special:Redirect/file/"+encodeURIComponent(file);
const POWERS={
  spain_pre1580:{
    id:"spain_pre1580",name:"Ισπανική Μοναρχία — Φίλιππος Β΄",type:"coat of arms",
    file:"Coat of Arms of Philip II of Spain (1558-1580).svg"
  },
  spain_1580:{
    id:"spain_1580",name:"Ισπανική Μοναρχία — Φίλιππος Β΄",type:"coat of arms, from 1580",
    file:"Royal Arms of Spain (1580-1668).svg"
  },
  france:{
    id:"france",name:"Βασίλειο της Γαλλίας",type:"royal arms",
    file:"Coat of Arms of the Kingdom of France (from Royal Standard).svg"
  },
  venice:{
    id:"venice",name:"Γαληνοτάτη Δημοκρατία της Βενετίας",type:"Lion of Saint Mark",
    file:"Coat of arms of Republic of Venice.svg"
  },
  ottoman:{
    id:"ottoman",name:"Οθωμανική Αυτοκρατορία — Μουράτ Γ΄",type:"tughra, not a Western coat of arms",
    file:"Tughra of Murad III.svg"
  },
  hospitaller:{
    id:"hospitaller",name:"Τάγμα του Αγίου Ιωάννη / Ιωαννίτες",type:"coat of arms",
    file:"Coat of arms of the Knights Hospitaller.svg"
  },
  ragusa:{
    id:"ragusa",name:"Δημοκρατία της Ραγούσας",type:"coat of arms",
    file:"Coat of Arms of the Republic of Ragusa.svg"
  }
};
Object.values(POWERS).forEach(p=>p.image=COMMONS(p.file));

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

function markerIcon(p){
  if(state.mode==="EMPIRES"){
    const power=powerForPlace(p);
    if(power){
      if(empireRepIds.has(p.id)){
        const tughra=power.id==="ottoman"?" tughra":"";
        const safe=power.image.replace(/"/g,"%22");
        return L.divIcon({
          className:"",
          html:`<div class="power-marker${tughra}"><span class="power-img" style="background-image:url('${safe}')"></span></div>`,
          iconSize:[38,38],iconAnchor:[19,19]
        });
      }
      return L.divIcon({
        className:"",
        html:`<div class="empire-site-marker"></div>`,
        iconSize:[11,11],iconAnchor:[5,5]
      });
    }
  }
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
  const power=powerForPlace(p);
  openDetail(`
    <div class="mini-kicker">PLACE DOSSIER</div>
    <h1>${esc(p.place||"Unavailable")}</h1>
    <div class="sub">${esc(p.historicalNames||p.modernName||"")}</div>
    ${power?`<div class="power-badge"><img src="${power.image}" alt=""><div><div class="power-name">${esc(power.name)}</div><div class="sub">${esc(power.type)}</div></div></div>`:""}
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
    <div class="power-card"><img src="${p.image}" alt=""><div><div class="pn">${esc(p.name)}</div><div class="pt">${esc(p.type)}</div></div></div>
  `).join("");
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
  });

  let routeCount=0;
  if(state.showRoutes){
    const filtered=atlasData.routes.filter(r=>{
      if(state.mode==="EMPIRES"||state.mode==="EVIDENCE")return false;
      if(state.mode==="INTELLIGENCE"&&r.type!=="INTELLIGENCE / NETWORK")return false;
      if(state.mode==="PEOPLE"&&r.type!=="DEPICTED TRAVEL")return false;
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
      const key=routeStory(r)+"||"+r.type;
      if(!grouped.has(key))grouped.set(key,[]);
      grouped.get(key).push({r,pa,pb});
    });

    grouped.forEach(items=>{
      items.sort((x,y)=>(x.r.sequence||0)-(y.r.sequence||0));
      const story=routeStory(items[0].r);
      const points=[];
      const seen=new Set();
      items.forEach((it,i)=>{
        const pair=[[it.pa.lat,it.pa.lon],[it.pb.lat,it.pb.lon]];
        pair.forEach((pt,j)=>{
          const k=pt.join(",");
          if(!seen.has(k) || (i===0&&j===0)){points.push(pt);seen.add(k);}
        });
      });
      if(points.length<2)return;
      const representative=items[0].r;
      const line=L.polyline(points,routeStyle(representative.type));
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
      line.addTo(routeLines);routeCount++;
    });
  }
  const modeLabels={STORY:"Story",PEOPLE:"People",EMPIRES:"Empires",INTELLIGENCE:"Intelligence",EVIDENCE:"Evidence",TIMELINE:"Timeline"};
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

fetch("./data.json").then(r=>r.json()).then(data=>{
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
  if(state.mode==="PEOPLE")state.routeTypes=new Set(["DEPICTED TRAVEL"]);
  if(state.mode==="STORY"&&state.routeTypes.size===0)state.routeTypes=new Set(["DEPICTED TRAVEL"]);
  rebuildFilters();render();
}));
document.getElementById("routeStoryFilter").addEventListener("change",e=>{state.routeStory=e.target.value;render();});
document.getElementById("verifiedOnly").addEventListener("change",e=>{state.verifiedOnly=e.target.checked;render();});
document.getElementById("placesToggle").addEventListener("change",e=>{state.showPlaces=e.target.checked;e.target.checked?placeMarkers.addTo(map):map.removeLayer(placeMarkers);render();});
document.getElementById("routesToggle").addEventListener("change",e=>{state.showRoutes=e.target.checked;e.target.checked?routeLines.addTo(map):map.removeLayer(routeLines);render();});
document.getElementById("fitBtn").addEventListener("click",fitAll);
document.getElementById("filtersBtn").addEventListener("click",openFilters);
document.getElementById("closeFilters").addEventListener("click",closeFilters);
document.getElementById("closeDetail").addEventListener("click",closeDetail);
document.getElementById("scrim").addEventListener("click",()=>{closeFilters();closeDetail();});
document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeFilters();closeDetail();}});
