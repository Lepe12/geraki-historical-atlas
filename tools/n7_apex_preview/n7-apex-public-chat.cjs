'use strict';
// Stateless public figure chat. No owner conversations, files, tools or sessions.
function createApexPublicChat({apiKey,model,base,fetchImpl=fetch,now=Date.now,maxPerHour=60}){
 const origin='https://bot.piratecartography.com';let active=0,windowStart=now(),total=0;const visitors=new Map();
 const reply=(res,status,data,extra={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});res.end(JSON.stringify(data));};
 async function handle(req,res){
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(!['/api/n7-apex/chat','/api/n7-apex/status'].includes(pathname))return false;
  const configured=Boolean(apiKey&&model&&base);
  if(pathname.endsWith('/status')){reply(res,req.method==='GET'?200:405,req.method==='GET'?{passwordRequired:false,available:configured,privateHistory:false}:{error:'Method not allowed'});return true;}
  if(req.method!=='POST'){reply(res,405,{error:'Method not allowed'},{Allow:'POST'});return true;}
  if(req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site'){reply(res,403,{error:'Invalid origin'});return true;}
  if(!configured){reply(res,503,{error:'Η συνομιλία δεν είναι διαθέσιμη αυτή τη στιγμή.'});return true;}
  if(!(req.headers['content-type']||'').toLowerCase().startsWith('application/json')){reply(res,415,{error:'Expected JSON'});return true;}
  const timestamp=now();if(timestamp-windowStart>=3600000){windowStart=timestamp;total=0;visitors.clear();}
  const ip=req.socket?.remoteAddress||'unknown',previous=visitors.get(ip)||[];
  const recent=previous.filter(t=>timestamp-t<60000);
  if(total>=maxPerHour||recent.length>=6||active>=2||visitors.size>=256&&!visitors.has(ip)){reply(res,429,{error:'Πολλά μηνύματα μαζί. Δοκίμασε ξανά σε λίγο.'},{'Retry-After':'60'});return true;}
  let data;
  try{let chunks=[],size=0;for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>24000)throw Error('large');chunks.push(Buffer.from(chunk));}data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{reply(res,400,{error:'Μη έγκυρο μήνυμα.'});return true;}
  const rows=data?.messages;
  if(!Array.isArray(rows)||!rows.length||rows.length>12||rows.at(-1)?.role!=='user'||rows.some(m=>!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string'||!m.content.trim()||m.content.length>2000)||rows.reduce((n,m)=>n+m.content.length,0)>12000){reply(res,400,{error:'Το μήνυμα είναι πολύ μεγάλο ή μη έγκυρο.'});return true;}
  // Body reading yields: recheck shared limits before reserving provider work.
  const currentRecent=(visitors.get(ip)||[]).filter(t=>now()-t<60000);
  if(total>=maxPerHour||currentRecent.length>=6||active>=2){reply(res,429,{error:'Πολλά μηνύματα μαζί. Δοκίμασε ξανά σε λίγο.'},{'Retry-After':'60'});return true;}
  // Reserve quota before contacting the existing configured model; no retries.
  total++;if(visitors.size<256||visitors.has(ip))visitors.set(ip,[...currentRecent,now()]);active++;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);let disconnected=false;
  const close=()=>{if(!res.writableEnded){disconnected=true;controller.abort();}};res.on('close',close);
  try{
   const endpoint=new URL(String(base).replace(/\/$/,'')+'/chat/completions');if(endpoint.protocol!=='https:')throw Error('endpoint');
   const request={model,messages:[{role:'system',content:'Είσαι το N7, ένας χρήσιμος βοηθός. Απάντησε στα ελληνικά, καθαρά και σύντομα. Αυτή η συνομιλία είναι ανεξάρτητη: δεν έχεις πρόσβαση σε προσωπικά αρχεία, αποθηκευμένες συνομιλίες ή εργαλεία του ιδιοκτήτη. Μην ισχυρίζεσαι ότι εκτέλεσες ενέργειες.'},...rows.map(m=>({role:m.role,content:m.content.trim()}))],temperature:0.3,max_completion_tokens:768};
   if(endpoint.hostname==='api.groq.com'&&String(model).startsWith('qwen/'))request.reasoning_effort='none';
   const result=await fetchImpl(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+apiKey},body:JSON.stringify(request),signal:controller.signal});
   if(!result.ok){if(!disconnected)reply(res,result.status===429?429:502,{error:result.status===429?'Το μοντέλο έχει προσωρινό όριο χρήσης. Δοκίμασε ξανά σε λίγο.':'Το μοντέλο δεν απάντησε. Δοκίμασε ξανά.'});return true;}
   const answer=(await result.json())?.choices?.[0]?.message?.content;
   if(typeof answer!=='string'||!answer.trim()||answer.length>16000)throw Error('response');
   if(!disconnected)reply(res,200,{reply:answer.trim(),passwordRequired:false});
  }catch{if(!disconnected)reply(res,502,{error:'Η απάντηση δεν ολοκληρώθηκε. Δοκίμασε ξανά.'});}
  finally{active--;clearTimeout(timer);res.removeListener('close',close);}
  return true;
 }
 return {handle};
}
module.exports={createApexPublicChat};
