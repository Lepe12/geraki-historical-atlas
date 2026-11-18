'use strict';
// Planner-authorized public discovery. Never silently promote search hits to historical evidence.
const fs=require('node:fs');
const {researchMessages}=require('../n7/public-web-search.js');
(async()=>{
 const input=JSON.parse(fs.readFileSync(0,'utf8'));
 if(!input||typeof input.question!=='string'||input.question.length>900)throw Error('INVALID_PUBLIC_QUERY');
 const queries=input.variants||[input.question];
 if(!Array.isArray(queries)||queries.length<1||queries.length>3||
    queries.some(q=>typeof q!=='string'||q.length>240||
      !q.startsWith('Ψάξε στο Internet ιστορικές πηγές')))throw Error('INVALID_PLANNED_VARIANTS');
 const runs=await Promise.allSettled(queries.map(query=>researchMessages([{role:'user',content:query}])));
 let searched=false,failedProviders=0;
 const seen=new Set(),records=[];
 for(const attempt of runs){
   if(attempt.status!=='fulfilled'){failedProviders++;continue;}
   const result=attempt.value;searched=searched||Boolean(result.searched);
   failedProviders+=result.failedProviders||0;
   for(const item of result.items||[]){
     if(typeof item.url!=='string'||!item.url.startsWith('https://')||seen.has(item.url))continue;
     seen.add(item.url);
     records.push({title:String(item.title||'').slice(0,250),url:item.url,
       provider:String(item.provider||'').slice(0,100),evidence_level:'DISCOVERY_ONLY',
       verification_status:'UNVERIFIED_DISCOVERY',record_type:String(item.recordType||'web_hit').slice(0,70)});
   }
 }
 // Put direct scholarly full text ahead of metadata and publisher landing pages.
 records.sort((a,b)=>{
   const score=x=>(/\.pdf(?:[?#]|$)/i.test(x.url)?10:0)+
     (/(?:^|\.)helios\.eie\.gr|(?:^|\.)ekt\.gr|(?:^|\.)openarchives\.gr/i.test(new URL(x.url).hostname)?4:0);
   return score(b)-score(a);
 });
 const selected=records.slice(0,16);
 process.stdout.write(JSON.stringify({status:searched?'EXECUTED':'NOT_SEARCHED',
   connector_id:'planner:public_web',records:selected,source_count:selected.length,
   queries_executed:queries.length,failed_providers:failedProviders})+'\n');
})().catch(e=>{process.stderr.write('N7_PUBLIC_RESEARCH_ERROR '+String(e.message).slice(0,120)+'\n');process.exitCode=1;});
