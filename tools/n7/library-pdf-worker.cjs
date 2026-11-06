'use strict';
const {parentPort,workerData}=require('node:worker_threads');
(async()=>{
 globalThis.DOMMatrix=require('./vendor/geometry.cjs').DOMMatrix;
 const pdfjs=await import('./vendor/pdf.mjs');
 pdfjs.GlobalWorkerOptions.workerSrc=require('node:url').pathToFileURL(require('node:path').join(__dirname,'vendor/pdf.worker.mjs')).href;
 const task=pdfjs.getDocument({...(workerData.file?{url:workerData.file}:{data:workerData.bytes}),isEvalSupported:false,useSystemFonts:false,disableFontFace:true,useWorkerFetch:false,verbosity:0});
 let doc;
 try{
  doc=await task.promise;const pages=[],emptyPages=[];let length=0,read=0,partial=false;
  const start=workerData.startPage||1;
  for(let n=start;n<=Math.min(doc.numPages,start+workerData.maxPages-1);n++){
   const page=await doc.getPage(n),content=await page.getTextContent();
   const raw=content.items.map(x=>x.str+(x.hasEOL?'\n':' ')).join('').trim();read=n;
   if(!raw){emptyPages.push(n);continue;}
   const remaining=workerData.file?100000:workerData.maxChars-length;if(raw.length>remaining)partial=true;
   const text=raw.slice(0,remaining);pages.push({page:n,text,partial:raw.length>remaining});length+=text.length;
   page.cleanup();if(!workerData.file&&length>=workerData.maxChars)break;
  }
  partial=partial||read<doc.numPages;
  const text=pages.map(p=>'[PDF page '+p.page+']\n'+p.text).join('\n\n');
  parentPort.postMessage({text,pages,totalPages:doc.numPages,examinedPages:read,emptyPages,partial,ocrRequired:emptyPages.length>0,reason:text?'ok':'ocr_required'});
 }finally{if(doc)await doc.destroy();else await task.destroy();}
})().catch(e=>parentPort.postMessage({error:e?.name==='PasswordException'?'pdf_password_required':'pdf_parse_failed'}));
