'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {classify,parseRss,googleWebParse,duckDuckGoParse,googleBooksParse,crossrefParse,researchMessages,contextForResearch,sourceFooter,boundedFetch,safeLink,enrichPublisherArticles}=require('./public-web-search');
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
 assert.equal(classify([{role:'user',content:'Ψάξε το αρχείο του Πέτρου Λάντζα'}],when).kind,'historical');
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
 assert.ok(calls.length>=1);
 assert.ok(calls.every(c=>!c.url.toLowerCase().includes('bing.com')));
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
 await assert.rejects(boundedFetch('https://news.google.com/rss?q=x',{transport}),/limit/);
});

test('Google Books parser provides bibliographic metadata without claiming full text',()=>{
 const books=JSON.stringify({items:[{volumeInfo:{title:'Hugues Creveliers and Crete',authors:['Historian A'],infoLink:'https://books.google.com/books?id=123',description:'History of Ierapetra',publishedDate:'2018'}}]});
 const items=googleBooksParse(books);
 assert.equal(items.length,1);
 assert.equal(items[0].recordType,'bibliography');
 assert.match(items[0].title,/Creveliers/);
 assert.equal(googleBooksParse('{}').length,0);
 assert.equal(googleBooksParse(JSON.stringify({items:[{volumeInfo:{title:'Trick',infoLink:'https://evil.example/tracker'}}]})).length,0);
});
test('historical Creveliers variant query searches Google Books instead of Bing',async()=>{
 const unrelated=JSON.stringify({items:[{volumeInfo:{title:'Microsoft Planner',infoLink:'https://books.google.com/books?id=111'}}]});
 const relevant=JSON.stringify({items:[{volumeInfo:{title:'Hugues Creveliers raid on Crete',infoLink:'https://books.google.com/books?id=222',description:'Ierapetra 1675'}}]});
 const calls=[];
 const transport=async url=>{
  calls.push(url);
  if(url.includes('/w/rest.php/'))return new Response(JSON.stringify({pages:[]}),{status:200});
  if(url.includes('Hugues%20Creveliers%20Ierapetra'))return new Response(relevant,{status:200});
  return new Response(unrelated,{status:200});
 };
 const result=await researchMessages([{role:'user',content:'Ψάξε στο Internet ιστορικές πηγές για Hugo de Creveuil Crevellie επιδρομή Ιεράπετρα Ierapetra 1675.'}],
   {now:new Date('2026-11-18T12:00:00Z'),transport});
 assert.equal(result.queryRetried,true);
 assert.equal(result.items.length,1);
 assert.match(result.items[0].title,/Creveliers/);
 assert.ok(calls.some(x=>x.includes('Hugues%20Creveliers')));
 assert.ok(calls.every(x=>!x.includes('bing.com')));
});
test('Google-only historical search gives zero evidence if retries are irrelevant',async()=>{
 const unrelated=JSON.stringify({items:[{volumeInfo:{title:'Microsoft security',infoLink:'https://books.google.com/books?id=333'}}]});
 const transport=async url=>new Response(url.includes('/w/rest.php/')?JSON.stringify({pages:[]}):unrelated,{status:200});
 const result=await researchMessages([{role:'user',content:'Ψάξε ιστορικές πηγές για Hugo de Creveuil στην Ιεράπετρα'}],{now:new Date('2026-11-18T12:00:00Z'),transport});
 assert.equal(result.items.length,0);
 assert.match(contextForResearch(result),/No verifiable public results/);
});

test('Crossref metadata fallback is parsed safely and Google Books quota skips retry',async()=>{
 const records=JSON.stringify({message:{items:[{title:['Hugues Creveliers in Crete'],DOI:'10.1234/creveliers',author:[{given:'A',family:'Scholar'}],published:{'date-parts':[[2017]]}}]}});
 const parsed=crossrefParse(records);
 assert.equal(parsed.length,1);
 assert.equal(parsed[0].url,'https://doi.org/10.1234/creveliers');
 assert.equal(parsed[0].recordType,'bibliography');
 assert.equal(crossrefParse(JSON.stringify({message:{items:[{title:['Unsafe'],URL:'https://evil.example/1'}]}})).length,0);
 const calls=[];
 const transport=async url=>{
   calls.push(url);
   if(url.includes('googleapis.com'))return new Response('{}',{status:429});
   if(url.includes('crossref.org'))return new Response(url.includes('Hugues%20Creveliers')?records:JSON.stringify({message:{items:[]}}),{status:200});
   return new Response(JSON.stringify({pages:[]}),{status:200});
 };
 const result=await researchMessages([{role:'user',content:'Ψάξε ιστορικές πηγές για Crevellier Ιεράπετρα 1675'}],{now:new Date('2026-11-18T12:00:00Z'),transport});
 assert.equal(result.items.length,1);
 assert.equal(result.items[0].provider,'Crossref');
 assert.equal(calls.filter(x=>x.includes('googleapis.com')).length,1);
 assert.ok(calls.every(x=>!x.includes('bing.com')));
});

