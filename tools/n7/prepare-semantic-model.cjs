#!/usr/bin/env node
'use strict';
// N7_HYBRID_SEARCH_V1: fetch the pinned public model + browser runtime and verify every SHA-256.
// Not part of `npm start`; used by the indexing/deploy workflow and for local end-to-end tests.
// Usage: node tools/n7/prepare-semantic-model.cjs OUT_DIR   (e.g. .n7-runtime/public/n7-model)
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const spec=require('./semantic-model.json');
const out=path.resolve(process.argv[2]||'');
if(!process.argv[2])throw Error('usage: prepare-semantic-model.cjs OUT_DIR');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function main(){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'n7-model-'));
 execFileSync('npm',['pack',spec.runtime_package,'--silent','--pack-destination',tmp],{stdio:['ignore','pipe','inherit']});
 const tgz=fs.readdirSync(tmp).find(f=>f.endsWith('.tgz'));
 execFileSync('tar',['-xzf',path.join(tmp,tgz),'-C',tmp]);
 for(const [rel,f] of Object.entries(spec.files)){
  const target=path.join(out,rel);
  if(fs.existsSync(target)&&sha(fs.readFileSync(target))===f.sha256)continue;
  let data;
  if(f.from.startsWith('npm:'))data=fs.readFileSync(path.join(tmp,'package',f.from.slice(4)));
  else{const r=await fetch(`https://huggingface.co/${spec.model}/resolve/${spec.revision}/${f.from.slice(3)}`,{redirect:'follow'});
   if(!r.ok)throw Error('MODEL_DOWNLOAD_HTTP_'+r.status+' '+rel);data=Buffer.from(await r.arrayBuffer());}
  if(data.length!==f.size||sha(data)!==f.sha256)throw Error('MODEL_FILE_HASH_MISMATCH '+rel);
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target+'.part',data);fs.renameSync(target+'.part',target);
 }
 fs.rmSync(tmp,{recursive:true,force:true});
 console.log('N7_SEMANTIC_MODEL_READY files='+Object.keys(spec.files).length+' dir='+out);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
