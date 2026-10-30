const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/research-ui.js','utf8');
const render=vm.runInNewContext(source.slice(source.indexOf('const esc='),source.indexOf('function recordEvidence'))+';semanticAnswer',{URL});
test('source dossier renders exact quotes, citations, uncertainty and safe links without claiming model synthesis',()=>{
 const html=render({schema:'pct-semantic-answer-v1',status:'SOURCE_DOSSIER_AVAILABLE',answer_mode:'EXACT_SOURCE_EXTRACTS',claims:[{claim_id:'extract-1',kind:'acquired_excerpt',statement:'Απόσπασμα',quote:'<script>source</script>',source_occurrences:[{title:'Book',url:'https://example.org/source',locator:{start_line:2,end_line:4,printed_page:135,scan_indexes_0_based:[14]}}],source_uncertainties:['IDENTITY_PENDING']}],answer_sections:[{text:'Book',claim_ids:['extract-1']}],documentary_timeline:[{year:1677,claim_id:'extract-1'}],unknowns:['Η ταύτιση παραμένει ανοιχτή.']});
 assert.match(html,/χωρίς υπηρεσία μοντέλου/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/https:\/\/example.org\/source/);assert.match(html,/Γραμμές 2–4/);assert.match(html,/Σελίδα 135/);assert.match(html,/PDF 15/);assert.match(html,/IDENTITY_PENDING/);assert.match(html,/Δεν αποτελούν επαληθευμένο χρονολόγιο/);assert.doesNotMatch(html,/Σύνθεση μοντέλου από/);
});
test('empty dossier reports insufficient evidence instead of an answer',()=>{
 const html=render({schema:'pct-semantic-answer-v1',status:'INSUFFICIENT_ACQUIRED_EVIDENCE'});
 assert.match(html,/Δεν έχει αποκτηθεί αρκετό κείμενο/);assert.doesNotMatch(html,/ΑΠΑΝΤΗΣΗ ΜΕ ΠΑΡΑΠΟΜΠΕΣ/);
});

test('current engine answers render with citations and explicit pending corpus coverage',()=>{
 for(const schema of ['pct-semantic-answer-v1','pct-semantic-answer-v2','pct-semantic-answer-v3']){
  const html=render({schema,status:'MODEL_ANSWER_PENDING_HUMAN_REVIEW',answer_scope:'PROVISIONAL_EXAMINED_PASSAGES_ONLY',coverage:{deferred:[{evidence_id:'unread'}]},claims:[{claim_id:'c-1',kind:'source_statement',statement:'The source names the island.',quote:'Literal acquired evidence',source_occurrences:[{title:'Consulted book',url:'https://example.org/book',locator:{printed_page:42}}]}],answer_sections:[{text:'The consulted source names the island.',claim_ids:['c-1']}]});
  assert.match(html,/The consulted source names the island/);
  assert.match(html,/Literal acquired evidence/);
  assert.match(html,/Σελίδα 42/);
  assert.match(html,/https:\/\/example.org\/book/);
  assert.match(html,/Η κάλυψη του συνόλου των πηγών παραμένει εκκρεμής/);
  assert.match(html,/Εκκρεμεί ιστορική επαλήθευση/);
 }
});
test('schema compatibility never exposes unreviewed or uncited answer sections',()=>{
 const pending=render({schema:'pct-semantic-answer-v3',status:'RESEARCH_COVERAGE_PENDING',claims:[],answer_sections:[{text:'Do not publish this',claim_ids:['missing']}]});
 assert.doesNotMatch(pending,/Do not publish this/);
 const uncited=render({schema:'pct-semantic-answer-v3',status:'MODEL_ANSWER_PENDING_HUMAN_REVIEW',claims:[],answer_sections:[{text:'Missing evidence',claim_ids:['missing']}]});
 assert.doesNotMatch(uncited,/Missing evidence/);
 assert.equal(render({schema:'unknown-schema',status:'MODEL_ANSWER_PENDING_HUMAN_REVIEW'}),'');
});
