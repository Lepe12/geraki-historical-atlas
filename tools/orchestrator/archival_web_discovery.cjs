'use strict';
// Planner-authorized public research discovery; no credentials or owner corpus.
// Emit only public source metadata. A search hit is NOT historical verification.
const fs=require('node:fs');
const {researchMessages}=require('../n7/public-web-search.js');
(async()=>{
 const input=JSON.parse(fs.readFileSync(0,'utf8'));
 if(!input||typeof input.question!=='string'||input.question.length>900)throw Error('INVALID_PUBLIC_QUERY');
 const result=await researchMessages([{role:'user',content:input.question}]);
 const records=(result.items||[]).filter(x=>typeof x.url==='string'&&x.url.startsWith('https://'))
   .slice(0,8).map(x=>({title:String(x.title||'').slice(0,250),url:x.url,
     provider:String(x.provider||'').slice(0,100),evidence_level:'DISCOVERY_ONLY',
     verification_status:'UNVERIFIED_DISCOVERY',record_type:String(x.recordType||'web_hit').slice(0,70)}));
 process.stdout.write(JSON.stringify({status:result.searched?'EXECUTED':'NOT_SEARCHED',
   connector_id:'planner:public_web',records,source_count:records.length,
   failed_providers:result.failedProviders||0})+'\n');
})().catch(e=>{process.stderr.write('N7_PUBLIC_RESEARCH_ERROR '+String(e.message).slice(0,120)+'\n');process.exitCode=1;});
