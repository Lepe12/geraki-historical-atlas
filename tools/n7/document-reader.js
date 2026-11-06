'use strict';
// N7_DOCUMENT_READER_V1: public HTTPS only, DNS pinned per hop, bounded parsing.
const https=require('node:https'),dns=require('node:dns').promises,net=require('node:net');
const {Worker}=require('node:worker_threads');
function publicIP(ip){
 if(net.isIP(ip)===4){const a=ip.split('.').map(Number);return !(a[0]===0||a[0]===10||a[0]===127||a[0]>=224||a[0]===169&&a[1]===254||a[0]===172&&a[1]>=16&&a[1]<=31||a[0]===192&&(a[1]===168||a[1]===0)||a[0]===100&&a[1]>=64&&a[1]<=127||a[0]===198&&(a[1]===18||a[1]===19));}
 // Only global unicast IPv6; reject mapped v4, local, multicast and transitions.
 return net.isIP(ip)===6&&/^2[0-9a-f]{3}:/i.test(ip)&&!/^200[12]:/i.test(ip)&&!/^2001:(?:0:|db8:)/i.test(ip);
}
function validateURL(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||u.href.length>1800||u.hostname.endsWith('.local')||u.hostname==='localhost')throw Error('unsafe_url');return u;}
async function resolvePublic(host,lookup=dns.lookup){
 host=host.replace(/^\[|\]$/g,'');
 const addresses=net.isIP(host)?[{address:host,family:net.isIP(host)}]:await lookup(host,{all:true,verbatim:true});
 if(!addresses.length||addresses.some(a=>!publicIP(a.address)))throw Error('private_address');
 return addresses.find(a=>a.family===4)||addresses[0];
}
async function fetchPublic(value,{timeout=6500,maxBytes=5*1024*1024,lookup=dns.lookup,request=https.request}={}){
 const deadline=Date.now()+timeout;
 for(let hop=0;hop<4;hop++){
  const u=validateURL(value),remaining=deadline-Date.now();if(remaining<=0)throw Error('timeout');
  let timer;const addr=await Promise.race([resolvePublic(u.hostname,lookup),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),remaining)})]).finally(()=>clearTimeout(timer));
  const response=await new Promise((resolve,reject)=>{
   const req=request(u,{method:'GET',agent:false,lookup:(_h,opt,cb)=>cb(null,opt?.all?[addr]:addr.address,addr.family),headers:{'User-Agent':'N7PublicResearch/1.0 (https://piratecartography.com)','Accept':'text/html,application/pdf,text/plain;q=0.8','Accept-Encoding':'identity'}},res=>{
    const status=res.statusCode||0;
    if(status>=300&&status<400){res.resume();resolve({status,location:res.headers.location});return;}
    if(status!==200){res.resume();reject(Error('http_'+status));return;}
    if(Number(res.headers['content-length']||0)>maxBytes){res.destroy();reject(Error('too_large'));return;}
    const chunks=[];let count=0;
    res.on('data',c=>{count+=c.length;if(count>maxBytes){res.destroy(Error('too_large'));return;}chunks.push(c)});
    res.on('end',()=>resolve({status,body:Buffer.concat(chunks),type:String(res.headers['content-type']||'').toLowerCase(),url:u.href}));res.on('error',reject);
   });
   const kill=setTimeout(()=>req.destroy(Error('timeout')),Math.max(1,deadline-Date.now()));
   req.on('close',()=>clearTimeout(kill));req.on('error',reject);req.end();
  });
  if(response.location){value=new URL(response.location,u).href;continue;}
  return response;
 }
 throw Error('redirect_limit');
}
function robotsAllowed(text,path){
 const groups=[];let agents=[],rules=[],inRules=false;
 const flush=()=>{if(agents.length)groups.push({agents,rules});agents=[];rules=[];inRules=false;};
 for(const raw of text.split(/\r?\n/)){const line=raw.split('#')[0].trim(),ix=line.indexOf(':');if(ix<0)continue;const k=line.slice(0,ix).trim().toLowerCase(),v=line.slice(ix+1).trim();
  if(k==='user-agent'){if(inRules)flush();agents.push(v.toLowerCase());}else if((k==='allow'||k==='disallow')&&agents.length){rules.push({allow:k==='allow',value:v});inRules=true;}
 }flush();
 const exact=groups.filter(g=>g.agents.some(a=>a!=='*'&&'n7publicresearch'.includes(a)));
 const chosen=exact.length?exact:groups.filter(g=>g.agents.includes('*'));let best=null;
 for(const g of chosen)for(const r of g.rules){if(!r.value)continue;const end=r.value.endsWith('$');let pattern=r.value.replace(/\$$/,'').split('*').map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*');
  if(new RegExp('^'+pattern+(end?'$':'')).test(path)&&(!best||r.value.length>best.value.length||r.value.length===best.value.length&&r.allow))best=r;
 }return !best||best.allow;
}
async function pdfText(buffer,{timeout=6500,maxPages=80,maxChars=26000}={}){
 if(buffer.length>5*1024*1024||buffer.subarray(0,5).toString()!=='%PDF-')throw Error('invalid_pdf');
 return new Promise((resolve,reject)=>{
  const worker=new Worker(require.resolve('./pdf-reader-worker.cjs'),{workerData:{bytes:Uint8Array.from(buffer),maxPages,maxChars},resourceLimits:{maxOldGenerationSizeMb:192}});
  const timer=setTimeout(()=>{worker.terminate();reject(Error('pdf_timeout'))},timeout);
  const finish=()=>{clearTimeout(timer);worker.terminate();};
  worker.once('message',m=>{finish();m.error?reject(Error(m.error)):resolve(m)});
  worker.once('error',e=>{finish();reject(Error('pdf_parse_failed'))});
  worker.once('exit',code=>{clearTimeout(timer);if(code!==0)reject(Error('pdf_worker_stopped'))});
 });
}
function htmlText(html){
 if(/verify you are human|checking your browser|cf-chl-|captcha-container/i.test(html))throw Error('access_challenge');
 let main=html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]||html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]||html;
 return main.replace(/<(script|style|nav|footer|header|aside|form|svg|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<(?:p|h[1-6]|div|br|li)\b[^>]*>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&#x([\da-f]+);/gi,(_,n)=>String.fromCodePoint(Math.min(parseInt(n,16),0x10ffff))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(+n,0x10ffff))).replace(/&(?:amp|lt|gt|quot|apos|nbsp);/gi,s=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '})[s.toLowerCase()]).replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim().slice(0,26000);
}
async function readDocument(url,{fetcher=fetchPublic}={}){
 const u=validateURL(url);
 // No authenticated browsing and no attempts to bypass robots, paywalls or challenges.
 try{const robots=await fetcher(u.origin+'/robots.txt',{timeout:1800,maxBytes:120000});if(!robotsAllowed(robots.body.toString('utf8'),u.pathname+u.search))throw Error('robots_disallowed');}
 catch(e){if(!/^http_40[04]$/.test(e.message))throw e;}
 const r=await fetcher(u.href,{timeout:4500});
 // Recheck destination robots if the source redirected across origins.
 if(new URL(r.url).origin!==u.origin){const dest=new URL(r.url);try{const robots=await fetcher(dest.origin+'/robots.txt',{timeout:1800,maxBytes:120000});if(!robotsAllowed(robots.body.toString('utf8'),dest.pathname+dest.search))throw Error('robots_disallowed');}catch(e){if(!/^http_40[04]$/.test(e.message))throw e;}}
 if(r.body.subarray(0,5).toString()==='%PDF-')return {...await pdfText(r.body),url:r.url,type:'pdf'};
 if(!/text\/html|application\/xhtml\+xml|text\/plain/.test(r.type))throw Error('unsupported_content_type');
 const text=r.type.includes('text/plain')?r.body.toString('utf8').slice(0,26000):htmlText(r.body.toString('utf8'));
 if(text.length<100)throw Error('no_readable_text');
 return {text,url:r.url,type:'html',partial:text.length>=26000};
}
module.exports={publicIP,validateURL,resolvePublic,fetchPublic,robotsAllowed,pdfText,htmlText,readDocument};
