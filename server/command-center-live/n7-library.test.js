"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {createN7Library}=require("./n7-library");
const id="a".repeat(64);
function fixture({auth=false,session=false,origin="",csrf=false,body={query:"Λάντζας"},cli=async()=>({matches:[{title:"Source",scan_index:3,printed_page:"17",excerpt:"Ο Λάντζας"}]})}={}){
  const output={status:0,payload:null};
  const handle=createN7Library({
    json(_r,status,payload){output.status=status;output.payload=payload;},
    readBody:async()=>JSON.stringify(body),
    operatorAuthorized:()=>auth,
    sessionAuthorized:()=>session,runCli:cli
  });
  async function call(method,p,params=""){
    await handle({method,headers:{origin,...(csrf?{"x-nabou-agent-room":"1"}:{})}}, {}, p,new URL("https://example.test"+p+params));
    return {...output};
  }
  return {call};
}
test("anonymous library searches cannot read private pages",async()=>{
  assert.equal((await fixture().call("POST","/n7/library/search")).status,401);
});
test("signed N7 bot requires CSRF header",async()=>{
  assert.equal((await fixture({session:true,origin:"https://bot.piratecartography.com"}).call("POST","/n7/library/search")).status,401);
  const r=await fixture({session:true,origin:"https://bot.piratecartography.com",csrf:true}).call("POST","/n7/library/search");
  assert.equal(r.status,200);assert.equal(r.payload.matches[0].printed_page,"17");
});
test("bearer operator works without browser origin, not untrusted origin",async()=>{
  assert.equal((await fixture({auth:true}).call("POST","/n7/library/search")).status,200);
  assert.equal((await fixture({auth:true,origin:"https://evil.example"}).call("POST","/n7/library/search")).status,401);
});
test("bad queries do not invoke the CLI",async()=>{
  const f=fixture({auth:true,body:{query:"a"},cli:async()=>{throw Error("called");}});
  assert.equal((await f.call("POST","/n7/library/search")).status,400);
  assert.equal((await fixture({auth:true,body:{query:"%\n"}}).call("POST","/n7/library/search")).status,400);
});
test("exact page identifier and method restrictions",async()=>{
  const f=fixture({auth:true,cli:async args=>({source_id:args[1],scan_index:Number(args[2]),ocr_text:"text"})});
  assert.equal((await f.call("GET","/n7/library/page","?source_id="+id+"&scan_index=7")).payload.scan_index,7);
  assert.equal((await f.call("GET","/n7/library/page","?source_id=x&scan_index=7")).status,400);
  assert.equal((await f.call("POST","/n7/library/page")).status,405);
});
test("CLI failure yields no server path or database error details",async()=>{
  const f=fixture({auth:true,cli:async()=>{throw Error("PASSWORD: private");}});
  const r=await f.call("POST","/n7/library/search");
  assert.equal(r.status,503);assert.equal(JSON.stringify(r.payload).includes("PASSWORD"),false);
});
