// N7_NIKI_POCKET_BROWSER_V1 — actual Greek Pocket TTS, local neural inference.
// Voice: public-domain Niki 24kHz reference (Ditto Common Voice CC0).
// Model: myned-ai Greek Pocket TTS, CC BY 4.0; browser port from JustDataPlease (MIT).
// No user text sent to an external speech service; Hugging Face only serves static model weights.
import {openPocket} from "./n7-pocket-core-v1.js";
const MODEL="https://huggingface.co/justdataplz/pocket-tts-web/resolve/6b4b63629eade4a8fe97304421305ebe1d3e0deb/greek";
const ORT_URL="https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.wasm.min.mjs";
const VOICE_URL=new URL("./n7-niki-voice-v1.bin",self.location.href).href;
const VOICE_SHA="32df1aba20ef7bcc0a048e9edfff2d756d8db38913ebfd111ceb662369dab489";
const CACHE="n7-pocket-greek-model-20261119";
let engine=null,loading=null,ready=false,queue=Promise.resolve();
const TE=new TextEncoder();
const bhex=b=>Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("");
async function fetched(url,expected=0,onProgress){
 const cache=typeof caches!=="undefined"?await caches.open(CACHE).catch(()=>null):null;
 let bytes=null;
 const old=await cache?.match(url).catch(()=>null);
 if(old){bytes=new Uint8Array(await old.arrayBuffer());if(expected&&bytes.length!==expected){bytes=null;await cache?.delete(url).catch(()=>{});}}
 if(bytes)return bytes;
 const response=await fetch(url);
 if(!response.ok||!response.body)throw Error("Model asset unavailable ("+response.status+")");
 const reader=response.body.getReader(),parts=[];let len=0;
 for(;;){const {done,value}=await reader.read();if(done)break;if(!value)continue;len+=value.length;if(len>150_000_000)throw Error("Model asset too large");parts.push(value);onProgress?.(len,expected||Number(response.headers.get("content-length"))||0);}
 if(expected&&len!==expected)throw Error("Model asset size mismatch");
 bytes=new Uint8Array(len);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 await cache?.put(url,new Response(bytes,{headers:{"content-type":"application/octet-stream"}})).catch(()=>{});
 return bytes;
}
async function voiceBytes(){
 const b=await fetched(VOICE_URL,4374548,(loaded,total)=>self.postMessage({id:-1,type:"progress",loaded,total}));
 const hash=bhex(await crypto.subtle.digest("SHA-256",b));
 if(hash!==VOICE_SHA)throw Error("Niki voice checksum mismatch");
 return b;
}
async function load(){
 if(engine)return engine;
 if(!loading)loading=(async()=>{
  const ort=await import(ORT_URL);
  ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
  const bundleBytes=await fetched(MODEL+"/bundle.json");
  const meta=JSON.parse(new TextDecoder().decode(bundleBytes));
  if(meta.language!=="greek"||meta.layers!==6||meta.heads!==16||meta.head_dim!==64||meta.capacity!==400)
   throw Error("Niki Greek model incompatible");
  const sizes=new Map(meta.files.map(x=>[x.name,x.bytes]));
  let completed=0;const total=[...sizes.values()].reduce((s,n)=>s+n,0)+4374548;
  const get=async name=>{
   if(name==="bundle.json")return bundleBytes;
   if(name==="voices/niki.bin"){const x=await voiceBytes();completed+=x.length;self.postMessage({id:-1,type:"progress",loaded:completed,total});return x;}
   const bytes=await fetched(MODEL+"/"+name,sizes.get(name)||0,(loaded)=>self.postMessage({id:-1,type:"progress",loaded:completed+loaded,total}));
   completed+=bytes.length;self.postMessage({id:-1,type:"progress",loaded:completed,total});return bytes;
  };
  const pocket=await openPocket(ort,get);
  await pocket.voice("niki");
  engine=pocket;ready=true;self.postMessage({type:"ready"});
  return pocket;
 })().catch(e=>{loading=null;throw e});
 return loading;
}
function wav(samples,rate){
 const length=samples.length,bytes=new ArrayBuffer(44+length*2),v=new DataView(bytes);
 const word=(n,s)=>{for(let i=0;i<s.length;i++)v.setUint8(n+i,s.charCodeAt(i));};
 word(0,"RIFF");v.setUint32(4,36+length*2,true);word(8,"WAVEfmt ");v.setUint32(16,16,true);
 v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);
 v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);
 word(36,"data");v.setUint32(40,length*2,true);
 for(let i=0;i<length;i++)v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,samples[i]))*32767),true);
 return bytes;
}
async function handle({id,text,warm}){
 try{
  const pocket=await load();
  if(warm){await pocket.synth("Γεια σου.","niki");self.postMessage({id,type:"ready"});return;}
  if(typeof text!=="string"||!text.trim()||text.length>600)throw Error("invalid speech text");
  const {samples,sr,frames}=await pocket.synth(text,"niki");
  let peak=0;for(let i=0;i<samples.length;i+=7)peak=Math.max(peak,Math.abs(samples[i]));
  if(samples.length<sr/4||peak<0.001)throw Error("Niki generated silent audio");
  const buffer=wav(samples,sr);
  self.postMessage({id,type:"audio",buffer,sampleRate:sr,frames},[buffer]);
 }catch(e){self.postMessage({id,type:"error",message:"Η φωνή Νίκη δεν ξεκίνησε: "+String(e?.message||e).slice(0,115)});}
}
self.onmessage=({data})=>{queue=queue.catch(()=>{}).then(()=>handle(data));};
