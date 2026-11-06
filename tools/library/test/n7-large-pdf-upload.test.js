"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const os=require("node:os"),fs=require("node:fs"),path=require("node:path");
const crypto=require("node:crypto"),{Readable}=require("node:stream");
const {createHandler,MAX_FILE,MAX_CHUNK}=require("../n7-large-pdf-upload");
function request(buffer,headers={}){return Object.assign(Readable.from([buffer]),{method:"POST",headers});}
function make(){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"n7-large-upload-test-"));
 fs.writeFileSync(path.join(tmp,".n7-library-bridge-key"),Buffer.alloc(32,12));
 const replies=[];
 const json=(_res,status,payload)=>replies.push({status,payload});
 const handler=createHandler({dataDir:tmp,json,keyPath:path.join(tmp,".n7-library-bridge-key"),
    fetcher:async (_url,opts)=>{
      assert.equal(opts.headers["Content-Type"],"application/pdf");
      let size=0;let hash=crypto.createHash("sha256");
      for await(const part of opts.body){size+=part.length;hash.update(part);}
      assert.equal(size,opts.headers["Content-Length"]*1);
      const digest=hash.digest("hex");
      assert.equal(digest,opts.headers["X-N7-Library-Digest"]);
      const ts=opts.headers["X-N7-Library-Ts"];
      const sig=crypto.createHmac("sha256",Buffer.alloc(32,12)).update(ts+"."+digest).digest("hex");
      assert.equal(sig,opts.headers["X-N7-Library-Signature"]);
      return {status:201,json:async()=>({status:"DATABASE_COMMITTED",source_id:"a".repeat(64),imported_pages:38,searchable_pages:30,ocr_pending_pages:8})};
    }});
 const call=async(pathname,body,owner={owner:"a"},headers={})=>{
    await handler(request(body,headers),{},pathname,owner);
    return replies.at(-1);
 };
 return {tmp,call,replies};
}
test("private large PDF 26 MB uploads as 4MB chunks and streams to signed gateway",async()=>{
 const x=make();
 const owner={};
 try{
  const size=26*1024*1024+1234;
  const init=await x.call("/api/library/large-pdf/start",Buffer.from(JSON.stringify({filename:"Σαρωμένο βιβλίο.pdf",size})),owner);
  assert.equal(init.status,201);
  assert.equal(MAX_CHUNK,4*1024*1024);
  assert.equal(MAX_FILE,200*1024*1024);
  const id=init.payload.id;
  let offset=0;
  while(offset<size){
    const count=Math.min(MAX_CHUNK,size-offset);
    const data=Buffer.alloc(count,offset===0?37:65);
    if(offset===0)data.write("%PDF-",0,"ascii");
    const reply=await x.call("/api/library/large-pdf/chunk/"+id,data,owner,{"x-upload-offset":String(offset)});
    offset+=count;
    assert.equal(reply.status,200);
    assert.equal(reply.payload.received,offset);
  }
  const done=await x.call("/api/library/large-pdf/finish/"+id,Buffer.alloc(0),owner);
  assert.equal(done.status,201);
  assert.equal(done.payload.ocr_pending_pages,8);
  assert.equal(done.payload.searchable_pages,30);
 }finally{fs.rmSync(x.tmp,{recursive:true,force:true});}
});
test("uploads require exact session and monotonically increasing chunk offsets",async()=>{
 const x=make(),owner={},other={};
 try{
  const init=await x.call("/api/library/large-pdf/start",Buffer.from(JSON.stringify({filename:"book.pdf",size:9})),owner);
  assert.equal(init.status,201);const id=init.payload.id;
  assert.equal((await x.call("/api/library/large-pdf/chunk/"+id,Buffer.alloc(5),other,{"x-upload-offset":"0"})).status,404);
  assert.equal((await x.call("/api/library/large-pdf/chunk/"+id,Buffer.alloc(5),owner,{"x-upload-offset":"9"})).status,409);
  const ok=await x.call("/api/library/large-pdf/chunk/"+id,Buffer.from("%PDF-"),owner,{"x-upload-offset":"0"});
  assert.equal(ok.payload.received,5);
  assert.equal((await x.call("/api/library/large-pdf/finish/"+id,Buffer.alloc(0),owner)).status,409);
  assert.equal((await x.call("/api/library/large-pdf/cancel/"+id,Buffer.alloc(0),owner)).status,200);
 }finally{fs.rmSync(x.tmp,{recursive:true,force:true});}
});
test("limits, unsafe filenames, invalid sessions rejected",async()=>{
 const x=make();
 try{
  assert.equal((await x.call("/api/library/large-pdf/start",Buffer.from(JSON.stringify({filename:"../hack.txt",size:1})))).status,413);
  assert.equal((await x.call("/api/library/large-pdf/start",Buffer.from(JSON.stringify({filename:"a.pdf",size:MAX_FILE+1})))).status,413);
  assert.equal((await x.call("/api/library/large-pdf/start",Buffer.from(JSON.stringify({filename:"a.pdf",size:10})),null)).status,401);
 }finally{fs.rmSync(x.tmp,{recursive:true,force:true});}
});
