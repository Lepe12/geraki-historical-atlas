'use strict';
// N7_EUROPEANA_API_V1 — key never appears in URLs, logs or user-visible output.
const ENDPOINT='https://api.europeana.eu/record/v2/search.json';
const TIMEOUT_MS=4200,MAX_BYTES=180000;
function clean(value,max=180){return String(value??'').replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function first(value){return Array.isArray(value)?value.find(x=>typeof x==='string'&&x.trim())||'':typeof value==='string'?value:'';}
function parseResults(data){
 if(!data||data.success!==true||!Array.isArray(data.items))return [];
 const out=[],seen=new Set();
 for(const record of data.items.slice(0,8)){
  const id=String(record.id||'');
  if(!/^\/[\w-]+\/[\w.%\-]+$/u.test(id))continue;
  const url='https://www.europeana.eu/en/item'+id;
  if(seen.has(url))continue;
  seen.add(url);
  const title=clean(first(record.title)||first(record.dcTitle)||'Europeana record',180);
  const institution=clean(first(record.dataProvider)||first(record.provider)||'Europeana',90);
  const date=clean(first(record.year)||first(record.dcDate)||'',30);
  const description=clean(first(record.dcDescription)||'',220);
  out.push({title,url,source:'Europeana / '+institution,provider:'Europeana',
   published:'',excerpt:clean([date,description].filter(Boolean).join(' | '),230),
   recordType:'metadata',articleRead:false});
  if(out.length>=5)break;
 }
 return out;
}
async function searchEuropeana(query,{key=process.env.EUROPEANA_API_KEY||'',transport=fetch,timeout=TIMEOUT_MS}={}){
 // Never use Europeana without an explicit key. Not configured != zero results.
 if(!String(key).trim())return {configured:false,queried:false,items:[],reason:'missing_key'};
 const term=clean(query,140);
 if(!term)return {configured:true,queried:false,items:[],reason:'empty_query'};
 const url=new URL(ENDPOINT);
 url.searchParams.set('query',term);
 url.searchParams.set('rows','5');
 url.searchParams.set('profile','minimal');
 const ctl=new AbortController(),stop=setTimeout(()=>ctl.abort(),timeout);
 try{
  const resp=await transport(url.toString(),{method:'GET',redirect:'error',signal:ctl.signal,
   headers:{'X-Api-Key':String(key).trim(),'Accept':'application/json'}});
  if(!resp.ok)return {configured:true,queried:true,items:[],reason:'http_'+resp.status};
  const len=Number(resp.headers?.get?.('content-length')||0);
  if(len>MAX_BYTES)return {configured:true,queried:true,items:[],reason:'too_large'};
  // Stream cap prevents unbounded response despite bogus Content-Length.
  const reader=resp.body?.getReader?.();
  if(!reader)return {configured:true,queried:true,items:[],reason:'no_body'};
  let size=0;const chunks=[];
  try{
   while(true){
    const {done,value}=await reader.read();if(done)break;
    size+=value.byteLength;
    if(size>MAX_BYTES)return {configured:true,queried:true,items:[],reason:'too_large'};
    chunks.push(value);
   }
  }finally{try{await reader.cancel()}catch{}}
  const bytes=new Uint8Array(size);let pos=0;
  for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.length;}
  let data;
  try{data=JSON.parse(new TextDecoder().decode(bytes));}
  catch{return {configured:true,queried:true,items:[],reason:'bad_json'};}
  return {configured:true,queried:true,items:parseResults(data),reason:'ok'};
 }catch(err){return {configured:true,queried:true,items:[],reason:err?.name==='AbortError'?'timeout':'network_error'};}
 finally{clearTimeout(stop);}
}
module.exports={searchEuropeana,parseResults};
