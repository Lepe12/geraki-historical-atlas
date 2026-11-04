"use strict";
const crypto=require("node:crypto");
const https=require("node:https");

const OAUTH_CALLBACK="https://pct-live.piratecartography.com/pct-api/live/n7/auth/callback";
const ROOM_URL="https://bot.piratecartography.com/";
const SESSION_COOKIE="nabou_agent_login";
const STATE_COOKIE="nabou_oauth_state";
const SESSION_SECONDS=30*24*3600;
const STATE_SECONDS=600;
const COOKIE_DOMAIN="piratecartography.com";

function configured(env=process.env) {
  return Boolean(env.PCT_GITHUB_OAUTH_CLIENT_ID && env.PCT_GITHUB_OAUTH_CLIENT_SECRET &&
    /^[0-9]+$/.test(String(env.PCT_GITHUB_OAUTH_ALLOWED_ID||"")) &&
    String(env.PCT_OPERATOR_TOKEN||"").length>=32);
}
function sign(key,payload) {
  return crypto.createHmac("sha256",key).update(payload).digest("base64url");
}
function equal(a,b) {
  const x=Buffer.from(String(a||"")),y=Buffer.from(String(b||""));
  return x.length>0&&x.length===y.length&&crypto.timingSafeEqual(x,y);
}
function makeSigned(key,fields) {
  const payload=Buffer.from(JSON.stringify(fields)).toString("base64url");
  return payload+"."+sign(key,payload);
}
function verifySigned(key,value) {
  if(!value||value.length>1500)return null;
  const i=value.lastIndexOf(".");
  if(i<=0)return null;
  const payload=value.slice(0,i);
  if(!equal(value.slice(i+1),sign(key,payload)))return null;
  try{return JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));}
  catch(_){return null;}
}
function cookie(req,name) {
  const raw=String(req.headers.cookie||"");
  const item=raw.split(/;\s*/).find(x=>x.startsWith(name+"="));
  return item?item.slice(name.length+1):"";
}
function cookieHeader(name,value,maxAge,httpOnly=true) {
  return name+"="+value+"; Path=/; Domain="+COOKIE_DOMAIN+
    "; Max-Age="+maxAge+"; Secure; SameSite=Lax"+(httpOnly?"; HttpOnly":"");
}
function requestJson(url,{method="GET",headers={},body=null}={}) {
  return new Promise((resolve,reject)=>{
    const u=new URL(url);
    if(!["api.github.com","github.com"].includes(u.hostname)||u.protocol!=="https:")return reject(new Error("unsafe_oauth_upstream"));
    const req=https.request(u,{method,headers:{"user-agent":"nabou-n7-github-login/1","accept":"application/json",...headers},timeout:10000},r=>{
      let data="";r.setEncoding("utf8");r.on("data",c=>{data+=c;if(data.length>65536)r.destroy(new Error("upstream_response_too_large"));});
      r.on("end",()=>{if(r.statusCode<200||r.statusCode>=300)return reject(new Error("oauth_http_"+r.statusCode));try{resolve(JSON.parse(data));}catch(_){reject(new Error("oauth_invalid_json"));}});
    });
    req.on("timeout",()=>req.destroy(new Error("oauth_timeout")));
    req.on("error",reject);
    req.end(body);
  });
}
function createN7OAuth({json,exchange=requestJson,env=process.env,now=()=>Date.now()}) {
  function secret() {return String(env.PCT_OPERATOR_TOKEN||"");}
  function sessionAuthorized(req) {
    if(!configured(env))return false;
    const fields=verifySigned(secret(),cookie(req,SESSION_COOKIE));
    return Boolean(fields&&fields.kind==="n7-github"&&String(fields.uid)===String(env.PCT_GITHUB_OAUTH_ALLOWED_ID) &&
      Number.isSafeInteger(fields.exp)&&fields.exp>Math.floor(now()/1000));
  }
  async function handle(req,res,p) {
    if(!["/n7/auth/start","/n7/auth/callback","/n7/auth/session","/n7/auth/logout"].includes(p))return false;
    if(p==="/n7/auth/session") {
      if(req.method!=="GET")return json(res,405,{error:"method_not_allowed"}),true;
      return json(res,200,{authenticated:sessionAuthorized(req),login_available:configured(env)}),true;
    }
    if(p==="/n7/auth/logout") {
      if(req.method!=="POST")return json(res,405,{error:"method_not_allowed"}),true;
      if(req.headers.origin!=="https://bot.piratecartography.com"||req.headers["x-nabou-agent-room"]!=="1")
        return json(res,403,{error:"origin_not_allowed"}),true;
      json(res,200,{status:"LOGGED_OUT"},{"set-cookie":cookieHeader(SESSION_COOKIE,"",0)});
      return true;
    }
    if(req.method!=="GET")return json(res,405,{error:"method_not_allowed"}),true;
    if(!configured(env)) {
      if(p==="/n7/auth/start")return json(res,503,{error:"github_login_not_configured"}),true;
      return json(res,503,{error:"github_login_not_configured"}),true;
    }
    if(p==="/n7/auth/start") {
      const state=crypto.randomBytes(32).toString("base64url");
      const fields={kind:"oauth-state",state,exp:Math.floor(now()/1000)+STATE_SECONDS};
      const url=new URL("https://github.com/login/oauth/authorize");
      url.searchParams.set("client_id",env.PCT_GITHUB_OAUTH_CLIENT_ID);
      url.searchParams.set("redirect_uri",OAUTH_CALLBACK);
      url.searchParams.set("state",state);
      url.searchParams.set("scope","read:user");
      res.writeHead(302,{"location":url.toString(),"cache-control":"no-store",
        "set-cookie":cookieHeader(STATE_COOKIE,makeSigned(secret(),fields),STATE_SECONDS)});
      res.end();return true;
    }
    // Callback: state + server signed cookie protect against login CSRF.
    const u=new URL(req.url,"https://pct-live.piratecartography.com");
    const state=String(u.searchParams.get("state")||"");
    const code=String(u.searchParams.get("code")||"");
    const fields=verifySigned(secret(),cookie(req,STATE_COOKIE));
    const clear=cookieHeader(STATE_COOKIE,"",0);
    if(!fields||fields.kind!=="oauth-state"||fields.exp<=Math.floor(now()/1000)||
       !equal(state,fields.state)||!/^[-a-zA-Z0-9_]{6,200}$/.test(code)) {
      json(res,403,{error:"oauth_state_invalid"},{"set-cookie":clear});return true;
    }
    try {
      const args=new URLSearchParams({client_id:env.PCT_GITHUB_OAUTH_CLIENT_ID,
        client_secret:env.PCT_GITHUB_OAUTH_CLIENT_SECRET,code,redirect_uri:OAUTH_CALLBACK,state});
      const token=await exchange("https://github.com/login/oauth/access_token",{
        method:"POST",headers:{"content-type":"application/x-www-form-urlencoded","accept":"application/json"},body:args.toString()});
      if(token.error||!token.access_token)throw new Error("oauth_token_failed");
      const user=await exchange("https://api.github.com/user",{headers:{"authorization":"Bearer "+token.access_token,"accept":"application/vnd.github+json"}});
      if(String(user.id)!==String(env.PCT_GITHUB_OAUTH_ALLOWED_ID)){
        json(res,403,{error:"github_user_not_allowed"},{"set-cookie":clear});return true;
      }
      const session=makeSigned(secret(),{kind:"n7-github",uid:String(user.id),
        exp:Math.floor(now()/1000)+SESSION_SECONDS,nonce:crypto.randomBytes(12).toString("hex")});
      res.writeHead(302,{"location":ROOM_URL,"cache-control":"no-store",
        "set-cookie":[clear,cookieHeader(SESSION_COOKIE,session,SESSION_SECONDS)]});
      res.end();return true;
    }catch(_){json(res,502,{error:"github_oauth_failed"},{"set-cookie":clear});return true;}
  }
  return {handle,sessionAuthorized};
}
module.exports={createN7OAuth,configured,makeSigned,verifySigned,cookieHeader,SESSION_COOKIE};
