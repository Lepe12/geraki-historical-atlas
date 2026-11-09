'use strict';
const fs=require('node:fs'),path=require('node:path');
function readReleaseInfo(directory){
 try{
  const file=path.join(directory,'release-manifest.json');
  if(fs.statSync(file).size>100000)return null;
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  if(data.schema!=='n7-runtime-build/v1'||!(/^[a-f0-9]{64}$/).test(data.release_id||''))return null;
  return {id:data.release_id,canonical_commit:(/^[a-f0-9]{40}$/).test(data.canonical_commit||'')?data.canonical_commit:null};
 }catch{return null;}
}
module.exports={readReleaseInfo};
