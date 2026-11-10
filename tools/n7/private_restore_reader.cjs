'use strict';
// Offline interpretation of a restored data tree. No model calls or background jobs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createLibrary}=require('./source-library'),{createWorkflows}=require('./workspace-workflows');
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
async function inspect(dataDir){
 const conversations=JSON.parse(fs.readFileSync(path.join(dataDir,'conversations.json'),'utf8'));
 if(!Array.isArray(conversations))throw Error('invalid_conversations');
 const ids=new Set();let messages=0;
 for(const c of conversations){if(typeof c.id!=='string'||ids.has(c.id)||!Array.isArray(c.messages))throw Error('invalid_conversation');ids.add(c.id);for(const m of c.messages){if(typeof m.role!=='string'||(typeof m.content!=='string'&&!Array.isArray(m.content)))throw Error('invalid_message');messages++;}}
 const library=createLibrary(dataDir,{background:false});
 let readablePages=0,pendingDocuments=0,originals=0;
 try{
  const documents=library.all();
  for(const m of documents){
   const dir=path.join(library.root,m.id),original=path.join(dir,'original');
   if(m.sourceHash&&m.status!=='duplicate'){if(!fs.existsSync(original)||digest(fs.readFileSync(original))!==m.sourceHash)throw Error('invalid_original');originals++;}else pendingDocuments++;
   const pages=path.join(dir,'pages');if(fs.existsSync(pages))for(const name of fs.readdirSync(pages).filter(n=>/^\d+\.json$/.test(n))){const p=library.page(m.id,Number(name.slice(0,-5)));if(p.textHash&&digest(p.text||'')!==p.textHash)throw Error('invalid_page_text');if(p.text?.trim())readablePages++;}
  }
  const workflows=createWorkflows({dataDir,load:()=>conversations,save:()=>{throw Error('readonly_reader');},library,infer:()=>{throw Error('model_disabled');},background:false});
  const state=await workflows.rpc({op:'project_list'});let entries=0,approvedEntries=0;
  const projectIds=new Set(state.projects.map(p=>p.id));for(const p of state.projects){const exported=await workflows.rpc({op:'project_export',projectId:p.id});for(const e of exported.entries){if(typeof e.text!=='string'||typeof e.approved!=='boolean')throw Error('invalid_project_entry');entries++;if(e.approved)approvedEntries++;}}
  return {conversations:conversations.length,messages,documents:documents.length,originals,readablePages,pendingDocuments,projects:state.projects.length,entries,approvedEntries,danglingProjectBindings:conversations.filter(c=>c.projectId&&!projectIds.has(c.projectId)).length};
 }finally{library.stop();}
}
module.exports={inspect};
if(require.main===module)inspect(path.resolve(process.argv[2])).then(summary=>process.stdout.write(JSON.stringify({ok:true,summary}))).catch(()=>{process.stdout.write(JSON.stringify({ok:false,error:'PRIVATE_DATA_READER_FAILED'}));process.exitCode=1;});
