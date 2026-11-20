"use client";
import {useEffect, useRef, useState} from "react";
import {N7_MIRA_FIELD_FRAGMENT} from "./N7MiraFieldShader";
import type {GuideMood} from "./N7GuideScene";
import type {N7BackdropTuning} from "./N7Backdrop";

const VERTEX = "attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }";
const STATE_NUMBER = {idle:0,listening:1,thinking:2,speaking:3};

export default function N7MiraField({tuning,activity,voiceLevel}:{tuning:N7BackdropTuning;activity:GuideMood;voiceLevel:{current:number}}){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const options=useRef({tuning,activity,voiceLevel});
  useEffect(()=>{options.current={tuning,activity,voiceLevel};},[tuning,activity,voiceLevel]);
  const [generation,setGeneration]=useState(0);
  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas)return;
    const gl=canvas.getContext("webgl",{alpha:false,antialias:false,powerPreference:"low-power"});
    if(!gl)return;
    const program=gl.createProgram();
    if(!program)return;
    for(const [kind,source] of [[gl.VERTEX_SHADER,VERTEX],[gl.FRAGMENT_SHADER,N7_MIRA_FIELD_FRAGMENT]] as const){
      const shader=gl.createShader(kind);
      if(!shader){gl.deleteProgram(program);return;}
      gl.shaderSource(shader,source);
      gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){
        gl.deleteShader(shader);gl.deleteProgram(program);return;
      }
      gl.attachShader(program,shader);
      gl.deleteShader(shader);
    }
    gl.linkProgram(program);
    const buffer=gl.createBuffer();
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)||!buffer){gl.deleteBuffer(buffer);gl.deleteProgram(program);return;}
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,"a");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    const keys=["iRes","iTime","iField","iMatter","iCenter","iRing","iClear","iSpread","iState","iEnergy","iDebug","iHotLo","iAlpha","iNear"] as const;
    const U=Object.fromEntries(keys.map(key=>[key,gl.getUniformLocation(program,key)]));
    gl.uniform1f(U.iField,1);
    gl.uniform1f(U.iMatter,1);
    gl.uniform2f(U.iCenter,.5,.51);
    gl.uniform1f(U.iClear,.5);
    gl.uniform1f(U.iSpread,0);
    gl.uniform1f(U.iDebug,0);
    gl.uniform1f(U.iHotLo,.66);
    let raf=0,last=0,time=0,painted="";
    const draw=(now:number)=>{
      raf=requestAnimationFrame(draw);
      if(document.hidden||now-last<50)return;
      const delta=last?Math.min(now-last,100)/1000:0;last=now;
      const {tuning,activity,voiceLevel}=options.current;
      const width=Math.max(160,Math.round(canvas.clientWidth*.42)),height=Math.max(180,Math.round(canvas.clientHeight*.42));
      const energy=activity==="speaking"?voiceLevel.current:0;
      time+=delta*tuning.motion/100;
      const frame=`${width}:${height}:${time}:${tuning.fog}:${tuning.brightness}:${activity}:${energy}`;
      if(frame===painted)return;
      painted=frame;
      if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;gl.viewport(0,0,width,height);}
      gl.uniform2f(U.iRes,width,height);
      gl.uniform1f(U.iRing,Math.min(.28,width/height*.46));
      gl.uniform1f(U.iTime,time);
      gl.uniform1f(U.iState,STATE_NUMBER[activity]);
      gl.uniform1f(U.iEnergy,energy);
      gl.uniform1f(U.iAlpha,tuning.fog*tuning.brightness/10000);
      gl.uniform1f(U.iNear,1.45*tuning.fog/100);
      gl.drawArrays(gl.TRIANGLES,0,6);
      canvas.dataset.rendered="true";
    };
    const lost=(event:Event)=>{event.preventDefault();cancelAnimationFrame(raf);delete canvas.dataset.rendered;};
    const restored=()=>setGeneration(value=>value+1);
    canvas.addEventListener("webglcontextlost",lost);
    canvas.addEventListener("webglcontextrestored",restored);
    raf=requestAnimationFrame(draw);
    return()=>{
      cancelAnimationFrame(raf);
      canvas.removeEventListener("webglcontextlost",lost);
      canvas.removeEventListener("webglcontextrestored",restored);
      gl.deleteBuffer(buffer);gl.deleteProgram(program);
    };
  },[generation]);
  return <canvas key={generation} ref={canvasRef} className="n7-mira-field" aria-hidden="true"/>;
}
