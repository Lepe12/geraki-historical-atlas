'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {classify,parseRss,researchMessages,contextForResearch,sourceFooter,boundedFetch,safeLink}=require('./public-web-search');
const when=new Date('2026-11-05T19:00:00Z');
const xml='<rss><channel>'+
'<item><title>US 2026 midterm election results - News Agency</title>'+
'<link>https://example.org/elections/2026</link>'+
'<pubDate>Thu, 05 Nov 2026 08:00:00 GMT</pubDate>'+
'<source>Independent News Agency</source></item>'+
'<item><title><![CDATA[Second election report &amp; reactions]]></title>'+
'<link>https://example.org/reactions</link>'+
'<pubDate>Wed, 04 Nov 2026 09:00:00 GMT</pubDate>'+
'</item>'+
'<item><title>Outdated election headline</title><link>https://example.org/old</link>'+
'<pubDate>Fri, 01 Nov 2024 09:00:00 GMT</pubDate></item>'+
'<item><title>Unsafe link</title><link>http://127.0.0.1/admin</link>'+
'<pubDate>Wed, 04 Nov 2026 09:00:00 GMT</pubDate></item>'+
'</channel></rss>';
test('search triggered on 2026 election follow-up using conversational context',()=>{
 const s=classify([
   {role:'user',content:'Πες μου τη γνώμη σου για τις αμερικανικές εκλογές'},
   {role:'assistant',content:'Εννοείς το 2024;'},
   {role:'user',content:'Εννοώ τις χθεσινές, τις ενδιάμεσες'}
 ],when);
 assert.equal(s.kind,'news');
 assert.match(s.query,/2026 US midterm election results/);
});
test('explicit online research triggers web results; explicit do-not-search wins',()=>{
 assert.equal(classify([{role:'user',content:'Ψάξε το αρχείο του Πέτρου Λάντζα'}],when).kind,'general');
 assert.equal(classify([{role:'user',content:'Μην ψάξεις στο διαδίκτυο, γράψε μου ένα ποίημα.'}],when),null);
 assert.equal(classify([{role:'user',content:'Γράψε μου ένα ποίημα'}],when),null);
});
test('RSS parser limits items, validates publication date and rejects unsafe URL',()=>{
 const items=parseRss(xml,'Mock',when.getTime());
 assert.equal(items.length,2);
 assert.equal(items[0].published,'2026-11-05');
 assert.match(items[1].title,/Second election report & reactions/);
 assert.equal(safeLink('http://127.0.0.1/admin'),'');
});
test('read-only research fetches public indexed sources and exposes their links',async()=>{
 const calls=[];
 const transport=async(url,opts)=>{
   calls.push({url,opts});
   assert.equal(opts.method,'GET');
   assert.equal(opts.redirect,'error');
   return new Response(xml,{status:200,headers:{'Content-Type':'application/rss+xml'}});
 };
 const out=await researchMessages([{role:'user',content:'Πες μου για τις εκλογές ΗΠΑ του 2026'}],{now:when,transport});
 assert.equal(out.searched,true);
 assert.ok(out.items.length>=2);
 assert.ok(calls.length>=3);
 assert.ok(calls.every(c=>c.url.startsWith('https://')));
 assert.match(contextForResearch(out),/untrusted headlines/);
 assert.match(sourceFooter(out),/https:\/\/example.org\/elections/);
});
test('transport failure yields honest unverified research, never forged sources',async()=>{
 const result=await researchMessages([{role:'user',content:'Τα νέα για τις ΗΠΑ σήμερα'}],
   {now:when,transport:async()=>{throw Error('network blocked')}});
 assert.equal(result.searched,true);
 assert.equal(result.items.length,0);
 assert.match(contextForResearch(result),/No verifiable public results/);
 assert.equal(sourceFooter(result),'');
});
test('rejects redirects, unexpected destinations and oversized untrusted body',async()=>{
 await assert.rejects(boundedFetch('https://localhost/admin'),/Forbidden/);
 await assert.rejects(boundedFetch('https://example.net/private'),/Forbidden/);
 const transport=async()=>new Response('x'.repeat(350001),{status:200});
 await assert.rejects(boundedFetch('https://www.bing.com/search?q=x',{transport}),/limit/);
});