test('ordinary Google Web Search extracts third-party result headings without tracking links',()=>{
 const html='<html><body><a href="/url?q=https%3A%2F%2Fexample.org%2Fcreveliers%3Fx%3D1&sa=U"><h3>Hugues Creveliers and the history of Crete</h3></a>'+
 '<a href="https://another.edu/research"><h3>Research on Ierapetra 1675</h3></a>'+
 '<a href="https://www.google.com/"><h3>Internal Google link</h3></a>'+
 '<a href="http://127.0.0.1"><h3>Internal private network</h3></a></body></html>';
 const results=googleWebParse(html);
 assert.equal(results.length,2);
 assert.equal(results[0].url,'https://example.org/creveliers?x=1');
 assert.equal(results[1].url,'https://another.edu/research');
 assert.ok(results.every(x=>x.recordType==='search_result'));
 assert.throws(()=>googleWebParse('Our systems have detected unusual traffic from your computer. CAPTCHA'),/GOOGLE_SEARCH_ACCESS_CHALLENGE/);
});
test('historical research can find a Google Web result after reformulating without using Bing',async()=>{
 const calls=[];
 const resultPage='<html><a href="https://www.ekt.gr/en/research/creveliers"><h3>Hugues Creveliers history of Ierapetra</h3></a></html>';
 const transport=async url=>{
   calls.push(url);
   if(url.includes('/search?')&&url.includes('Hugues%20Creveliers'))return new Response(resultPage,{status:200});
   if(url.includes('google.com/search'))return new Response('<html><body>No useful results</body></html>',{status:200});
   if(url.includes('googleapis.com'))return new Response('{}',{status:429});
   if(url.includes('crossref.org'))return new Response('{"message":{"items":[]}}',{status:200});
   return new Response('{"pages":[]}',{status:200});
 };
 const r=await researchMessages([{role:'user',content:'Ψάξε στο διαδίκτυο για Hugo de Creveuil Crevellie και Ιεράπετρα 1675'}],{now:new Date('2026-11-18T12:00:00Z'),transport});
 assert.equal(r.items.length,1);
 assert.match(r.items[0].title,/Creveliers/);
 assert.equal(r.items[0].provider,'Google Web Search');
 assert.equal(r.queryRetried,true);
 assert.ok(calls.some(x=>x.startsWith('https://www.google.com/search?')));
 assert.ok(calls.every(x=>!x.includes('bing.com')));
});

test('no-key HTML web fallback extracts real HTTPS results, not its redirect wrappers',()=>{
 const html='<html><body>'+
  '<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fhistory%3Fid%3D5&amp;rut=xyz"><h2>Hugues Creveliers in Crete</h2></a>'+
  '<a class="result__a" href="https://example.edu/ierapetra"><span>Ierapetra 1675 maritime raid</span></a>'+
  '<a class="result__a" href="//duckduckgo.com/l/?uddg=http%3A%2F%2F127.0.0.1%2Fadmin">Unsafe private host</a>'+
  '</body></html>';
 const found=duckDuckGoParse(html);
 assert.equal(found.length,2);
 assert.equal(found[0].url,'https://example.org/history?id=5');
 assert.equal(found[1].url,'https://example.edu/ierapetra');
 assert.ok(found.every(x=>x.recordType==='search_result'));
});
test('Google JS-only response transparently falls back to general web index',async()=>{
 const html='<html><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fekt.gr%2Fhistory"><h2>Hugues Creveliers Ierapetra raid</h2></a></html>';
 const calls=[];
 const transport=async url=>{
   calls.push(url);
   if(url.includes('html.duckduckgo.com'))return new Response(html,{status:200});
   if(url.includes('www.google.com'))return new Response('<html><title>Google Search</title></html>',{status:200});
   if(url.includes('googleapis.com'))return new Response('{}',{status:429});
   if(url.includes('crossref.org'))return new Response('{"message":{"items":[]}}',{status:200});
   return new Response('{"pages":[]}',{status:200});
 };
 const result=await researchMessages([{role:'user',content:'Ψάξε ιστορικές πηγές για Hugues Creveliers και Ιεράπετρα 1675'}],{now:new Date('2026-11-18T12:00:00Z'),transport});
 assert.equal(result.items.length,1,JSON.stringify(result));
 assert.equal(result.items[0].provider,'Public Web Search');
 assert.ok(calls.some(x=>x.includes('www.google.com/search?')));
 assert.ok(calls.some(x=>x.includes('html.duckduckgo.com/html/?q=')));
 assert.ok(calls.every(x=>!x.includes('bing.com')));
});

