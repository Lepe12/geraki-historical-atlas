(() => {
  const params=new URLSearchParams(location.search);
  const project=params.get("project")||"piratecartography";
  const requestedRun=params.get("run")||"latest";
  const apiBase=(params.get("api")||"http://127.0.0.1:8765").replace(/\/$/,"");
  const wsBase=apiBase.replace(/^http/,"ws");

  const agents=[
    ["travellers","Travellers"],["spanish_simancas","Simancas"],["venetian","Venetian"],["french","French"],
    ["british","British"],["dutch","Dutch"],["german","German"],["italian_states","Italian States"],
    ["ottoman","Ottoman"],["north_african","North African"],["pirate_base","Pirate Base"],
    ["pirate_biography","Pirate Biography"],["identity_resolution","Identity"],["timeline","Timeline"],
    ["relationship_network","Network"],["contradiction","Contradiction"],["source_genealogy","Source Genealogy"]
  ];
  const state=new Map(agents.map(([id,label])=>[id,{id,label,status:"QUEUED",percent:0,phase:"Waiting",warnings:0,connector:"—"}]));
  let events=[],socket,retryTimer,actualRun=requestedRun;
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const nodePos={spanish_simancas:[138,205],french:[300,160],venetian:[530,205],italian_states:[505,270],ottoman:[780,220],north_african:[650,405],british:[280,70],dutch:[375,78],german:[455,95]};
  const core=[515,330];

  function setConnection(status){
    $("connection-label").textContent=status;
    $("connection-dot").className="dot "+(status==="ONLINE"?"online":status==="CONNECTING"?"connecting":"offline");
  }
  function agentClass(a){return ["RUNNING","COMPLETED","FAILED","BLOCKED","QUEUED"].includes(a.status)?a.status.toLowerCase():"queued"}
  function renderAgents(){
    const values=[...state.values()];
    $("agent-grid").innerHTML=values.map(a=>`
      <article class="agent-card">
        <header><h3>${esc(a.label)}</h3><span class="status ${agentClass(a)}">${esc(a.status)}</span></header>
        <p class="meta">${esc(a.phase)} · ${esc(a.connector)}</p>
        <div class="progress"><span style="transform:scaleX(${Math.max(0,Math.min(100,a.percent))/100})"></span></div>
        <div class="mini"><span>${a.percent}%</span><span>${a.warnings} warnings</span></div>
      </article>`).join("");

    const active=values.filter(x=>x.status==="RUNNING");
    $("metric-active").textContent=active.length;
    $("metric-blocked").textContent=values.filter(x=>["BLOCKED","FAILED"].includes(x.status)).length;
    $("metric-archives").textContent=new Set(active.map(x=>x.connector).filter(x=>x&&x!=="—")).size;
    const progress=active.length?Math.round(active.reduce((n,x)=>n+x.percent,0)/active.length):
      Math.round(values.reduce((n,x)=>n+x.percent,0)/values.length);
    $("mission-progress-label").textContent=progress+"%";
    $("mission-progress-bar").style.width=progress+"%";
    const lead=active.sort((a,b)=>b.percent-a.percent)[0];
    $("mission-phase").textContent=lead?.phase||"Waiting";
    $("mission-route").textContent=lead?.connector||"—";
    $("core-state").textContent=active.length?"RESEARCH CORE ACTIVE":"SYSTEM STANDBY";

    $("priority-agents").innerHTML=values
      .filter(x=>x.status==="RUNNING"||x.status==="BLOCKED"||x.status==="FAILED")
      .slice(0,6)
      .map(a=>`<div class="priority-agent"><b>${esc(a.label)} · ${esc(a.status)}</b><span>${esc(a.phase)}</span></div>`).join("") ||
      '<div class="priority-agent"><b>Standby</b><span>No active research thread</span></div>';

    renderOrbit(values);
    renderMap(values);
  }

  function renderOrbit(values){
    const important=values.filter(a=>["pirate_base","pirate_biography","identity_resolution","timeline","relationship_network","contradiction","source_genealogy"].includes(a.id));
    const coords=[[22,24],[38,12],[61,13],[78,25],[83,55],[67,78],[35,81]];
    $("agent-orbit").innerHTML=important.map((a,i)=>`
      <div class="orb-agent ${agentClass(a)}" style="left:${coords[i][0]}%;top:${coords[i][1]}%">
        <b>${esc(a.label)}</b><span>${esc(a.status)} · ${a.percent}%</span>
      </div>`).join("");
  }

  function renderMap(values){
    document.querySelectorAll(".archive-node").forEach(n=>n.classList.remove("active","blocked"));
    const routeLayer=document.getElementById("route-layer"); routeLayer.innerHTML="";
    for(const a of values){
      const node=document.querySelector(`.archive-node[data-agent="${a.id}"]`);
      if(!node) continue;
      if(a.status==="RUNNING"){
        node.classList.add("active");
        const p=nodePos[a.id]; if(p) routeLayer.insertAdjacentHTML("beforeend",`<path class="route-line" d="M ${core[0]} ${core[1]} Q ${(core[0]+p[0])/2} ${Math.min(core[1],p[1])-70} ${p[0]} ${p[1]}"/>`);
      }
      if(["FAILED","BLOCKED"].includes(a.status)) node.classList.add("blocked");
    }
  }

  function renderLog(){
    const rows=events.slice(-250).reverse();
    $("mission-log").innerHTML=rows.map(e=>{
      const cls=(e.status==="FAILED"||e.status==="BLOCKED")?"fail":(e.warnings?.length?"warn":"");
      return `<div class="log-row ${cls}"><time>${esc(new Date(e.created_utc||Date.now()).toLocaleTimeString())}</time><div class="agent">${esc(e.agent_id||e.event_type||"SYSTEM")}</div><div>${esc(e.phase||e.detail||e.status||e.event_type||"event")}</div></div>`;
    }).join("")||'<div class="meta">Waiting for research events.</div>';

    $("evidence-feed").innerHTML=rows.slice(0,18).map(e=>{
      const cls=(e.status==="FAILED"||e.status==="BLOCKED")?"alert":(e.event_type==="agent_completed"?"good":"");
      return `<div class="intel-item ${cls}"><div class="intel-top"><b>${esc(e.agent_id||"SYSTEM")}</b><time>${esc(new Date(e.created_utc||Date.now()).toLocaleTimeString())}</time></div><p>${esc(e.phase||e.detail||e.event_type||e.status||"event")}</p></div>`;
    }).join("")||'<div class="meta">No evidence events yet.</div>';
  }

  function renderJobs(){
    const grouped={};
    for(const e of events){
      const key=e.run_id||actualRun;
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
    const latest={}; for(const e of events){const c=e.connector_id||e.connector;if(c) latest[c]=e}
    const ids=["pares_simancas_native","pares_simancas_browser","moreveneto_browser","sias_browser","archives_nationales_open_data"];
    $("connector-grid").innerHTML=ids.map(id=>{
      const e=latest[id]||{},status=e.status||"STANDBY";
      return `<article class="connector-card"><header><h3>${esc(id)}</h3><span class="status ${status.toLowerCase()}">${esc(status)}</span></header><p class="meta">${esc(e.detail||"Registered archive connector")}</p></article>`;
    }).join("");
  }

  function renderEvidence(){
    const evidenceEvents=events.filter(e=>/evidence|source|candidate|claim|contradiction|genealogy/i.test([e.event_type,e.phase,e.detail].join(" ")));
    $("evidence-list").innerHTML=evidenceEvents.slice(-100).reverse().map(e=>`<div class="intel-item"><b>${esc(e.agent_id||e.event_type)}</b><p>${esc(e.phase||e.detail||e.status||"Evidence event")}</p></div>`).join("")||'<div class="meta">No evidence-specific events yet.</div>';
    const candidate=evidenceEvents.filter(e=>/candidate|claim/i.test([e.event_type,e.phase,e.detail].join(" "))).length;
    const contradictions=evidenceEvents.filter(e=>/contradiction|conflict/i.test([e.event_type,e.phase,e.detail].join(" "))).length;
    $("metric-claims").textContent=candidate;
    $("metric-contradictions").textContent=contradictions;
    $("claim-candidates").textContent=candidate;
    $("claim-evidence").textContent=evidenceEvents.length;
    $("claim-conflicts").textContent=contradictions;
  }

  function ingest(e){
    events.push(e); if(events.length>600) events=events.slice(-600);
    if(e.run_id){actualRun=e.run_id;$("run-id-label").textContent=actualRun;$("mission-run").textContent=actualRun}
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
    const blob=[e.event_type,e.phase,e.detail].join(" ").toLowerCase();
    if(blob.includes("genealogy")) $("qa-genealogy").textContent="ACTIVE";
    if(blob.includes("contradiction")) $("qa-contradiction").textContent="ACTIVE";
    if(blob.includes("original")&&blob.includes("inspect")) $("qa-original").textContent="IN REVIEW";
    renderAgents();renderLog();renderJobs();renderConnectors();renderEvidence();
  }

  function loadPreviewData(){
    if(events.length) return;
    const now=new Date().toISOString();
    const demo=[
      {created_utc:now,event_type:"agent_started",agent_id:"venetian",phase:"Moreveneto catalogue search",percent:44,status:"RUNNING",connector_id:"moreveneto_browser"},
      {created_utc:now,event_type:"agent_progress",agent_id:"spanish_simancas",phase:"PARES / AGS record discovery",percent:68,status:"RUNNING",connector_id:"pares_simancas_native"},
      {created_utc:now,event_type:"agent_started",agent_id:"ottoman",phase:"Ottoman archive route discovery",percent:31,status:"RUNNING",connector_id:"—"},
      {created_utc:now,event_type:"agent_completed",agent_id:"identity_resolution",phase:"4 historical name variants reviewed",percent:100,status:"COMPLETED"},
      {created_utc:now,event_type:"agent_progress",agent_id:"timeline",phase:"Chronology consistency check",percent:73,status:"RUNNING"},
      {created_utc:now,event_type:"agent_progress",agent_id:"contradiction",phase:"Contradiction search: competing account under review",percent:51,status:"RUNNING"},
      {created_utc:now,event_type:"agent_completed",agent_id:"source_genealogy",phase:"Source genealogy map built",percent:100,status:"COMPLETED"},
      {created_utc:now,event_type:"candidate_claim",agent_id:"pirate_biography",phase:"Candidate claim extracted from catalogue context",percent:57,status:"RUNNING"},
      {created_utc:now,event_type:"evidence_candidate",agent_id:"pirate_base",phase:"Possible operational base reference discovered",percent:38,status:"RUNNING"}
    ];
    demo.forEach(ingest);
    const note=document.createElement("div");note.className="preview-banner";note.textContent="PREVIEW MODE — visual demonstration. Live research data appears when the backend is connected.";document.querySelector(".shell").prepend(note);
  }

  async function loadSnapshot(){
    try{
      const r=await fetch(`${apiBase}/status/${encodeURIComponent(project)}/${encodeURIComponent(requestedRun)}`);
      if(!r.ok) throw new Error("snapshot failed");
      const data=await r.json(); actualRun=data.run_id||requestedRun;
      $("run-id-label").textContent=actualRun;$("mission-run").textContent=actualRun;
      events=[]; for(const e of data.events||[]) ingest(e);
      if(!(data.events||[]).length) loadPreviewData();
    }catch(_){loadPreviewData()}
  }

  function connect(){
    clearTimeout(retryTimer);setConnection("CONNECTING");
    try{socket=new WebSocket(`${wsBase}/ws/${encodeURIComponent(project)}/${encodeURIComponent(requestedRun)}`)}catch(_){retryTimer=setTimeout(connect,5000);return}
    socket.onopen=()=>setConnection("ONLINE");
    socket.onmessage=m=>{try{ingest(JSON.parse(m.data))}catch(_){}};
    socket.onclose=()=>{setConnection("OFFLINE");loadPreviewData();retryTimer=setTimeout(connect,5000)};
    socket.onerror=()=>socket.close();
  }

  document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>{
    document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(x=>x.classList.remove("active"));
    btn.classList.add("active");$("tab-"+btn.dataset.tab).classList.add("active");
  }));
  $("clear-log").addEventListener("click",()=>{$("mission-log").innerHTML='<div class="meta">Local log view cleared.</div>';$("evidence-feed").innerHTML='<div class="meta">Local evidence view cleared.</div>'});
  $("refresh-button").addEventListener("click",loadSnapshot);
  $("run-id-label").textContent=requestedRun;$("mission-run").textContent=requestedRun;
  renderAgents();renderConnectors();renderJobs();renderLog();renderEvidence();loadSnapshot();connect();
})();
