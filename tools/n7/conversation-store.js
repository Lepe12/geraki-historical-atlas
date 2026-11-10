'use strict';
// Merge completed exchanges into the latest database; never save a stale prompt history.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function appendExchange({dataDir,load,save,id,user,assistant,exchangeId=crypto.randomUUID()}){
 fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
 if(fs.lstatSync(dataDir).isSymbolicLink())throw Error('Unsafe conversation directory');
 const lock=path.join(dataDir,'.n7-conversations-write.lock'),deadline=Date.now()+5000;
 let fd;
 while(fd===undefined){
  try{fd=fs.openSync(lock,'wx',0o600);fs.writeFileSync(fd,JSON.stringify({pid:process.pid}));}
  catch(error){
   if(error.code!=='EEXIST'){if(fd!==undefined){fs.closeSync(fd);fs.unlinkSync(lock);}throw error;}
   try{const st=fs.lstatSync(lock);if(!st.isFile()||st.isSymbolicLink()||st.size>256)throw Error('Unsafe conversation lock');}catch(e){if(e.code==='ENOENT')continue;throw e;}
   // A crashed writer leaves a visible lock; never steal a possibly active lock.
   if(Date.now()>=deadline)throw Error('Η αποθήκευση είναι απασχολημένη· η απάντηση δεν αποθηκεύτηκε.');
   Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);
  }
 }
 try{
  const rows=load(),current=rows.find(c=>c.id===id);
  if(!current)throw Error('Η συνομιλία διαγράφηκε πριν ολοκληρωθεί η απάντηση');
  if(current.messages.some(m=>m.exchangeId===exchangeId&&m.role==='assistant'))return current;
  current.messages=[...current.messages,{...user,role:'user',exchangeId},{...assistant,role:'assistant',exchangeId}].slice(-100);
  current.updated=new Date().toISOString();
  if(current.title==='Νέα συνομιλία')current.title=String(user.content||'').slice(0,70);
  save(rows);return current;
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
module.exports={appendExchange};
