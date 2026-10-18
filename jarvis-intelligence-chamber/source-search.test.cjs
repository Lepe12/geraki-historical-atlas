const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const mod=import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(__dirname+'/source-search.js','utf8')).toString('base64'));
test('Greek source search ignores accents, case, final sigma and word order',async()=>{
 const {matchesSource}=await mod;
 assert.ok(matchesSource({title:'Πέτρος Λάντζας',context_excerpt:'Αλληλογραφία στη Βενετία'},'βενετια ΠΕΤΡΟΣ'));
 assert.ok(matchesSource({title:'Πε\u0301τρος Λα\u0301ντζας'},'πετροσ λαντζασ'));
 assert.equal(matchesSource({title:'Πέτρος Λάντζας'},'πετρος ανυπαρκτο'),false);
});
test('query provenance and target metadata cannot make an unrelated source match',async()=>{
 const {matchesSource}=await mod;
 assert.equal(matchesSource({title:'Άλλη πηγή',query:'Πέτρος Λάντζας',fulltext_query:'Πέτρος Λάντζας',topical_match:{matched_name:'Πέτρος Λάντζας'}},'λαντζας'),false);
});
test('search covers recorded excerpts, citations and page locations',async()=>{
 const {matchesSource}=await mod;
 assert.ok(matchesSource({source_occurrences:[{title:'Venetian letters',quote:'Pietro Lanza'}]},'pietro venetian'));
 assert.ok(matchesSource({title:'Book',printed_page:42,source_excerpt:'Letter from Venice'},'42 venice'));
 assert.ok(matchesSource({},''));
});
