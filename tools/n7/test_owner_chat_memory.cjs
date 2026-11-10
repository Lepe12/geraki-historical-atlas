'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createOwnerChatMemory}=require('./owner-chat-memory');
function setup(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'n7-owner-memory-test-'));
  const skill=path.join(dir,'skills','greek-prose-editor');
  fs.mkdirSync(skill,{recursive:true});
  fs.writeFileSync(path.join(skill,'SKILL.md'),
    '---\nname: greek-prose-editor\ndescription: Revise Greek fiction\n---\nPreserve literary voice and short phrases.\n');
  return {dir,memory:createOwnerChatMemory(path.join(dir,'data'),path.join(dir,'skills')),
    cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
test('no memory exists or is created before explicit owner approval',()=>{
  const x=setup();try{
    assert.deepEqual(x.memory.list(),[]);
    const guidance=x.memory.context([{role:'user',content:'Κάνε επιμέλεια στο απόσπασμα'}]);
    assert.match(guidance,/Greek Prose|Revise Greek fiction|Preserve literary voice/);
    assert.match(guidance,/Δεν έχουν αποθηκευτεί ακόμη/);
    assert.equal(fs.existsSync(path.join(x.dir,'data','n7-approved-writing-lessons.json')),false);
  }finally{x.cleanup();}
});
test('approved correction persists and is loaded into later editorial requests only',()=>{
  const x=setup();try{
    const text='Διατήρησε τις κοφτές προτάσεις και το ακόμη όταν είναι ορθό.';
    const item=x.memory.add(text);
    const fresh=createOwnerChatMemory(path.join(x.dir,'data'),path.join(x.dir,'skills'));
    assert.equal(fresh.list().length,1);
    assert.equal(fresh.list()[0].source,'owner-approved');
    assert.ok(fresh.context([{role:'user',content:'Θέλω διόρθωση κειμένου'}]).includes(text));
    assert.equal(fresh.context([{role:'user',content:'Πώς είναι ο καιρός;'}]),'');
    assert.equal(fresh.remove(item.id),true);
    assert.equal(fresh.list().length,0);
  }finally{x.cleanup();}
});
test('unverified automatic feedback is not admitted and duplicates are rejected',()=>{
  const x=setup();try{
    assert.throws(()=>x.memory.add('αβ'),/12/);
    x.memory.add('Διατήρησε τα λογοτεχνικά σχήματα.');
    assert.throws(()=>x.memory.add('Διατήρησε τα λογοτεχνικά σχήματα.'),/υπάρχει ήδη/);
  }finally{x.cleanup();}
});
test('memory store fails closed on symlink injection',()=>{
  const x=setup();try{
    const dest=path.join(x.dir,'private.json');
    fs.writeFileSync(dest,'[]');
    fs.mkdirSync(path.join(x.dir,'data'));
    fs.symlinkSync(dest,path.join(x.dir,'data','n7-approved-writing-lessons.json'));
    assert.throws(()=>x.memory.list(),/Invalid N7 memory file/);
    assert.throws(()=>x.memory.add('Πρέπει να προστατεύεται το ύφος του συγγραφέα.'),/Invalid N7 memory file/);
    assert.equal(fs.readFileSync(dest,'utf8'),'[]');
  }finally{x.cleanup();}
});
test('skills and owner corrections are bounded and never rewrite original skill file',()=>{
  const x=setup();try{
    for(let i=0;i<18;i++)x.memory.add('Εγκεκριμένος κανόνας λογοτεχνίας αριθμός '+i+' με έμφαση στο ύφος.');
    const skillFile=path.join(x.dir,'skills','greek-prose-editor','SKILL.md');
    const old=fs.readFileSync(skillFile,'utf8');
    const guidance=x.memory.context([{role:'user',content:'Επιμέλεια μυθιστορήματος'}]);
    assert.ok(guidance.includes('GREEK LITERARY EDITING'));
    assert.ok(guidance.includes('OWNER-APPROVED'));
    assert.ok(guidance.includes('αριθμός 17'));
    assert.ok(guidance.includes('αριθμός 0'));
    assert.equal(fs.readFileSync(skillFile,'utf8'),old);
  }finally{x.cleanup();}
});
