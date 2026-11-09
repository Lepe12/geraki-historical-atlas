'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const diff=require('./editor-diff');
test('Greek word edits preserve exact original and revision including whitespace',()=>{
 const before='Το πλοίο έγερνε, μα κρατούσε.\nΚανείς δεν μιλούσε.';
 const after='Το πλοίο έγερνε, αλλά κρατούσε.\nΚανείς δεν μιλούσε.';
 const r=diff.compare(before,after);
 assert.equal(r.parts.filter(p=>p.kind!=='add').map(p=>p.text).join(''),before);
 assert.equal(r.parts.filter(p=>p.kind!=='remove').map(p=>p.text).join(''),after);
 assert.equal(r.changes,1);assert.equal(r.granularity,'word');
 assert.ok(r.parts.some(p=>p.kind==='remove'&&p.text==='μα'));
});
test('identical and punctuation-only comparisons are exact',()=>{
 assert.equal(diff.compare('Ήταν εκεί.','Ήταν εκεί.').changes,0);
 const r=diff.compare('Ναι, είπε.','Ναι — είπε.');assert.ok(r.changes>0);
 assert.equal(r.parts.filter(p=>p.kind!=='remove').map(p=>p.text).join(''),'Ναι — είπε.');
});
test('bounded large input falls back without inventing word-level precision',()=>{
 const a='λέξη '.repeat(1500),b='άλλη '.repeat(1500);const r=diff.compare(a,b);
 assert.equal(r.granularity,'paragraph');assert.equal(r.parts.filter(p=>p.kind!=='add').map(p=>p.text).join(''),a);
 assert.throws(()=>diff.compare('a'.repeat(10001),'b'),/length/);
});
test('revisions require explicit complete unique markers; commentary is separate',()=>{
 assert.equal(diff.output('Έκανα αλλαγές. Καλύτερο κείμενο.'),null);
 assert.equal(diff.output('⟦N7_EDIT⟧Λείπει κλείσιμο'),null);
 const r=diff.output('⟦N7_EDIT⟧\nΤο κείμενο.\n⟦/N7_EDIT⟧\n⟦N7_NOTES⟧Διόρθωσα ένα σημείο.⟦/N7_NOTES⟧');
 assert.equal(r.text,'Το κείμενο.');assert.equal(r.notes,'Διόρθωσα ένα σημείο.');
});
test('original source metadata can be restored from persisted conversation, not generated notes',()=>{
 const data={schema:'n7-editor-v1',source:'<script>Απλό κείμενο</script>',filename:'κεφάλαιο.txt'};
 assert.deepEqual(diff.input('Οδηγίες'+diff.INPUT+JSON.stringify(data)),data);
 assert.equal(diff.input('Οδηγίες'+diff.INPUT+'{bad'),null);
});