test('real source reading includes Google/DDG hits, not bibliography, and inspects beyond three links',async()=>{
 const publishers=['https://piratecartography.com/creveliers','https://www.dw.com/history/creveliers',
   'https://www.bbc.com/history/creveliers','https://www.theguardian.com/history/creveliers'];
 const candidates=publishers.map((url,i)=>({title:'Creveliers Ierapetra source '+i,url,
   source:new URL(url).hostname,provider:i%2?'Public Web Search':'Google Web Search',recordType:'search_result'}));
 candidates.push({title:'Unread Crossref citation',url:'https://doi.org/10.1234/only-metadata',
   source:'Crossref',recordType:'bibliography'});
 const calls=[];
 const transport=async url=>{
   calls.push(url);
   const text='Hugues Creveliers and Ierapetra in 1675: an attributed historical report, not verified. ';
   return new Response('<html><article>'+('<p>'+text+'</p>').repeat(10)+'</article></html>',
     {status:200,headers:{'Content-Type':'text/html'}});
 };
 const research={searched:true,kind:'historical',query:'Hugues Creveliers Ierapetra 1675',items:candidates};
 const out=await enrichPublisherArticles(research,{transport});
 assert.equal(calls.length,4,'all four real search hits must be fetched');
 assert.equal(out.evidenceCoverage.attemptedReads,4);
 assert.equal(out.evidenceCoverage.successfullyRead,4);
 assert.equal(out.evidenceCoverage.distinctTopicHosts,4);
 assert.equal(out.evidenceCoverage.historicalClaimVerified,false);
 assert.equal(out.evidenceCoverage.independenceStatus,'NOT_ESTABLISHED_BY_HOST_COUNT');
 assert.ok(out.items.slice(0,4).every(x=>x.articleRead&&x.articleText.includes('Ierapetra')));
 assert.equal(out.items[4].articleRead,undefined,'Crossref is only bibliographic metadata');
});
test('one matching historical search result does not prevent variant research',async()=>{
 const calls=[];
 const google='<html><a href="https://piratecartography.com/creveliers"><h3>Hugues Creveliers Ierapetra 1675</h3></a></html>';
 const transport=async url=>{
   calls.push(url);
   if(url.includes('www.google.com/search'))return new Response(google,{status:200});
   if(url.includes('html.duckduckgo.com'))return new Response('<html></html>',{status:200});
   if(url.includes('googleapis.com'))return new Response('{}',{status:429});
   if(url.includes('crossref.org'))return new Response('{"message":{"items":[]}}',{status:200});
   return new Response('{"pages":[]}',{status:200});
 };
 const result=await researchMessages([{role:'user',
   content:'Ψάξε ιστορικές πηγές για Hugues Creveliers Ιεράπετρα 1675'}],
   {now:new Date('2026-11-18T18:00:00Z'),transport});
 assert.equal(result.queryRetried,true);
 assert.ok(calls.some(x=>x.includes('Hugues%20Creveliers%20Ierapetra%201675')));
 assert.ok(calls.some(x=>x.includes('Crevellier%20Crete')));
});

test('DuckDuckGo Lite links are actually parsed as source candidates',()=>{
 const lite='<html><table><tr><td><a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fcreveliers" class="result-link">Hugues Creveliers Ierapetra 1675</a></td></tr>'+
 '<tr><td><a class="result-link" href="https://university.example/history">Second historical source</a></td></tr></table></html>';
 const hits=duckDuckGoParse(lite);
 assert.equal(hits.length,2);
 assert.equal(hits[0].url,'https://example.org/creveliers');
 assert.equal(hits[1].recordType,'search_result');
});
