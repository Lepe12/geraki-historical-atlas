'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {sourceFooter,extractVisibleArticle,enrichPublisherArticles,publisherArticle}=require('./public-web-search');
test('all nine citations are visible, including S6 and S7',()=>{
 const items=Array.from({length:9},(_,i)=>({
   title:'Document '+(i+1),source:'Publisher',published:'2026-11-05',
   url:'https://www.reuters.com/example/'+i
 }));
 const footer=sourceFooter({searched:true,items});
 assert.match(footer,/\[S6\]/);assert.match(footer,/\[S7\]/);
 assert.match(footer,/\[S9\]/);
 assert.equal((footer.match(/https:\/\//g)||[]).length,9);
});
test('article extraction strips scripts and preserves article paragraphs',()=>{
 const html='<html><script>ignore me</script><article>'+
   '<h1>Αποτελέσματα</h1><p>'+('Ιστορική πληροφορία '.repeat(50))+'</p>'+
   '<p>Δεύτερη παράγραφος</p></article></html>';
 const text=extractVisibleArticle(html);
 assert.ok(text.includes('Δεύτερη παράγραφος'));
 assert.ok(!text.includes('ignore me'));
});
test('publisher full text is loaded only from trusted domain',async()=>{
 const html='<html><article>'+('<p>Το αποτέλεσμα εξετάζεται με πρωτογενείς πηγές.</p>'.repeat(18))+'</article></html>';
 const mock=async(url,options)=>{
   assert.ok(url.startsWith('https://www.reuters.com/'));
   assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
   return new Response(html,{status:200,headers:{'Content-Type':'text/html'}});
 };
 const content=await publisherArticle('https://www.reuters.com/world/example',{transport:mock});
 assert.match(content,/πρωτογενείς πηγές/);
 await assert.rejects(publisherArticle('https://127.0.0.1/internal',{transport:mock}));
 const result={searched:true,items:[{title:'Evidence',url:'https://www.reuters.com/world/example'}]};
 await enrichPublisherArticles(result,{transport:mock});
 assert.equal(result.items[0].articleRead,true);
 assert.ok(result.items[0].articleText.length>400);
});

test('bibliography from actual article is placed before long article excerpts',()=>{
 const {contextForResearch}=require('./public-web-search');
 const research={searched:true,kind:'historical',query:'Pietro Lanza Corfu corsair',items:[{
  title:'Πέτρος Λάντζας',source:'Pirate Cartography',url:'https://www.piratecartography.com/archives/114',
  articleRead:true,articleText:'Α'.repeat(15000)
 }],historicalAudit:{
  articleUrl:'https://www.piratecartography.com/archives/114',
  readCharacters:15000,bibliography:['Λάσκαρις: Πέτρος Λάντζας','Ιωάννου: Από τη Γαληνοτάτη στον Καθολικότατο'],
  warnings:[],independentReignChecked:false
 }};
 const prompt=contextForResearch(research);
 assert.ok(prompt.indexOf('Λάσκαρις')<prompt.indexOf('ACTUAL ARTICLE TEXT EXTRACTED'));
 assert.ok(prompt.indexOf('Ιωάννου')<prompt.indexOf('ACTUAL ARTICLE TEXT EXTRACTED'));
 assert.ok(prompt.length<9500,'source context exceeded bounded size: '+prompt.length);
 assert.match(prompt,/MENTIONED, NOT READ/);
 assert.match(prompt,/actual publisher article text extracted/i);
});
