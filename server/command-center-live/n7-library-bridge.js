"use strict";
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const KEY_FILE=path.join(__dirname,".n7-library-bridge-key");
function verifyLibraryBridge(req,body,now=Math.floor(Date.now()/1000)){
  const headers=req.headers||{};
  if(headers.origin)return false; // server-to-server requests only
  const ts=String(headers["x-n7-library-ts"]||"");
  const mac=String(headers["x-n7-library-signature"]||"");
  if(!/^[0-9]{10,11}$/.test(ts)||!/^[a-f0-9]{64}$/.test(mac))return false;
  if(Math.abs(now-Number(ts))>60||typeof body!=="string"||Buffer.byteLength(body)>4096)return false;
  let key;
  try{key=fs.readFileSync(KEY_FILE);}catch(_){return false;}
  if(key.length!==32)return false;
  const expected=crypto.createHmac("sha256",key).update(ts+"."+body).digest();
  return crypto.timingSafeEqual(expected,Buffer.from(mac,"hex"));
}
module.exports={verifyLibraryBridge};
