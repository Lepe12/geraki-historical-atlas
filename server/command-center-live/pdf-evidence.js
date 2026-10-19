"use strict";
const {execFile}=require("node:child_process");
const path=require("node:path");
let busy=false;
async function replayPdf(filename){
  if(busy)throw new Error("PDF_PARSER_BUSY");
  busy=true;
  try{return await new Promise((resolve,reject)=>{
    execFile(process.env.PCT_PYTHON_BIN||"python3",[path.join(__dirname,"pdf-evidence.py"),filename],
      {timeout:150000,maxBuffer:32*1024*1024},(error,stdout)=>{
        let value;try{value=JSON.parse(stdout);}catch(_){return reject(new Error("PDF_PARSER_UNAVAILABLE_OR_TIMEOUT"));}
        if(error||value.error)return reject(new Error(value.error||"PDF_PARSER_FAILED"));
        resolve(value);
      });
  });}finally{busy=false;}
}
module.exports={replayPdf};
