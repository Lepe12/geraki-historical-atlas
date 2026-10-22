// Pinned copy of gpu-field.js from 2167ebef (2026-10-16), the renderer workspace-preview.html was built and
// tested against. The chamber now uses the nautical renderer (Nautical Core Lock); the preview keeps
// its own copy so the lock files stay untouched. Do not edit; replace only together with the preview.
"use strict";
/* Native WebGL2 GPU atmospheric layer; independent from previous V5. */
(()=>{const base=document.getElementById("universe");if(!base)return;
const cvs=document.createElement("canvas");cvs.id="gpuField";cvs.setAttribute("aria-hidden","true");
cvs.style.cssText="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;mix-blend-mode:screen;opacity:.88";
base.insertAdjacentElement("afterend",cvs);
const gl=cvs.getContext("webgl2",{alpha:true,premultipliedAlpha:false,powerPreference:"high-performance"});
if(!gl){cvs.remove();return;}
const v=`#version 300 es
precision highp float;in vec2 a;out vec2 uv;
void main(){uv=a*.5+.5;gl_Position=vec4(a,0.,1.);}`;
const f=`#version 300 es
precision highp float;in vec2 uv;out vec4 color;uniform vec2 res;uniform float time;uniform vec2 mouse;
float hash(vec2 v){return fract(sin(dot(v,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(.8,-.6,.6,.8);for(int i=0;i<5;i++){v+=a*noise(p);p=m*p*2.03+3.;a*=.5;}return v;}
void main(){vec2 p=(uv-.5)*vec2(res.x/res.y,1.);float r=length(p),ang=atan(p.y,p.x),t=time*.045;
float n=fbm(p*3.+mouse*.12+vec2(t,-t*.28));float spiral=sin(ang*5.+r*16.+n*5.-t);
float cloud=max(0.,n-.35)*exp(-r*r*5.)*(.5+.5*spiral);
float filament=exp(-abs(sin(ang*7.+r*20.+n*6.-t))*18.)*exp(-r*5.);
vec3 c=vec3(.015,.13,.20)*cloud*1.4+vec3(.06,.32,.38)*filament*.055;
c+=vec3(.05,.13,.20)*max(0.,fbm(p*4.2+vec2(t*.2,-t))-.6)*.18;
c*=1.-smoothstep(.5,1.15,r);color=vec4(c,clamp(dot(c,vec3(1.))*2.4,0.,.7));}`;
const sv=`#version 300 es
precision highp float;layout(location=0) in vec4 point;uniform vec2 res;uniform vec2 mouse;out float light;
void main(){vec2 p=point.xy+mouse*point.z*.018;p.x*=res.y/res.x;gl_Position=vec4(p,0.,1.);gl_PointSize=point.w*min(res.y/780.,1.5);light=.3+.7*point.z;}`;
const sf=`#version 300 es
precision highp float;in float light;out vec4 color;
void main(){float d=length(gl_PointCoord-.5);float a=exp(-d*d*80.);color=vec4(.57,.82,1.,a*light*.6);}`;
function shader(type,src){let s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}
function make(vs,fs){let p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,vs));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p}
let a,b;try{a=make(v,f);b=make(sv,sf)}catch(err){console.error("JARVIS GPU shader error",err);cvs.remove();return}
const square=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,square);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
let seed=4271;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
const count=1600,points=new Float32Array(count*4);for(let i=0;i<count;i++){points[4*i]=(rand()-.5)*2.8;points[4*i+1]=(rand()-.5)*2.2;points[4*i+2]=rand();points[4*i+3]=1+rand()*3.5}
const stars=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,stars);gl.bufferData(gl.ARRAY_BUFFER,points,gl.STATIC_DRAW);
let m=[0,0],sm=[0,0],reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
base.addEventListener("pointermove",e=>{m=[(e.clientX/innerWidth-.5)*2,(e.clientY/innerHeight-.5)*2]});
const ar=gl.getUniformLocation(a,"res"),at=gl.getUniformLocation(a,"time"),am=gl.getUniformLocation(a,"mouse");
const br=gl.getUniformLocation(b,"res"),bm=gl.getUniformLocation(b,"mouse");
function render(ts){if(!cvs.isConnected)return;const d=Math.min(devicePixelRatio||1,1.5),w=Math.max(1,Math.round(cvs.clientWidth*d)),h=Math.max(1,Math.round(cvs.clientHeight*d));
if(cvs.width!==w||cvs.height!==h){cvs.width=w;cvs.height=h;gl.viewport(0,0,w,h)}
sm[0]+=(m[0]-sm[0])*.028;sm[1]+=(m[1]-sm[1])*.028;
gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
gl.useProgram(a);gl.bindBuffer(gl.ARRAY_BUFFER,square);let loc=gl.getAttribLocation(a,"a");gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);gl.uniform2f(ar,w,h);gl.uniform1f(at,reduced?0:ts*.001);gl.uniform2f(am,...sm);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
gl.useProgram(b);gl.bindBuffer(gl.ARRAY_BUFFER,stars);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,4,gl.FLOAT,false,0,0);gl.uniform2f(br,w,h);gl.uniform2f(bm,...sm);gl.drawArrays(gl.POINTS,0,count);gl.disable(gl.BLEND);requestAnimationFrame(render)}
requestAnimationFrame(render);
})();