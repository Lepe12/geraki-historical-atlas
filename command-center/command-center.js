(() => {
  const params=new URLSearchParams(location.search);
  const project=params.get("project")||"piratecartography";
  const runId=params.get("run")||"latest";
  const apiBase=(params.get("api")||"http://127.0.0.1:8765").replace(/\/$/,"");
  const wsBase=apiBase.replace(/^http/,"ws");

  const agents=[
    ["travellers","Travellers & Literature"],["spanish_simancas","Spanish / Simancas"],["venetian","Venetian"],
    ["french","French"],["british","British"],["dutch","Dutch"],["german","German"],
    ["italian_states","Italian States"],["ottoman","Ottoman"],["north_african","North African"],
    ["pirate_base","Pirate Base"],["pirate_biography","Pirate Biography"],["identity_resolution","Identity Resolution"],
    ["timeline","Timeline"],["relationship_network","Relationship Network"],["contradiction","Contradiction"],
    ["source_genealogy","Source Genealogy"]
  ];
  const state=new Map(agents.map(([id,label])=>[id,{id,label,status:"QUEUED",percent:0,phase:"Waiting",warnings:0,connector:"—"}]));
  let events=[],socket,retryTimer;

  const $=id=>document.getElementById(id);
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

  function setConnection(status){
    $("connection-label").textContent=status;
    $("connection-dot").className="dot "+(status==="ONLINE"?"online":status==="CONNECTING"?"connecting":"offline");
  }
  function renderAgents(){
    $("agent-grid").innerHTML=[...state.values()].map(a=>`
      <article class="agent-card">
        <header><h3>${esc(a.label)}</h3><span class="status ${a.status.toLowerCase()}">${esc(a.status)}</span></header>
        <p class="meta">${esc(a.phase)} · connector: ${esc(a.connector)}</p>
        <div class="progress"><span style="transform:scaleX(${Math.max(0,Math.min(100,a.percent))/100})"></span></div>
        <div class="mini"><span>${a.percent}%</span><span>${a.warnings} warnings</span></div>
      </article>`).join("");
    const values=[...state.values()];
    $("metric-active").textContent=values.filter(x=>x.status==="RUNNING").length;
    $("metric-completed").textContent=values.filter(x=>x.status==="COMPLETED").length;
    $("metric-blocked").textContent=values.filter(x=>["BLOCKED","FAILED"].includes(x.status)).length;
    $("metric-warnings").textContent=values.reduce((n,x)=>n+x.warnings,0);
  }
  function renderLog(){
    $("mission-log").innerHTML=events.slice(-250).reverse().map(e=>{
      const cls=(e.status==="FAILED"||e.status==="BLOCKED")?"fail":(e.warnings?.length?"warn":"");
      return `<div class="log-row ${cls}"><time>${esc(new Date(e.created_utc||Date.now()).toLocaleTimeString())}</time><div class="agent">${esc(e.agent_id||e.event_type||"SYSTEM")}</div><div>${esc(e.phase||e.detail||e.status||e.event_type||"event")}</div></div>`;
    }).join("")||'<div class="empty">Waiting for research events.</div>';
  }
  function renderJobs(){
    const grouped={};
    for(const e of events){
      const key=e.run_id||runId;
      grouped[key]=grouped[key]||{run:key,status:"RUNNING",agents:new Set(),last:e.created_utc};
      if(e.agent_id) grouped[key].agents.add(e.agent_id);
      if(e.event_type==="agent_failed") grouped[key].status="FAILED";
      if(e.event_type==="agent_completed" && grouped[key].status!=="FAILED") grouped[key].status="ACTIVE";
      grouped[key].last=e.created_utc||grouped[key].last;
    }
    const rows=Object.values(grouped);
    $("jobs-table").innerHTML=`<table><thead><tr><th>Run</th><th>Status</th><th>Agents</th><th>Last event</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.run)}</td><td>${esc(r.status)}</td><td>${r.agents.size}</td><td>${esc(r.last||"—")}</td></tr>`).join("")}</tbody></table>`;
  }
  function renderConnectors(){
    const latest={};
    for(const e of events){
      const c=e.connector_id||e.connector;
      if(c) latest[c]=e;
    }
    const ids=["pares_simancas_native","pares_simancas_browser","moreveneto_browser","sias_browser","archives_nationales_open_data"];
    $("connector-grid").innerHTML=ids.map(id=>{
      const e=latest[id]||{};
      const status=e.status||"STANDBY";
      return `<article class="connector-card"><header><h3>${esc(id)}</h3><span class="status ${status.toLowerCase()}">${esc(status)}</span></header><p class="meta">${esc(e.detail||"Registered connector")}</p></article>`;
    }).join("");
  }
  function ingest(e){
    events.push(e);
    if(events.length>500) events=events.slice(-500);
    if(e.agent_id && state.has(e.agent_id)){
      const a=state.get(e.agent_id);
      if(e.event_type==="agent_started") a.status="RUNNING";
      else if(e.event_type==="agent_completed") a.status="COMPLETED";
      else if(e.event_type==="agent_failed") a.status="FAILED";
      else if(e.status) a.status=String(e.status).toUpperCase();
      if(Number.isFinite(Number(e.percent))) a.percent=Number(e.percent);
      if(e.phase) a.phase=e.phase;
      if(e.connector_id||e.connector) a.connector=e.connector_id||e.connector;
      a.warnings+=(e.warnings||[]).length;
    }
    if(e.event_type?.includes("genealogy")) $("qa-genealogy").textContent="ACTIVE";
    if(e.event_type?.includes("contradiction")) $("qa-contradiction").textContent="ACTIVE";
    renderAgents();renderLog();renderJobs();renderConnectors();
  }
  async function loadSnapshot(){
    try{
      const r=await fetch(`${apiBase}/status/${encodeURIComponent(project)}/${encodeURIComponent(runId)}`);
      if(!r.ok) throw new Error("snapshot failed");
      const data=await r.json();
      events=[];
      for(const e of data.events||[]) ingest(e);
    }catch(_){}
  }
  function connect(){
    clearTimeout(retryTimer); setConnection("CONNECTING");
    try{socket=new WebSocket(`${wsBase}/ws/${encodeURIComponent(project)}/${encodeURIComponent(runId)}`)}catch(_){retryTimer=setTimeout(connect,2500);return}
    socket.onopen=()=>setConnection("ONLINE");
    socket.onmessage=m=>{try{ingest(JSON.parse(m.data))}catch(_){}};
    socket.onclose=()=>{setConnection("OFFLINE");retryTimer=setTimeout(connect,2500)};
    socket.onerror=()=>socket.close();
  }

  document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>{
    document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(x=>x.classList.remove("active"));
    btn.classList.add("active"); $("tab-"+btn.dataset.tab).classList.add("active");
  }));
  $("clear-log").addEventListener("click",()=>{$("mission-log").innerHTML='<div class="empty">Local log view cleared.</div>'});
  $("refresh-button").addEventListener("click",loadSnapshot);
  renderAgents();renderConnectors();renderJobs();renderLog();loadSnapshot();connect();
})();
