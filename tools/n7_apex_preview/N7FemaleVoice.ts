import {attachVoiceSignal,detachVoiceSignal} from "./N7VoiceSignal";
import {N7_HUMANOID_REFERENCE} from "./N7HumanoidReference";
export const FEMALE_VOICE_ID="n7:el-female";
type Callbacks={start:()=>void;end:()=>void;error:(message:string)=>void;progress:(message:string)=>void};
export function createFemaleVoice(){
 let analyser:AnalyserNode|null=null;
 let playbackTimer:ReturnType<typeof setTimeout>|null=null;
 let ready=false,warming=false;
 let worker:Worker|null=null,context:AudioContext|null=null,source:AudioBufferSourceNode|null=null,sequence=0,job:{id:number;callbacks:Callbacks;timer:ReturnType<typeof setTimeout>}|null=null;
 const unlock=()=>{if(!context)context=new AudioContext();return context.resume();};
 const clearSignal=()=>{if(analyser){detachVoiceSignal(analyser);analyser.disconnect();analyser=null;}};
 const cancel=()=>{sequence++;clearSignal();if(playbackTimer)clearTimeout(playbackTimer);playbackTimer=null;if(job){clearTimeout(job.timer);job=null;worker?.terminate();worker=null;ready=false;warming=false;}if(source){source.onended=null;try{source.stop();}catch{}source.disconnect();source=null;}};
 const play=(text:string,callbacks:Callbacks)=>{
  cancel();const id=++sequence;
  const fail=(message:string)=>{if(id!==sequence)return;cancel();callbacks.error(message);};
  job={id,callbacks,timer:setTimeout(()=>fail("Η φόρτωση της ελληνικής φωνής καθυστέρησε. Δοκίμασε ξανά ή επίλεξε φωνή συσκευής."),180000)};
  try{
   if(!context)context=new AudioContext();
   ensureWorker();
   callbacks.progress(ready?"Το N7 ετοιμάζει τη φωνή…":"Προετοιμασία ελληνικής γυναικείας φωνής…");worker!.postMessage({id,text});
  }catch{fail("Η ελληνική φωνή δεν υποστηρίζεται εδώ. Μπορείς να επιλέξεις φωνή συσκευής.");}
 };
 function ensureWorker(){
   if(!worker){const parent=N7_HUMANOID_REFERENCE.slice(0,N7_HUMANOID_REFERENCE.lastIndexOf('/')+1);worker=new Worker(parent+'n7-female-voice-worker-v2.js');
    worker.onerror=()=>{if(job){const c=job.callbacks;cancel();c.error("Η ελληνική φωνή δεν φορτώθηκε. Δοκίμασε ξανά ή επίλεξε φωνή συσκευής.");}};
    worker.onmessage=async({data})=>{
     if(data.type==='ready'){ready=true;return;}
     const current=job;if(!current||data.id!==current.id)return;
     if(data.type==='progress'){const percent=data.total?Math.round(data.loaded/data.total*100):0;current.callbacks.progress(`Φόρτωση ελληνικής γυναικείας φωνής${percent?` · ${percent}%`:''}. Η πρώτη λήψη είναι περίπου 90 MB.`);return;}
     if(data.type==='error'){clearTimeout(current.timer);const c=current.callbacks;cancel();c.error(String(data.message));return;}
     if(data.type!=='audio')return;
     try{
      const audio=await context!.decodeAudioData(data.buffer);
      if(!job||job.id!==data.id||data.id!==sequence)return;
      await context!.resume();if(!job||job.id!==data.id||data.id!==sequence)return;
      if(context!.state!=='running')throw Error('audio_locked');
      clearTimeout(job.timer);job=null;
      const node=context!.createBufferSource();source=node;node.buffer=audio;const meter=context!.createAnalyser();meter.fftSize=1024;analyser=meter;node.connect(meter);meter.connect(context!.destination);attachVoiceSignal(meter);
      node.onended=()=>{if(data.id!==sequence)return;if(playbackTimer)clearTimeout(playbackTimer);playbackTimer=null;source=null;node.disconnect();clearSignal();current.callbacks.end();};
      node.start();playbackTimer=setTimeout(()=>{if(data.id===sequence){cancel();current.callbacks.error("Ο ήχος διακόπηκε. Μπορείς να ξεκινήσεις ξανά τη συζήτηση.");}},audio.duration*1000+10000);current.callbacks.start();
     }catch{if(data.id===sequence){cancel();current.callbacks.error("Ο ήχος δεν ξεκίνησε. Πάτησε Δοκιμή φωνής για να επιτρέψεις τον ήχο.");}}
    };
   }
 }
 // Background preparation: download (or read from Cache Storage), load the
 // model and run one tiny synthesis, so the first reply starts quickly. It is
 // not a job: cancel() never terminates the worker because of it.
 const warm=()=>{if(warming||ready)return;warming=true;try{ensureWorker();worker!.postMessage({id:-1,warm:true});}catch{warming=false;}};
 const dispose=()=>{cancel();worker?.terminate();worker=null;ready=false;warming=false;void context?.close();context=null;};
 return {unlock,play,cancel,dispose,warm,isReady:()=>ready};
}
