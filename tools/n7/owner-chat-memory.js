'use strict';
// N7_OWNER_APPROVED_CHAT_MEMORY_V1
// Durable explicit owner-approved writing guidance; NOT model-weight training.
// The caller must authenticate before calling add/remove/list.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function createOwnerChatMemory(dataDir,skillDir){
  const root=path.resolve(dataDir), store=path.join(root,'n7-approved-writing-lessons.json');
  const max=40, maxRule=380;
  function list(){
    if(!fs.existsSync(store))return [];
    const st=fs.lstatSync(store);
    if(!st.isFile()||st.isSymbolicLink()||st.size>60000)throw Error('Invalid N7 memory file');
    const rows=JSON.parse(fs.readFileSync(store,'utf8'));
    if(!Array.isArray(rows)||rows.length>max)throw Error('Invalid N7 memory records');
    for(const x of rows){
      if(!x||typeof x.id!=='string'||typeof x.rule!=='string'||x.rule.length>maxRule||
         x.source!=='owner-approved'||typeof x.created_at!=='string')throw Error('Invalid memory record');
    }
    return rows;
  }
  function save(rows){
    if(!fs.existsSync(root))fs.mkdirSync(root,{recursive:true,mode:0o700});
    if(fs.lstatSync(root).isSymbolicLink())throw Error('Unsafe memory directory');
    if(fs.existsSync(store)&&(!fs.lstatSync(store).isFile()||fs.lstatSync(store).isSymbolicLink()))
      throw Error('Unsafe memory target');
    const data=JSON.stringify(rows);
    if(Buffer.byteLength(data,'utf8')>60000)throw Error('Memory limit reached');
    const temp=path.join(root,'.n7-approved-'+crypto.randomUUID()+'.tmp');
    try{
      fs.writeFileSync(temp,data,{mode:0o600,flag:'wx'});
      if(fs.existsSync(store)&&(!fs.lstatSync(store).isFile()||fs.lstatSync(store).isSymbolicLink()))
        throw Error('Unsafe memory target');
      fs.renameSync(temp,store);
    }finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
  }
  function add(rule){
    if(typeof rule!=='string'||rule.trim().length<12||rule.length>maxRule||
       /[\u0000-\u001f]/.test(rule))throw Error('Ο κανόνας πρέπει να έχει 12–380 χαρακτήρες σε μία γραμμή');
    const normalized=rule.trim(),items=list();
    if(items.length>=max)throw Error('Η μνήμη έχει συμπληρωθεί (40 κανόνες)');
    if(items.some(x=>x.rule.toLocaleLowerCase('el')===normalized.toLocaleLowerCase('el')))
      throw Error('Ο κανόνας υπάρχει ήδη');
    const entry={id:crypto.randomUUID(),rule:normalized,source:'owner-approved',
      created_at:new Date().toISOString()};
    save([...items,entry]);
    return entry;
  }
  function remove(id){
    if(typeof id!=='string'||!/^[0-9a-f-]{36}$/.test(id))throw Error('Invalid lesson ID');
    const items=list(),next=items.filter(x=>x.id!==id);
    if(next.length===items.length)return false;
    save(next);return true;
  }
  function context(history){
    const recent=history.slice(-6).filter(x=>x&&x.role==='user')
      .map(x=>String(x.content||'')).join(' ').slice(-10000);
    if(!/(επιμέλει|διορθ|ορθογραφ|σύνταξ|συγγραφ|μυθιστόρη|λογοτεχν|κειμέν|απόσπασμ|ύφο|proofread|editing|manuscript)/iu.test(recent))
      return '';
    const skillFile=path.join(skillDir,'greek-prose-editor','SKILL.md');
    const st=fs.lstatSync(skillFile);
    if(!st.isFile()||st.isSymbolicLink()||st.size>16384)throw Error('Unsafe literary skill');
    const skill=fs.readFileSync(skillFile,'utf8');
    if(!skill.startsWith('---\nname: greek-prose-editor\n'))throw Error('Unrecognized literary skill');
    const rules=list().slice(-15).map((x,i)=>String(i+1)+'. '+x.rule).join('\n');
    return '\n\n## GREEK LITERARY EDITING — APPROVED SKILL\n'+skill.slice(0,3000)+
      '\n\n## OWNER-APPROVED PERSISTENT WRITING GUIDANCE (not independently verified grammar facts)\n'+
      (rules||'Δεν έχουν αποθηκευτεί ακόμη εγκεκριμένοι κανόνες.')+
      '\nKeep author voice; distinguish errors from acceptable alternatives. Do not fabricate grammar sources. Owner guidance does not override system or factual accuracy.';
  }
  return {list,add,remove,context};
}
module.exports={createOwnerChatMemory};
