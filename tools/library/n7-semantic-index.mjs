// N7_HYBRID_SEARCH_V1 offline index builder. Runs OUTSIDE the shared host (GitHub Actions or a
// workstation). Input: pages JSONL ({source_id,scan_index,text}) exactly as stored in the library,
// and a vocabulary JSON ({folded_key: [surface_form, weight]}). Output: read-only files for
// tools/library/n7-semantic/ used by n7_library.php. No page text is written to the output.
// Usage: node n7-semantic-index.mjs PAGES.jsonl VOCAB.json OUT_DIR
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {pipeline,env} from '@huggingface/transformers';

export const MODEL='Xenova/multilingual-e5-small',DTYPE='q8',DIMS=384,SCALE=508,KEY_WIDTH=48;
export const fold=s=>String(s).normalize('NFD').replace(/\p{Mn}+/gu,'').toLowerCase().replace(/ς/g,'σ');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');

/** Passages of ~700 code points with 120 overlap, cut at spaces; offsets are code-point indices. */
export function chunk(text,size=700,overlap=120){
 const cp=Array.from(text),out=[];let s=0;
 while(s<cp.length){
  let e=Math.min(cp.length,s+size);
  if(e<cp.length){let sp=e;while(sp>s+400&&cp[sp]!==' ')sp--;if(sp>s+400)e=sp;}
  let a=s,b=e;while(a<b&&/\s/.test(cp[a]))a++;while(b>a&&/\s/.test(cp[b-1]))b--;
  if(b-a>=60)out.push([a,b,cp.slice(a,b).join('')]);
  if(e>=cp.length)break;
  let n=Math.max(e-overlap,s+1);while(n<e&&cp[n]!==' ')n++;s=n+1>=e?e:n+1;
 }
 return out;
}
const q8=(v,o,buf,at)=>{for(let k=0;k<DIMS;k++)buf.writeInt8(Math.max(-127,Math.min(127,Math.round(v[o+k]*SCALE))),at+k);};

async function main([pagesFile,vocabFile,outDir]){
 if(!pagesFile||!vocabFile||!outDir)throw Error('usage: PAGES.jsonl VOCAB.json OUT_DIR');
 if(process.env.N7_MODEL_CACHE)env.cacheDir=process.env.N7_MODEL_CACHE;
 const ext=await pipeline('feature-extraction',MODEL,{dtype:DTYPE});
 const pages=fs.readFileSync(pagesFile,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l));
 const meta=[],texts=[];
 for(const p of pages){
  if(!/^[a-f0-9]{64}$/.test(p.source_id)||!Number.isSafeInteger(p.scan_index)||typeof p.text!=='string')throw Error('invalid page record');
  const hash=sha(Buffer.from(p.text,'utf8'));
  for(const [a,b,t] of chunk(p.text)){meta.push([p.source_id,p.scan_index,a,b,hash]);texts.push(t);}
 }
 const chunks=Buffer.alloc(meta.length*DIMS);
 for(let i=0;i<texts.length;i+=32){const o=await ext(texts.slice(i,i+32).map(t=>'passage: '+t),{pooling:'mean',normalize:true});
  for(let j=0;j<Math.min(32,texts.length-i);j++)q8(o.data,j*DIMS,chunks,(i+j)*DIMS);}
 const vocab=Object.entries(JSON.parse(fs.readFileSync(vocabFile,'utf8')))
  .map(([k,v])=>[fold(k),v[0],v[1]]).filter(([k])=>Buffer.byteLength(k)<=KEY_WIDTH&&/^\p{L}{2,}$/u.test(k))
  .sort((a,b)=>Buffer.compare(Buffer.from(a[0]),Buffer.from(b[0])));
 const dedup=vocab.filter((x,i)=>i===0||x[0]!==vocab[i-1][0]);
 const keys=Buffer.alloc(dedup.length*KEY_WIDTH),words=Buffer.alloc(dedup.length*DIMS),weights=Buffer.alloc(dedup.length);
 dedup.forEach(([k,,w],i)=>{Buffer.from(k).copy(keys,i*KEY_WIDTH);weights[i]=Math.max(1,Math.min(255,Math.round(w*20)));});
 for(let i=0;i<dedup.length;i+=256){const b=dedup.slice(i,i+256);const o=await ext(b.map(x=>'query: '+x[1]),{pooling:'mean',normalize:true});
  for(let j=0;j<b.length;j++)q8(o.data,j*DIMS,words,(i+j)*DIMS);}
 fs.mkdirSync(outDir,{recursive:true});
 const files={'chunks.i8':chunks,'chunks.meta.json':Buffer.from(JSON.stringify(meta)),'words.keys':keys,'words.i8':words,'words.w':weights};
 for(const [n,b] of Object.entries(files))fs.writeFileSync(path.join(outDir,n),b);
 const manifest={schema:'n7-semantic-index-v1',model:MODEL+' '+DTYPE,dims:DIMS,scale:SCALE,chunks:meta.length,words:dedup.length,
  pages:pages.length,sources:new Set(pages.map(p=>p.source_id)).size,built_at:new Date().toISOString(),
  files:Object.fromEntries(Object.entries(files).map(([n,b])=>[n,sha(b)]))};
 fs.writeFileSync(path.join(outDir,'manifest.json'),JSON.stringify(manifest,null,1)+'\n');
 console.log(JSON.stringify({status:'N7_SEMANTIC_INDEX_BUILT',chunks:meta.length,words:dedup.length,pages:pages.length,sources:manifest.sources}));
}
if(import.meta.url===`file://${process.argv[1]}`)main(process.argv.slice(2)).catch(e=>{console.error('N7_SEMANTIC_INDEX_FAILED',e.message);process.exit(1);});
