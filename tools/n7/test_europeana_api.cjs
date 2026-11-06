'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {searchEuropeana,parseResults}=require('./europeana-api');
const {researchMessages,contextForResearch}=require('./public-web-search');
test('Europeana requires key; never calls network when unconfigured',async()=>{
 let calls=0;
 const r=await searchEuropeana('Pietro Lanza',{key:'',transport:()=>{calls++;throw Error('no');}});
 assert.equal(calls,0);assert.equal(r.configured,false);assert.equal(r.reason,'missing_key');
});
test('Europeana key is in header, not URL; metadata is never marked as read',async()=>{
 let calls=0;
 const transport=async(url,options)=>{
  calls++;
  assert.equal(new URL(url).hostname,'api.europeana.eu');
  assert.equal(new URL(url).pathname,'/record/v2/search.json');
  assert.equal(new URL(url).searchParams.get('query'),'Pietro Lanza');
  assert.equal(new URL(url).searchParams.has('wskey'),false);
  assert.equal(options.headers['X-Api-Key'],'test-key-123');
  return new Response(JSON.stringify({success:true,items:[{
   id:'/9200123/Biblioteca_001',title:['Lanza correspondence'],dataProvider:['Archive'],
   dcDescription:['A historical document']
  }]}),{status:200,headers:{'content-type':'application/json'}});
 };
 const r=await searchEuropeana('Pietro Lanza',{key:'test-key-123',transport});
 assert.equal(calls,1);assert.equal(r.reason,'ok');
 assert.equal(r.items.length,1);assert.equal(r.items[0].articleRead,false);
 assert.equal(r.items[0].url,'https://www.europeana.eu/en/item/9200123/Biblioteca_001');
 assert.equal(r.items[0].recordType,'metadata');
});
test('Europeana rejects invalid record ids and reports unauthorized key clearly',async()=>{
 assert.equal(parseResults({success:true,items:[{id:'https://example.com/x',title:['Fake']},{id:'/a/b',title:['Valid']}]}).length,1);
 const r=await searchEuropeana('Lanza',{key:'bad',transport:async()=>new Response('Unauthorized',{status:401})});
 assert.equal(r.reason,'http_401');assert.deepEqual(r.items,[]);
});
test('Europeana enabled search keeps prior curated Lanza article and does not claim reading metadata',async()=>{
 const old=process.env.EUROPEANA_API_KEY;
 process.env.EUROPEANA_API_KEY='test-key-123';
 try{
  const transport=async(url,opts)=>{
   if(new URL(url).hostname==='api.europeana.eu')
    return new Response(JSON.stringify({success:true,items:[{id:'/9200123/Biblioteca_001',title:['Lanza manuscript']}]}),{status:200});
   if(new URL(url).hostname==='en.wikipedia.org')
    return new Response(JSON.stringify({pages:[]}),{status:200});
   return new Response('<rss><channel></channel></rss>',{status:200});
  };
  const r=await researchMessages([{role:'user',content:'Τι ξέρεις για τον Πέτρο Λάντζα;'}],{transport});
  assert.equal(r.europeana.configured,true);assert.equal(r.europeana.found,1);
  assert.equal(r.items[0].url,'https://www.piratecartography.com/archives/114');
  assert.ok(r.items.some(x=>x.provider==='Europeana'));
  const c=contextForResearch(r);
  assert.match(c,/Europeana Search API/);
  assert.match(c,/ONLY SEARCH METADATA/);
  assert.ok(!c.includes('test-key-123'));
 }finally{
  if(old===undefined)delete process.env.EUROPEANA_API_KEY;
  else process.env.EUROPEANA_API_KEY=old;
 }
});
