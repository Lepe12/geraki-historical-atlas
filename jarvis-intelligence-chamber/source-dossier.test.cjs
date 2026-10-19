const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/research-ui.js','utf8');
const render=vm.runInNewContext(source.slice(source.indexOf('const esc='),source.indexOf('function recordEvidence'))+';semanticAnswer',{URL});
test('source dossier renders exact quotes, citations, uncertainty and safe links without claiming model synthesis',()=>{
 const html=render({schema:'pct-semantic-answer-v1',status:'SOURCE_DOSSIER_AVAILABLE',answer_mode:'EXACT_SOURCE_EXTRACTS',claims:[{claim_id:'extract-1',kind:'acquired_excerpt',statement:'Απόσπασμα',quote:'<script>source</script>',source_occurrences:[{title:'Book',url:'https://example.org/source',locator:{start_line:2,end_line:4}}],source_uncertainties:['IDENTITY_PENDING']}],answer_sections:[{text:'Book',claim_ids:['extract-1']}],documentary_timeline:[{year:1677,claim_id:'extract-1'}],unknowns:['Η ταύτιση παραμένει ανοιχτή.']});
 assert.match(html,/χωρίς υπηρεσία μοντέλου/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/https:\/\/example.org\/source/);assert.match(html,/Γραμμές 2–4/);assert.match(html,/IDENTITY_PENDING/);assert.match(html,/Δεν αποτελούν επαληθευμένο χρονολόγιο/);assert.doesNotMatch(html,/Σύνθεση μοντέλου από/);
});
test('empty dossier reports insufficient evidence instead of an answer',()=>{
 const html=render({schema:'pct-semantic-answer-v1',status:'INSUFFICIENT_ACQUIRED_EVIDENCE'});
 assert.match(html,/Δεν έχει αποκτηθεί αρκετό κείμενο/);assert.doesNotMatch(html,/ΑΠΑΝΤΗΣΗ ΜΕ ΠΑΡΑΠΟΜΠΕΣ/);
});
