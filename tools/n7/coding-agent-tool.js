'use strict';
// N7_CODING_AGENT_LINK_V1: connects N7 chat to the EXISTING coding agent (atlas workflow
// nabou-coder-v03.yml: Qwen2.5-Coder 7B, bounded patch engine, tests, draft PR, never merge or
// deploy) and reads real PR / CI state. Only hard-coded repositories and workflow paths are used;
// the owner's text is passed only as the workflow's declared `task` input.
const OWNER='Lepe12';
const REPOS=new Set(['geraki-historical-atlas','independent-ai-bot']);
const CODER={repo:'geraki-historical-atlas',workflow:'nabou-coder-v03.yml'};
// Mirrors ALLOWED_BASENAMES in atlas tools/nabou_coding_agent.py (the workflow re-validates).
const CODER_FILES=new Set(['nabou-shell.css','navigation-rail.css','photon-windows.css','command-deck.css',
 'redesign-v2-panels.css','nabou-shell.js','workspace-insights.js','command-deck.js','redesign-v2-panels.js']);
const DEFAULT_FILES=['jarvis-intelligence-chamber/navigation-rail.css','jarvis-intelligence-chamber/photon-windows.css'];
function token(){return String(process.env.N7_GITHUB_DISPATCH_TOKEN||'').trim();}
function configured(){return Boolean(token());}
function validTask(t){return typeof t==='string'&&t.trim().length>=8&&t.length<=2000&&!/[\u0000-\u0008\u000b-\u001f]/.test(t);}
function normalizeFiles(files){
 const list=(Array.isArray(files)&&files.length?files:DEFAULT_FILES).map(f=>String(f).trim());
 if(list.length<2||list.length>3)throw Error('CODING_FILES_COUNT');
 for(const f of list){const m=/^jarvis-intelligence-chamber\/([a-z0-9-]+\.(?:css|js))$/.exec(f);if(!m||!CODER_FILES.has(m[1]))throw Error('CODING_FILE_NOT_APPROVED');}
 if(new Set(list).size!==list.length)throw Error('CODING_FILES_DUPLICATE');
 return list;
}
async function gh(path,{method='GET',body,fetcher=fetch}={}){
 if(!configured())throw Error('CODING_TOKEN_NOT_CONFIGURED');
 if(!/^\/repos\/Lepe12\/[a-z-]+\//.test(path))throw Error('CODING_PATH_NOT_ALLOWED');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const r=await fetcher('https://api.github.com'+path,{method,redirect:'error',signal:controller.signal,
   headers:{Authorization:'Bearer '+token(),Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',
    'User-Agent':'N7-coding-agent-link/1',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  if(r.status===204)return null;
  const text=await r.text();if(text.length>2e6)throw Error('CODING_RESPONSE_TOO_LARGE');
  if(r.status===401||r.status===403||r.status===404)throw Error('CODING_GITHUB_FORBIDDEN_'+r.status);
  if(!r.ok)throw Error('CODING_GITHUB_HTTP_'+r.status);
  return text?JSON.parse(text):null;
 }finally{clearTimeout(timer);}
}
const run=x=>({id:x.id,status:x.status,conclusion:x.conclusion,url:x.html_url,created_at:x.created_at,title:String(x.display_title||x.name||'').slice(0,200)});
async function dispatch({task,files,apply},{fetcher=fetch,now=()=>Date.now(),wait=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 if(!validTask(task))throw Error('CODING_INVALID_TASK');
 const list=normalizeFiles(files),started=now();
 await gh(`/repos/${OWNER}/${CODER.repo}/actions/workflows/${CODER.workflow}/dispatches`,{method:'POST',fetcher,
  body:{ref:'main',inputs:{task:task.trim(),target_files:list.join(','),apply_changes:apply===true}}});
 // workflow_dispatch returns no run id: find the run this request created.
 for(let i=0;i<6;i++){
  await wait(i?2500:1500);
  const d=await gh(`/repos/${OWNER}/${CODER.repo}/actions/workflows/${CODER.workflow}/runs?event=workflow_dispatch&per_page=5`,{fetcher});
  const hit=(d?.workflow_runs||[]).find(x=>Date.parse(x.created_at)>=started-5000);
  if(hit)return {schema:'n7-coding-dispatch-v1',repo:CODER.repo,files:list,apply:apply===true,run:run(hit),merged_or_deployed:false};
 }
 return {schema:'n7-coding-dispatch-v1',repo:CODER.repo,files:list,apply:apply===true,run:null,merged_or_deployed:false};
}
async function runStatus(id,{fetcher=fetch}={}){
 if(!/^[0-9]{1,20}$/.test(String(id)))throw Error('CODING_INVALID_RUN');
 const r=await gh(`/repos/${OWNER}/${CODER.repo}/actions/runs/${id}`,{fetcher});
 const branch=`agent/nabou-coder7b-${r.id}`;
 const prs=r.status==='completed'?await gh(`/repos/${OWNER}/${CODER.repo}/pulls?state=all&head=${OWNER}:${branch}`,{fetcher}):[];
 return {schema:'n7-coding-run-v1',run:run(r),pull_request:prs?.[0]?{number:prs[0].number,url:prs[0].html_url,draft:prs[0].draft,state:prs[0].state}:null};
}
async function latestPr(repo,{fetcher=fetch}={}){
 if(!REPOS.has(repo))throw Error('CODING_REPO_NOT_ALLOWED');
 const list=await gh(`/repos/${OWNER}/${repo}/pulls?state=all&sort=created&direction=desc&per_page=1`,{fetcher});
 const p=list?.[0];if(!p)return {schema:'n7-pr-review-v1',repo,pull_request:null};
 const checks=await gh(`/repos/${OWNER}/${repo}/commits/${p.head.sha}/check-runs?per_page=50`,{fetcher});
 const runs=(checks?.check_runs||[]).map(c=>({name:String(c.name).slice(0,120),status:c.status,conclusion:c.conclusion,url:c.html_url}));
 return {schema:'n7-pr-review-v1',repo,pull_request:{number:p.number,title:String(p.title).slice(0,300),url:p.html_url,state:p.merged_at?'merged':p.state,
  draft:p.draft,author:p.user?.login||'',head:p.head.ref,created_at:p.created_at,updated_at:p.updated_at},checks:runs,
  summary:{total:runs.length,success:runs.filter(c=>c.conclusion==='success').length,failure:runs.filter(c=>['failure','timed_out','cancelled','action_required'].includes(c.conclusion)).length,pending:runs.filter(c=>c.status!=='completed').length}};
}
module.exports={dispatch,runStatus,latestPr,configured,validTask,normalizeFiles,DEFAULT_FILES,CODER_FILES,REPOS};
