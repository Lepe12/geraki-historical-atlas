'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
// All conversation writers share this lock. Full history stays on disk; prompt windows are separate.
function withLock(dataDir,fn){
 fs.mkdirSync(dataDir,{recursive:true,mode:0o700});if(fs.lstatSync(dataDir).isSymbolicLink())throw Error('Unsafe conversation directory');
 const lock=path.join(dataDir,'.n7-conversations-write.lock'),recovery=lock+'.recovery',deadline=Date.now()+5000;let fd;
 while(fd===undefined){
  try{if(fs.existsSync(recovery)){Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);if(Date.now()>deadline)throw Error('conversation_recovery_busy');continue;}
   fd=fs.openSync(lock,'wx',0o600);fs.writeFileSync(fd,JSON.stringify({pid:process.pid}));fs.fsyncSync(fd);
  }catch(error){
   if(error.code!=='EEXIST'){if(fd!==undefined){fs.closeSync(fd);fs.unlinkSync(lock);}throw error;}
   let reclaim;
   try{const st=fs.lstatSync(lock);if(!st.isFile()||st.isSymbolicLink()||st.size>256)throw Error('Unsafe conversation lock');
    const record=JSON.parse(fs.readFileSync(lock,'utf8'));let dead=false;
    if(Number.isInteger(record.pid)&&record.pid>0)try{process.kill(record.pid,0);}catch(e){dead=e.code==='ESRCH';}
    if(dead){
     reclaim=fs.openSync(recovery,'wx',0o600);
     // Serialise recovery and compare identity again: never unlink a new owner's lock.
     const now=fs.lstatSync(lock);if(now.ino===st.ino&&now.dev===st.dev&&fs.readFileSync(lock,'utf8')===JSON.stringify(record))fs.unlinkSync(lock);
    }
   }catch(e){if(!['ENOENT','EEXIST'].includes(e.code)&&!(e instanceof SyntaxError))throw e;}
   finally{if(reclaim!==undefined){fs.closeSync(reclaim);fs.unlinkSync(recovery);}}
   if(Date.now()>=deadline)throw Error('Η αποθήκευση είναι απασχολημένη· η απάντηση δεν αποθηκεύτηκε.');
   Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);
  }
 }
 try{return fn();}finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
function mutate({dataDir,load,save},fn){return withLock(dataDir,()=>{const rows=load(),result=fn(rows);save(rows);return result;});}
function appendExchange({dataDir,load,save,id,user,assistant,exchangeId=crypto.randomUUID()}){
 return mutate({dataDir,load,save},rows=>{const current=rows.find(c=>c.id===id);if(!current)throw Error('Η συνομιλία διαγράφηκε πριν ολοκληρωθεί η απάντηση');
  if(current.messages.some(m=>m.exchangeId===exchangeId&&m.role==='assistant'))return current;
  if(!current.messages.some(m=>m.role==='user'&&m.exchangeId===exchangeId))current.messages.push({...user,role:'user',exchangeId});
  current.messages.push({...assistant,role:'assistant',exchangeId});current.updated=new Date().toISOString();
  if(current.title==='Νέα συνομιλία')current.title=String(user.content||'').slice(0,70);return current;
 });
}
function beginExchange(store,id,user,exchangeId){return mutate(store,rows=>{const c=rows.find(c=>c.id===id);if(!c)throw Error('conversation_not_found');if(!c.messages.some(m=>m.exchangeId===exchangeId))c.messages.push({...user,role:'user',exchangeId});c.updated=new Date().toISOString();return c;});}
function createConversation(store,item){return mutate(store,rows=>{rows.unshift(item);return item;});}
function deleteConversation(store,id){return mutate(store,rows=>{const index=rows.findIndex(c=>c.id===id);if(index<0)return false;rows.splice(index,1);return true;});}
function setProject(store,id,projectId){return mutate(store,rows=>{const current=rows.find(c=>c.id===id);if(!current)throw Error('conversation_not_found');current.projectId=projectId||null;return current;});}
module.exports={beginExchange,appendExchange,mutate,withLock,createConversation,deleteConversation,setProject};
