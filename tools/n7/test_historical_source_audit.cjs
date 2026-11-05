'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {extractBibliography,chronologicalWarnings,attachHistoricalAudit,historicalAuditContext}=require('./historical-source-audit');
const {enrichPublisherArticles,contextForResearch,sourceFooter,extractVisibleArticle}=require('./public-web-search');
const article='<html><body><article><h1>Πέτρος Λάντζας – Ο Πειρατής Κατάσκοπος</h1>'+
'<p>Ο Πέτρος Λάντζας γεννήθηκε στην Κέρκυρα και διορίστηκε διοικητής της Πάργας στις 9 Ιανουαρίου 1573.</p>'+
'<p>'+('Ο Πέτρος Λάντζας διετέλεσε κουρσάρος στις υπηρεσίες της Νάπολης και της Ισπανίας. '.repeat(30))+'</p>'+
'<p>Ο Λάντζας συμμετείχε στην προσπάθεια δολοφονίας του σουλτάνου Μουράτ Γ’ το 1608.</p>'+
'<p>Πηγές:</p><ul>'+
'<li>Λάσκαρις Μιχαήλ, Αθήναι, 1956, Πέτρος Λάντζας διοικητής της Πάργας (1573).</li>'+
'<li>Ιωάννου Παναγιώτης, Θησαυρίσματα, 30 (2000), Από τη Γαληνοτάτη στον Καθολικότατο.</li>'+
'</ul></article></body></html>';
const tdv='<html><article><h1>MURAD III</h1><p>'+('MURAD III: Ottoman sultan (1574-1595). '.repeat(25))+'</p></article></html>';
test('extract full visible Greek article and two distinct bibliography records',()=>{
 const text=extractVisibleArticle(article);
 assert.ok(text.length>1400);
 assert.match(text,/Πάργας στις 9 Ιανουαρίου 1573/);
 assert.match(text,/Θησαυρίσματα/);
 const refs=extractBibliography(text);
 assert.ok(refs.some(x=>x.includes('Λάσκαρις')),JSON.stringify(refs));
 assert.ok(refs.some(x=>x.includes('Ιωάννου')),JSON.stringify(refs));
});
test('bibliography remains identified as cited, NOT read',()=>{
 const text=extractVisibleArticle(article);
 const state={searched:true,kind:'historical',items:[{
  url:'https://www.piratecartography.com/archives/114',source:'Pirate Cartography',articleRead:true,articleText:text
 }]};
 attachHistoricalAudit(state,{independentReignChecked:false});
 assert.ok(state.historicalAudit.bibliography.length>=2);
 const context=historicalAuditContext(state);
 assert.match(context,/MENTIONED, NOT READ/);
 assert.match(context,/ΠΡΟΣ ΔΙΑΣΤΑΥΡΩΣΗ/);
 assert.doesNotMatch(context,/ΙΣΤΟΡΙΚΗ ΑΝΤΙΦΑΣΗ/);
});
test('independently retrieved encyclopedia triggers explicit contradiction warning',async()=>{
 const mock=async(url,options)=>{
  assert.equal(options.method,'GET');
  assert.equal(options.redirect,'error');
  const text=url.includes('islamansiklopedisi')?tdv:article;
  return new Response(text,{status:200,headers:{'Content-Type':'text/html'}});
 };
 const result={searched:true,kind:'historical',
   query:'Pietro Lanza Corfu corsair Parga 1573 Spanish Naples 1608 history',
   items:[{title:'Πέτρος Λάντζας',url:'https://www.piratecartography.com/archives/114',source:'Author article'}]};
 await enrichPublisherArticles(result,{transport:mock});
 assert.equal(result.items[0].articleRead,true);
 assert.equal(result.historicalAudit.independentReignChecked,true);
 assert.match(result.historicalAudit.warnings[0].description,/1574–1595/);
 assert.match(contextForResearch(result),/Αχμέτ Α/);
 assert.match(contextForResearch(result),/Ιωάννου/);
 assert.ok(result.items.some(x=>x.url.includes('islamansiklopedisi')));
 assert.match(sourceFooter(result),/αναγνώστηκε περιεχόμενο/);
});
test('if independent encyclopedia cannot be reached no false verification is claimed',async()=>{
 const mock=async(url)=>{
  if(url.includes('islamansiklopedisi'))throw Error('Offline');
  return new Response(article,{status:200,headers:{'Content-Type':'text/html'}});
 };
 const result={searched:true,kind:'historical',query:'Pietro Lanza Corfu corsair',items:[{
  title:'Lanza',url:'https://www.piratecartography.com/archives/114'
 }]};
 await enrichPublisherArticles(result,{transport:mock});
 assert.equal(result.historicalAudit.independentReignChecked,false);
 assert.match(contextForResearch(result),/ΠΡΟΣ ΔΙΑΣΤΑΥΡΩΣΗ/);
 assert.doesNotMatch(contextForResearch(result),/ΙΣΤΟΡΙΚΗ ΑΝΤΙΦΑΣΗ/);
});
test('unrelated historical article is not assigned a Lanza biography audit',()=>{
 const state={searched:true,kind:'historical',query:'Venetian history',items:[{
  url:'https://www.reuters.com/example',articleRead:true,articleText:article
 }]};
 attachHistoricalAudit(state);
 assert.equal(state.historicalAudit,undefined);
});
test('chronology flag is confined to actual text, not automatic blanket claim',()=>{
 assert.deepEqual(chronologicalWarnings('Ο Πέτρος Λάντζας διορίστηκε το 1573.',true),[]);
});
