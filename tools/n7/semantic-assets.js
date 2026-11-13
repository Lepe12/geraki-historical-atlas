'use strict';
// N7_HYBRID_SEARCH_V1: files for on-device semantic search.
// - /n7-model/*: public, pinned open model + runtime (no private data), fixed allowlist.
// - /api/library/semantic/*: AUTHENTICATED passage vectors and page references derived from the
//   private library (no page text). Stored outside public/, in <app>/n7-semantic/.
const fs=require('node:fs'),path=require('node:path');
const MODEL_FILES={
 'transformers.min.js':'text/javascript; charset=utf-8',
 'ort/ort-wasm-simd-threaded.jsep.mjs':'text/javascript; charset=utf-8',
 'ort/ort-wasm-simd-threaded.jsep.wasm':'application/wasm',
 'models/Xenova/multilingual-e5-small/config.json':'application/json',
 'models/Xenova/multilingual-e5-small/tokenizer.json':'application/json',
 'models/Xenova/multilingual-e5-small/tokenizer_config.json':'application/json',
 'models/Xenova/multilingual-e5-small/onnx/model_quantized.onnx':'application/octet-stream'
};
const INDEX_FILES={'manifest.json':'application/json','chunks.i8':'application/octet-stream','chunks.meta.json':'application/json'};
function stream(res,file,type,cache){
 let st;try{st=fs.statSync(file);}catch{st=null;}
 if(!st||!st.isFile()){res.writeHead(404,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end('{"error":"SEMANTIC_FILE_NOT_INSTALLED"}');}
 res.writeHead(200,{'Content-Type':type,'Content-Length':st.size,'Cache-Control':cache,'X-Content-Type-Options':'nosniff',"Content-Security-Policy":"default-src 'none'"});
 fs.createReadStream(file).pipe(res);
}
function model(res,pathname,appDir){
 const rel=pathname.slice('/n7-model/'.length);
 if(!Object.hasOwn(MODEL_FILES,rel)){res.writeHead(404);return res.end();}
 return stream(res,path.join(appDir,'public','n7-model',rel),MODEL_FILES[rel],'public, max-age=2592000, immutable');
}
function index(res,pathname,appDir,json){
 const name=pathname.slice('/api/library/semantic/'.length);
 if(!Object.hasOwn(INDEX_FILES,name))return json(res,404,{error:'Not found'});
 return stream(res,path.join(appDir,'n7-semantic',name),INDEX_FILES[name],'private, max-age=300');
}
module.exports={model,index,MODEL_FILES,INDEX_FILES};
