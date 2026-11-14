// Only the outgoing speech is sampled. No microphone or React frame updates.
let analyser:AnalyserNode|null=null;
let samples=new Float32Array(1024),level=0,last=0;
export function attachVoiceSignal(node:AnalyserNode){analyser=node;samples=new Float32Array(node.fftSize);level=0;last=0;}
export function detachVoiceSignal(node:AnalyserNode){if(analyser===node){analyser=null;level=0;last=0;}}
export function readVoiceSignal(now:number){
  if(!analyser)return -1;
  analyser.getFloatTimeDomainData(samples);let energy=0;
  for(const value of samples)energy+=value*value;
  const rms=Math.sqrt(energy/samples.length);
  const target=Math.min(1,Math.max(0,(rms-.003)*9));
  const dt=last?Math.max(0,now-last):16;last=now;
  level+=(target-level)*(1-Math.exp(-dt/(target>level?35:85)));
  if(target===0&&level<.002)level=0;
  return level;
}
