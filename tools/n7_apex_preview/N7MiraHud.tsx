"use client";
// Overview and status-bar geometry adapted from MIRA-HUD (MIT). See N7-MIRA-HUD-LICENSE.txt.
import {useEffect,useId,useState} from "react";

export function N7MiraOverview(){
  const [now,setNow]=useState<Date|null>(null);
  useEffect(()=>{
    const update=()=>setNow(new Date());
    update();
    const timer=setInterval(update,30000);
    return()=>clearInterval(timer);
  },[]);
  return <div className="n7-mira-overview">
    <div className="n7-mira-filament" aria-hidden="true"/>
    <div className="n7-mira-name">N7 Humanoid</div>
    {now&&<time dateTime={now.toISOString()}>
      <span>{now.toLocaleTimeString("el-GR",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Athens"})}</span>
      <small>{now.toLocaleDateString("el-GR",{weekday:"short",day:"numeric",month:"short",timeZone:"Europe/Athens"})}</small>
    </time>}
  </div>;
}

const BARS=Array.from({length:28},(_,i)=>({x:125+i*(167/27),height:7+(i*13)%20}));

export function N7MiraStatus({label,hint}:{label:string;hint?:string}){
  const glowId=useId();
  return <div className="n7-home-voice-state">
    <svg className="n7-home-meter" viewBox="0 20 420 57" aria-hidden="true">
      <defs><filter id={glowId} x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="4" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter></defs>
      <path d="M60 48H182 M238 48H360" stroke="currentColor" strokeDasharray="4 3" opacity=".34"/>
      {BARS.map(({x,height})=><rect key={x} x={x} y={48-height/2} width={3} height={height} rx={1.5} fill="currentColor" className="n7-mira-bar"/>)}
      <circle cx={210} cy={48} r={20} fill="#06121d" stroke="currentColor" strokeWidth={1.5} filter={`url(#${glowId})`}/>
      <circle cx={210} cy={48} r={6} fill="#f5c26b"/>
    </svg>
    <span className="n7-mira-state" role="status" aria-label="Φωνητική κατάσταση N7">{label}</span>
    <div className="n7-mira-status-dots" aria-hidden="true"><i/><i/><i/></div>
    {hint&&<span className="n7-home-call-hint">{hint}</span>}
  </div>;
}
