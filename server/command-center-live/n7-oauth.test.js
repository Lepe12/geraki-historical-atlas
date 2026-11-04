"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {createN7OAuth,configured,makeSigned,verifySigned,cookieHeader}=require("./n7-oauth");
const ENV={PCT_OPERATOR_TOKEN:"a".repeat(64),PCT_GITHUB_OAUTH_CLIENT_ID:"test-client",PCT_GITHUB_OAUTH_CLIENT_SECRET:"test-secret",PCT_GITHUB_OAUTH_ALLOWED_ID:"202093171"};
function rig({env=ENV,exchange,clock=Date.now()}={}) {
  const responses=[];
  const json=(res,status,data,headers={})=>responses.push({status,data,headers});
  const oauth=createN7OAuth({json,env,now:()=>clock,exchange:exchange|| (async()=>{throw Error("no_calls_expected");})});
  async function call(path,{method="GET",cookie="",origin="",csrf="",url=path}={}){
    const headers={cookie,origin,"x-nabou-agent-room":csrf};
    const res={writeHead(status,h){responses.push({status,headers:h});},end(){}};
    const result=await oauth.handle({method,url,headers},res,path);
    return {handled:result,...responses.at(-1)};
  }
  return {oauth,call};
}
test("OAuth fail closed without configured identity and secret",async()=>{
  const x=rig({env:{PCT_OPERATOR_TOKEN:"a".repeat(64)}});
  assert.equal(configured({}),false);
  assert.equal((await x.call("/n7/auth/start")).status,503);
  assert.equal((await x.call("/n7/auth/session")).data.authenticated,false);
});
test("OAuth starts only with state cookie, no token in browser",async()=>{
  const x=rig();
  const r=await x.call("/n7/auth/start");
  assert.equal(r.status,302);
  assert.equal(new URL(r.headers.location).hostname,"github.com");
  assert.equal(new URL(r.headers.location).searchParams.get("redirect_uri"),"https://pct-live.piratecartography.com/pct-api/live/n7/auth/callback");
  assert.match(r.headers["set-cookie"],/HttpOnly/);
  assert.doesNotMatch(r.headers.location,/test-secret/);
});
test("OAuth callback cannot bypass state cookie",async()=>{
  const x=rig();
  assert.equal((await x.call("/n7/auth/callback",{url:"/pct-api/live/n7/auth/callback?code=testcode&state=bad"})).status,403);
});
test("OAuth permits exactly one GitHub ID and sets HttpOnly cookie",async()=>{
  const calls=[];
  const x=rig({exchange:async(url,args)=>{
    calls.push(url);
    if(url.includes("access_token"))return {access_token:"short-lived-token"};
    return {id:202093171,login:"Lepe12"};
  }});
  const start=await x.call("/n7/auth/start");
  const sc=start.headers["set-cookie"].split(";")[0];
  const state=new URL(start.headers.location).searchParams.get("state");
  const callback=await x.call("/n7/auth/callback",{
    cookie:sc,url:"/pct-api/live/n7/auth/callback?code=testOAuth123&state="+state});
  assert.equal(callback.status,302);
  assert.equal(callback.headers.location,"https://bot.piratecartography.com/");
  assert.equal(calls.length,2);
  const sessionCookie=callback.headers["set-cookie"][1];
  assert.match(sessionCookie,/HttpOnly/);
  const browserCookie=sessionCookie.split(";")[0];
  const status=await x.call("/n7/auth/session",{cookie:browserCookie});
  assert.equal(status.data.authenticated,true);
  assert.equal(x.oauth.sessionAuthorized({headers:{cookie:browserCookie}}),true);
  const logout=await x.call("/n7/auth/logout",{method:"POST",cookie:browserCookie,origin:"https://bot.piratecartography.com",csrf:"1"});
  assert.equal(logout.status,200);
  assert.match(logout.headers["set-cookie"],/Max-Age=0/);
});
test("Unauthorized GitHub ID never receives a session cookie",async()=>{
  const x=rig({exchange:async url=>url.includes("access_token")?{access_token:"xyz"}:{id:9999}});
  const start=await x.call("/n7/auth/start");
  const cookie=start.headers["set-cookie"].split(";")[0];
  const state=new URL(start.headers.location).searchParams.get("state");
  const response=await x.call("/n7/auth/callback",{cookie,url:"/pct-api/live/n7/auth/callback?code=validCode123&state="+state});
  assert.equal(response.status,403);
  assert.equal(response.data.error,"github_user_not_allowed");
});
test("Tampered or expired sessions are always rejected",async()=>{
  const now=Date.now();
  const x=rig({clock:now});
  const a=makeSigned(ENV.PCT_OPERATOR_TOKEN,{kind:"n7-github",uid:"202093171",exp:Math.floor(now/1000)-1});
  const b=makeSigned(ENV.PCT_OPERATOR_TOKEN,{kind:"n7-github",uid:"9999",exp:Math.floor(now/1000)+600});
  for(const v of [a,b,a+"changed"]){
    assert.equal(x.oauth.sessionAuthorized({headers:{cookie:"nabou_agent_login="+v}}),false);
  }
  assert.equal(verifySigned(ENV.PCT_OPERATOR_TOKEN,makeSigned(ENV.PCT_OPERATOR_TOKEN,{a:1})).a,1);
  assert.match(cookieHeader("test","abc",60),/Secure; SameSite=Lax; HttpOnly/);
});
test("Logout rejects CSRF requests",async()=>{
  const x=rig();
  const r=await x.call("/n7/auth/logout",{method:"POST",origin:"https://evil.example",csrf:"1"});
  assert.equal(r.status,403);
});
