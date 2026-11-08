"use strict";
/** N7 private research corpus envelope, AES-256-GCM with domain-separated HKDF.
 * Zero external dependencies; opaque binary files are never intended for the public web.
 */
const fs=require("node:fs");
const crypto=require("node:crypto");
const MAGIC=Buffer.from("N7PRIVATE01","ascii");
const SIZE_CAP=150*1024*1024;
const PURPOSE=/^research:[0-9]{8,20}:(?:[a-z_]+:(?:archive|manifest)|answer)$/;
function derive(secret,purpose){
  if(!Buffer.isBuffer(secret)||secret.length!==32)throw Error("N7_PRIVATE_SECRET_INVALID");
  if(typeof purpose!=="string"||!PURPOSE.test(purpose))throw Error("N7_PRIVATE_PURPOSE_INVALID");
  return Buffer.from(crypto.hkdfSync("sha256",secret,Buffer.from("n7:private:corpus:v1"),
    Buffer.from(purpose,"utf8"),32));
}
function seal(clear,secret,purpose,nonce=crypto.randomBytes(12)){
  if(!Buffer.isBuffer(clear)||clear.length>SIZE_CAP)throw Error("N7_PRIVATE_PLAINTEXT_TOO_LARGE");
  if(!Buffer.isBuffer(nonce)||nonce.length!==12)throw Error("N7_PRIVATE_NONCE_INVALID");
  const derived=derive(secret,purpose);
  const cipher=crypto.createCipheriv("aes-256-gcm",derived,nonce);
  cipher.setAAD(Buffer.from("N7:"+purpose,"utf8"));
  const encrypted=Buffer.concat([cipher.update(clear),cipher.final()]);
  const result=Buffer.concat([MAGIC,nonce,encrypted,cipher.getAuthTag()]);
  derived.fill(0);
  return result;
}
function open(sealed,secret,purpose){
  if(!Buffer.isBuffer(sealed)||sealed.length<MAGIC.length+12+16||
     sealed.length>SIZE_CAP+MAGIC.length+28||!sealed.subarray(0,MAGIC.length).equals(MAGIC))
    throw Error("N7_PRIVATE_ENVELOPE_INVALID");
  const nonce=sealed.subarray(MAGIC.length,MAGIC.length+12);
  const tag=sealed.subarray(sealed.length-16);
  const ciphertext=sealed.subarray(MAGIC.length+12,sealed.length-16);
  const derived=derive(secret,purpose);
  try{
    const decipher=crypto.createDecipheriv("aes-256-gcm",derived,nonce);
    decipher.setAAD(Buffer.from("N7:"+purpose,"utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext),decipher.final()]);
  }finally{derived.fill(0);}
}
function file(input,output,keyFile,purpose,direction){
  if(!["seal","open"].includes(direction))throw Error("N7_PRIVATE_MODE_INVALID");
  const secret=fs.readFileSync(keyFile);
  if(secret.length!==32)throw Error("N7_PRIVATE_KEY_UNAVAILABLE");
  const plain=fs.readFileSync(input);
  const transformed=direction==="seal"?seal(plain,secret,purpose):open(plain,secret,purpose);
  fs.writeFileSync(output,transformed,{mode:0o600,flag:"wx"});
  secret.fill(0);
  console.log("N7_PRIVATE_AEAD_"+direction.toUpperCase()+"_OK",crypto.createHash("sha256").update(transformed).digest("hex"));
}
if(require.main===module){
  if(process.argv.length!==7)throw Error("Usage: node n7_private_aead.js seal|open input output key_file research:RUN:LANE:archive|manifest");
  file(process.argv[3],process.argv[4],process.argv[5],process.argv[6],process.argv[2]);
}
module.exports={seal,open,derive,MAGIC};
