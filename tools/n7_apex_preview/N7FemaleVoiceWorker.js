/* Same-origin, single-thread Greek Piper inference. */
const ASSETS='/n7-apex-voice/rapunzelina-v1/';
importScripts(ASSETS+'ort.wasm.min.js',ASSETS+'piper_phonemize.js');
let ready,session,config,phonemeData,phonemeWasm;
const base=new URL(ASSETS,self.location.origin).href;
async function bytes(name,id){
 let cache;try{cache=await caches.open('n7-greek-female-v1');const old=await cache.match(base+name);if(old)return old.arrayBuffer();}catch{}
 const response=await fetch(base+name);if(!response.ok)throw Error('asset '+name+' '+response.status);
 const total=Number(response.headers.get('content-length'))||0,parts=[];let loaded=0,lastProgress=0;
 const reader=response.body.getReader();for(;;){const row=await reader.read();if(row.done)break;parts.push(row.value);loaded+=row.value.length;if(Date.now()-lastProgress>200||loaded===total){lastProgress=Date.now();self.postMessage({id,type:'progress',asset:name,loaded,total});}}
 const data=new Uint8Array(loaded);let offset=0;for(const part of parts){data.set(part,offset);offset+=part.length;}
 try{await cache?.put(base+name,new Response(data,{headers:{'Content-Type':'application/octet-stream'}}));}catch{}
 return data.buffer;
}
function init(id){if(!ready)ready=(async()=>{config=await(await fetch(base+'config.json')).json();ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.wasmPaths=base;[phonemeData,phonemeWasm]=await Promise.all([bytes('piper_phonemize.data',id),bytes('piper_phonemize.wasm',id)]);const model=await bytes('model.onnx',id);session=await ort.InferenceSession.create(model,{executionProviders:['wasm']});})();return ready;}
function wav(pcm,rate){const buffer=new ArrayBuffer(44+pcm.length*2),v=new DataView(buffer);const text=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};text(0,'RIFF');v.setUint32(4,36+pcm.length*2,true);text(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,pcm.length*2,true);for(let i=0;i<pcm.length;i++)v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,pcm[i]))*32767),true);return buffer;}
// N7_GREEK_PHONEME_FIT_V1: the phonemizer writes the Greek palatal chi (chi before i/e: "βροχής", "χιλιόμετρα")
// as "c" plus a combining cedilla (U+0327), and numbers it 140. The model has 130 symbols (0-129) and holds
// the composed "ç" as one symbol, so the unchanged ids make every such sentence fail in the model. When an id
// is out of range the sequence is rebuilt from the phonemes, composed (NFC) and mapped with the model's own
// phoneme_id_map in the same layout the phonemizer uses: ^, pad, (phoneme, pad)..., $. Other sentences
// keep the phonemizer's ids untouched.
function fit(result){
 const ids=result.phoneme_ids,limit=config.num_symbols||Object.keys(config.phoneme_id_map).length;
 if(Array.isArray(ids)&&ids.every(id=>Number.isInteger(id)&&id>=0&&id<limit))return ids;
 if(!Array.isArray(result.phonemes))throw Error('phonemes');
 const map=config.phoneme_id_map,pad=map._[0],out=[map['^'][0],pad];
 for(const symbol of Array.from(result.phonemes.join('').normalize('NFC'))){
  const entry=map[symbol];
  if(entry)out.push(entry[0],pad);
 }
 out.push(map.$[0]);
 return out;
}
// A fresh phonemizer per sentence, exactly as before (its main() runs once).
function phonemize(text){return new Promise(async(resolve,reject)=>{try{const module=await createPiperPhonemize({wasmBinary:new Uint8Array(phonemeWasm),getPreloadedPackage:()=>phonemeData,print:s=>{try{resolve(fit(JSON.parse(s)));}catch(e){reject(e);}},printErr:s=>reject(Error(s)),locateFile:n=>base+n});module.callMain(['-l',config.espeak.voice,'--input',JSON.stringify([{text}]),'--espeak_data','/espeak-ng-data']);}catch(e){reject(e);}});}
self.onmessage=async({data:{id,text,warm}})=>{if(warm){try{await init(id);await synth('Γεια.');self.postMessage({id,type:'ready'});}catch(e){self.postMessage({id,type:'warm-failed'});}return;}try{if(typeof text!=='string'||!text.trim()||text.length>600)throw Error('text');await init(id);const {buffer,pcm}=await synth(text);self.postMessage({id,type:'audio',buffer,sampleRate:config.audio.sample_rate,frames:pcm.length,inputs:session.inputNames},[buffer]);}catch(e){self.postMessage({id,type:'error',message:'Δεν δημιουργήθηκε η ελληνική φωνή. Δοκίμασε ξανά ή επίλεξε φωνή συσκευής.'});}};
async function synth(text){const ids=await phonemize(text);const feeds={input:new ort.Tensor('int64',ids.map(BigInt),[1,ids.length]),input_lengths:new ort.Tensor('int64',[BigInt(ids.length)],[1]),scales:new ort.Tensor('float32',[config.inference.noise_scale,config.inference.length_scale,config.inference.noise_w])};if(session.inputNames.includes('sid'))feeds.sid=new ort.Tensor('int64',[0n],[1]);const result=await session.run(feeds),pcm=result[session.outputNames[0]].data,buffer=wav(pcm,config.audio.sample_rate);return {buffer,pcm};}
