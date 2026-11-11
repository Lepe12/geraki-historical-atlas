"use strict";
// «Ρώτα τον Καπετάνιο»: public chat for piratecartography.com visitors.
// Answers ONLY from site-index.json (public WordPress texts, rebuilt weekly by site-chat-build.js); never calls WordPress at request time.
// Routes: POST /site/ask {question}  GET /site/captain.jpg  GET /site/thumbs/<mediaId>.<ext>  GET /site/widget.js  GET /site/status
const fs=require("fs"),path=require("path");
const {createAsk}=require("./site-ask-core");
const LIMIT=20,WINDOW_MS=10*60*1000,MAX_TRACKED=5000;
const MIME={jpg:"image/jpeg",png:"image/png",webp:"image/webp",gif:"image/gif"};
function createSiteChat({dir=__dirname,publicBase=process.env.PCT_SITE_CHAT_PUBLIC_BASE||"https://pct-live.piratecartography.com",now=()=>Date.now()}={}){
  let state=null;
  function load(){
    if(state)return state;
    const index=JSON.parse(fs.readFileSync(path.join(dir,"site-index.json"),"utf8"));
    const assets=JSON.parse(fs.readFileSync(path.join(dir,"site-chat-assets.json"),"utf8"));
    for(const it of index.items)it.image=it.thumb?publicBase+"/site/thumbs/"+it.thumb:null;
    let widget="";try{widget=fs.readFileSync(path.join(dir,"site-widget.js"),"utf8");}catch{}
    state={index,assets,ask:createAsk(index),widget,captain:assets.captain?Buffer.from(assets.captain,"base64"):null};
    return state;
  }
  const hits=new Map();
  function allowed(ip){
    const t=now(),list=(hits.get(ip)||[]).filter(x=>t-x<WINDOW_MS);
    if(list.length>=LIMIT){hits.set(ip,list);return false;}
    list.push(t);hits.delete(ip);hits.set(ip,list);
    if(hits.size>MAX_TRACKED)hits.delete(hits.keys().next().value);
    return true;
  }
  function clientIp(req){return String(req.headers["x-forwarded-for"]||req.headers["x-real-ip"]||req.socket?.remoteAddress||"?").split(",")[0].trim();}
  function send(res,status,type,body,extra={}){
    res.writeHead(status,{"content-type":type,"x-content-type-options":"nosniff","access-control-allow-origin":"*",...extra});res.end(body);
  }
  async function handle(req,res,p,{json,readBody}){
    if(!p.startsWith("/site/"))return false;
    let s;try{s=load();}catch(e){json(res,503,{error:"site_index_unavailable"});return true;}
    if(req.method==="POST"&&p==="/site/ask"){
      if(!allowed(clientIp(req))){json(res,429,{error:"too_many_questions",answer:"Πολλές ερωτήσεις σε λίγο χρόνο. Δοκίμασε ξανά σε λίγα λεπτά."},{"retry-after":"600"});return true;}
      let body;try{body=JSON.parse(await readBody(req,4096));}catch{json(res,400,{error:"invalid_json"});return true;}
      const q=String(body?.question||"").replace(/\s+/g," ").trim().slice(0,200);
      if(q.length<2){json(res,400,{error:"empty_question"});return true;}
      const r=s.ask(q);
      json(res,200,{...r,links:(r.links||[]).map(l=>({title:l.title,type:l.type||null,url:l.url,image:l.image||null,snippet:l.snippet||null}))});return true;
    }
    if(req.method!=="GET"&&req.method!=="HEAD")return false;
    if(p==="/site/captain.jpg"&&s.captain){send(res,200,"image/jpeg",req.method==="HEAD"?undefined:s.captain,{"cache-control":"public, max-age=604800"});return true;}
    if(p==="/site/widget.js"&&s.widget){send(res,200,"application/javascript; charset=utf-8",req.method==="HEAD"?undefined:s.widget,{"cache-control":"public, max-age=3600"});return true;}
    if(p==="/site/status"){json(res,200,{status:"PASS",items:s.index.count,built_at:s.index.built_at,thumbs:Object.keys(s.assets.thumbs||{}).length});return true;}
    const m=p.match(/^\/site\/thumbs\/(\d+)\.(jpg|png|webp|gif)$/);
    if(m){const t=s.assets.thumbs?.[m[1]];
      if(!t||t.ext!==m[2]){send(res,404,"text/plain; charset=utf-8","not found");return true;}
      send(res,200,MIME[t.ext],req.method==="HEAD"?undefined:Buffer.from(t.b64,"base64"),{"cache-control":"public, max-age=604800"});return true;}
    return false;
  }
  return {handle,allowed,load};
}
module.exports={createSiteChat};
