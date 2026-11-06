'use strict';
// N7_STREAM_ATTACHMENTS_V1 - genuine Groq SSE token streaming, private bounded attachments.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const MAX_BODY=9*1024*1024,MAX_FILE=5*1024*1024,MAX_TOTAL=6*1024*1024;
const FILES=4,MAX_TEXT=26000;
const TYPES={
 '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp',
 '.txt':'text/plain','.md':'text/markdown','.csv':'text/csv','.json':'application/json',
 '.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 '.pdf':'application/pdf'
};
function safeName(name){
 const value=String(name||'').replace(/[\\/\x00-\x1f]/g,'').trim().slice(0,100);
 if(!value||value.startsWith('.'))throw Error('Μη αποδεκτό όνομα αρχείου');
 return value;
}
function decodeXml(s){
 return s.replace(/<w:tab\b[^>]*\/>/g,'\t').replace(/<w:br\b[^>]*\/>/g,'\n')
   .replace(/<\/w:p>/g,'\n').replace(/<\/w:tr>/g,'\n')
   .replace(/<\/w:tc>/g,'\t').replace(/<[^>]*>/g,'')
   .replace(/&(?:amp|lt|gt|quot|apos);/g,x=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"})[x])
   .replace(/\n{3,}/g,'\n\n').trim();
}
function docxText(buffer){
 // ZIP central directory, bounded decompression, only word/document.xml.
 const end=Math.max(0,buffer.length-65557);let eocd=-1;
 for(let i=buffer.length-22;i>=end;i--){
  if(buffer.readUInt32LE(i)===0x06054b50){eocd=i;break;}
 }
 if(eocd<0)throw Error('Μη έγκυρο αρχείο DOCX');
 let p=buffer.readUInt32LE(eocd+16),count=buffer.readUInt16LE(eocd+10);
 count=Math.min(count,500);
 for(let i=0;i<count;i++){
  if(p+46>buffer.length||buffer.readUInt32LE(p)!==0x02014b50)throw Error('Μη έγκυρη δομή DOCX');
  const method=buffer.readUInt16LE(p+10),compressed=buffer.readUInt32LE(p+20),
        uncompressed=buffer.readUInt32LE(p+24),nameLen=buffer.readUInt16LE(p+28),
        extra=buffer.readUInt16LE(p+30),comment=buffer.readUInt16LE(p+32),
        offset=buffer.readUInt32LE(p+42);
  const name=buffer.subarray(p+46,p+46+nameLen).toString('utf8');
  p+=46+nameLen+extra+comment;
  if(name!=='word/document.xml')continue;
  if(uncompressed>500000||compressed>MAX_FILE||uncompressed===0)throw Error('Πολύ μεγάλο κείμενο DOCX');
  if(offset+30>buffer.length||buffer.readUInt32LE(offset)!==0x04034b50)throw Error('Μη έγκυρο περιεχόμενο DOCX');
  const start=offset+30+buffer.readUInt16LE(offset+26)+buffer.readUInt16LE(offset+28);
  if(start+compressed>buffer.length)throw Error('Μη έγκυρο περιεχόμενο DOCX');
  const raw=buffer.subarray(start,start+compressed);
  const plain=method===0?raw:method===8?zlib.inflateRawSync(raw,{maxOutputLength:500001}):null;
  if(!plain||plain.length>500000)throw Error('Μη υποστηριζόμενη συμπίεση DOCX');
  const content=decodeXml(plain.toString('utf8'));
  if(!content)throw Error('Το DOCX δεν περιέχει αναγνώσιμο κείμενο');
  return content.slice(0,MAX_TEXT);
 }
 throw Error('Δεν βρέθηκε το κείμενο του DOCX');
}
function checkMagic(type,b){
 if(type==='image/png')return b.length>=8&&b.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'));
 if(type==='image/jpeg')return b.length>=4&&b[0]===255&&b[1]===216&&b[2]===255;
 if(type==='image/webp')return b.length>=12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP';
 if(type==='application/pdf')return b.subarray(0,5).toString('ascii')==='%PDF-';
 if(type.includes('wordprocessingml'))return b.length>=4&&b.toString('hex',0,2)==='504b';
 return true;
}
function unpackAttachment(x){
 if(!x||typeof x!=='object')throw Error('Μη έγκυρο συνημμένο');
 const name=safeName(x.name),ext=path.extname(name).toLowerCase(),type=TYPES[ext];
 if(!type)throw Error('Μη υποστηριζόμενο αρχείο: '+ext);
 if(typeof x.base64!=='string'||x.base64.length>MAX_FILE*1.4||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(x.base64)||x.base64.length%4)throw Error('Μη έγκυρα δεδομένα αρχείου');
 const b=Buffer.from(x.base64,'base64');
 if(!b.length||b.length>MAX_FILE||!checkMagic(type,b))throw Error('Μη έγκυρος τύπος ή μέγεθος αρχείου');
 if(type==='application/pdf')throw Error('Η ανάγνωση PDF δεν είναι ακόμη διαθέσιμη. Στείλε TXT/DOCX ή εικόνες των σελίδων.');
 const text=type==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'?
   docxText(b):type.startsWith('text/')||type==='application/json'?b.toString('utf8').slice(0,MAX_TEXT):'';
 return {name,type,buffer:b,text};
}
function parseAttachments(array){
 if(array==null)return [];
 if(!Array.isArray(array)||array.length>FILES)throw Error('Έως τέσσερα συνημμένα ανά μήνυμα');
 let sum=0,images=0;
 const result=array.map(x=>{
  const a=unpackAttachment(x);sum+=a.buffer.length;
  if(a.type.startsWith('image/'))images++;
  return a;
 });
 if(sum>MAX_TOTAL||images>3)throw Error('Έως 6 MB συνολικά και τρεις εικόνες ανά μήνυμα');
 return result;
}
async function readJson(req,limit=MAX_BODY){
 let n=0;const parts=[];
 for await(const part of req){n+=part.length;if(n>limit)throw Error('Το συνολικό μήνυμα είναι πολύ μεγάλο');parts.push(part);}
 return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
function privateStore(dir,conversationId,attachments){
 if(!attachments.length)return [];
 const root=path.join(dir,'n7-private-attachments',conversationId);
 fs.mkdirSync(root,{recursive:true,mode:0o700});
 if(fs.lstatSync(root).isSymbolicLink())throw Error('Unsafe attachment directory');
 return attachments.map(x=>{
  const id=crypto.randomUUID(),file=path.join(root,id);
  fs.writeFileSync(file,x.buffer,{mode:0o600,flag:'wx'});
  return {id,name:x.name,type:x.type,size:x.buffer.length};
 });
}
function loadStored(dir,conversationId,meta){
 if(!meta||typeof meta.id!=='string'||!/^[0-9a-f-]{36}$/.test(meta.id))return null;
 const file=path.join(dir,'n7-private-attachments',conversationId,meta.id);
 try{
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_FILE)return null;
  const buf=fs.readFileSync(file);
  return unpackAttachment({name:meta.name,base64:buf.toString('base64')});
 }catch{return null;}
}
function buildPrompt(history,conversationId,dir,promptMessages){
 const recent=history.slice(-24);
 const visibleImageIds=new Set();
 for(const message of [...recent].reverse()){
  for(const meta of [...(message.attachments||[])].reverse()){
   if(meta.type?.startsWith('image/')&&visibleImageIds.size<3)visibleImageIds.add(meta.id);
  }
 }
 const trimmed=recent.map(m=>{
  if(m.role!=='user'||!Array.isArray(m.attachments)||!m.attachments.length)return {role:m.role,content:m.content};
  const parts=[{type:'text',text:m.content}];
  for(const meta of m.attachments.slice(0,4)){
   const attachment=loadStored(dir,conversationId,meta);
   if(!attachment)continue;
   if(attachment.type.startsWith('image/')){
    if(!visibleImageIds.has(meta.id))continue; // Groq Qwen supports up to three images per request
    parts.push({type:'image_url',image_url:{url:'data:'+attachment.type+';base64,'+attachment.buffer.toString('base64')}});

   }else if(attachment.text){
    parts[0].text+='\n\n[Συνημμένο '+attachment.name+' — κείμενο]\n'+attachment.text.slice(0,MAX_TEXT)+'\n[/Συνημμένο]';
   }
  }
  const visualCount=parts.filter(p=>p.type==='image_url').length;
  if(visualCount){
   const assertion=visualCount===1?
     'Επισυνάπτεται ΑΚΡΙΒΩΣ ΜΙΑ ενιαία εικόνα στο παρόν μήνυμα, όχι τέσσερις φωτογραφίες ή καρέ.':
     'Επισυνάπτονται ακριβώς '+visualCount+' εικόνες στο παρόν μήνυμα.';
   parts[0].text=assertion+'\\n'+
     'Περιέγραψε μόνο ό,τι είναι ορατό στο πραγματικό οπτικό περιεχόμενο. '+
     'Μην επινοείς πλάνα, τεταρτημόρια, cropped views, δεύτερες λήψεις, αντικείμενα ή λεπτομέρειες. '+
     'Μην προσποιείσαι ότι εξέτασες την εικόνα αν δεν μπορείς να την αναλύσεις.\\n\\n'+parts[0].text;
  }
  return {role:'user',content:parts};
 });
 return promptMessages(trimmed);
}
async function readGroqStream(response,onDelta){
 if(!response.ok)throw Error('Groq HTTP '+response.status);
 if(!response.body)throw Error('Groq did not return a stream');
 const decoder=new TextDecoder(),reader=response.body.getReader();
 let pending='',text='',reason='';
 try{
  while(true){
   const part=await reader.read();if(part.done)break;
   pending+=decoder.decode(part.value,{stream:true});
   pending=pending.replace(/\r\n/g,'\n'); // Groq can send SSE over CRLF
   if(pending.length>500000)throw Error('Groq stream buffer exceeded');
   let ix;
   while((ix=pending.indexOf('\n\n'))!==-1){
    const event=pending.slice(0,ix).trim();pending=pending.slice(ix+2);
    const line=event.split('\n').find(l=>l.startsWith('data:'));
    if(!line)continue;
    const data=line.slice(5).trim();if(data==='[DONE]')continue;
    let chunk;try{chunk=JSON.parse(data);}catch{continue;}
    const delta=chunk.choices?.[0]?.delta?.content;
    if(typeof delta==='string'&&delta){text+=delta;onDelta(delta);}
    if(chunk.choices?.[0]?.finish_reason)reason=chunk.choices[0].finish_reason;
   }
  }
 }finally{reader.releaseLock();}
 return {text,reason};
}
function makeHandler({API_KEY,MODEL,BASE,DATA_DIR,promptMessages,load,save,publicSearch,fetcher=fetch}){
 return async function handle(req,res,id){
  if(!API_KEY||!MODEL)return writeError(res,503,'Το μοντέλο δεν είναι συνδεδεμένο');
  let all,item,input,attachments;
  try{
   all=load();item=all.find(c=>c.id===id);
   if(!item)return writeError(res,404,'Η συνομιλία δεν βρέθηκε');
   input=await readJson(req);
   if(typeof input.message!=='string'||input.message.trim().length>12000)
    return writeError(res,400,'Το μήνυμα πρέπει να περιέχει έως 12000 χαρακτήρες');
   attachments=parseAttachments(input.attachments);
  }catch(e){return writeError(res,400,e.message);}
  const content=input.message.trim();
  // Write once before invoking model; stored images are private, never served publicly.
  let metadata;
  try{metadata=privateStore(DATA_DIR,id,attachments);}catch(e){return writeError(res,400,e.message);}
  const history=[...item.messages,{role:'user',content,attachments:metadata}];
  // N7_STALL_RECOVERY_V1: bound research/prompt size and model call duration.
  // Never allow slow public sites or large bibliographies to starve the reply.
  // N7_RESEARCH_PROGRESS_STREAM_V1: acknowledge before slow web fetching.
  let started=false,final='',done=false;
  const emit=(type,value)=>{
   if(res.destroyed||res.writableEnded)return;
   if(!started){
    res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8',
      'Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no',
      'X-Content-Type-Options':'nosniff'});
    started=true;
   }
   res.write(JSON.stringify({type,...value})+'\n');
  };
  emit('status',{stage:'research',message:'Ελέγχω πηγές και προετοιμάζω την ιστορική έρευνα…'});
  let evidence=null,messages;
  try{
   // Cap research phase even if a provider hangs, while preserving available sources.
   const researchTimeout=Symbol('research-timeout');
   let researchTimer;
   try{
    evidence=await Promise.race([
      publicSearch.researchMessages(history),
      new Promise(resolve=>{researchTimer=setTimeout(()=>resolve(researchTimeout),8500);})
    ]);
   }finally{clearTimeout(researchTimer);}
   if(evidence===researchTimeout){
     evidence={searched:true,items:[],reason:'research_timeout'};
     emit('status',{stage:'research_timeout',message:'Η αναζήτηση καθυστέρησε. Συνεχίζω με όσα γνωρίζει το N7…'});
   }
   if(typeof publicSearch.enrichPublisherArticles==='function'&&evidence.items?.length){
     if(evidence?.searched)emit('status',{stage:'reading',message:'Διαβάζω διαθέσιμα άρθρα και ελέγχω βιβλιογραφία…'});
     const articleTimeout=Symbol('article-timeout');
     let articleTimer;
     try{
      const augmented=await Promise.race([
        publicSearch.enrichPublisherArticles(evidence),
        new Promise(resolve=>{articleTimer=setTimeout(()=>resolve(articleTimeout),8500);})
      ]);
      if(augmented!==articleTimeout)evidence=augmented;
      else emit('status',{stage:'read_timeout',message:'Η ανάγνωση πηγών καθυστέρησε. Προχωρώ στην απάντηση…'});
     }finally{clearTimeout(articleTimer);}
   }
   messages=buildPrompt(typeof publicSearch.cleanHistoryForTopic==='function'?publicSearch.cleanHistoryForTopic(history):history,id,DATA_DIR,promptMessages);
   const n7ImageCount=attachments.filter(a=>a.type.startsWith('image/')).length;
   if(n7ImageCount){
     const recent=messages.findLast(m=>m.role==='user');
     const sent=Array.isArray(recent?.content)?
       recent.content.filter(x=>x.type==='image_url').length:0;
     if(sent!==n7ImageCount)throw Error('Αποτυχία οπτικής μεταφοράς: λείπει συνημμένη εικόνα');
     if(messages[0]?.role==='system'){
       messages[0].content+='\\n\\nN7 VISION GROUNDING — IMPORTANT: the current user supplied '+
         n7ImageCount+' actual image'+(n7ImageCount===1?'':'s')+
         '. Count the image attachments, not visual objects or scene regions. '+
         'If ONE single image was provided, describe ONE composition as a whole. '+
         'Do not infer four camera shots, quadrants or crops unless the image visibly is a collage. '+
         'For visual details, separate observed features from historical interpretation. '+
         'If anything is unclear, say so rather than fabricate. Never claim to read small text unless legible.';
     }
     console.log('N7_VISION_GROUNDING attachments='+n7ImageCount+' forwarded='+sent);
   }
   const rawContext=publicSearch.contextForResearch(evidence);
   // 13k characters max evidence budget: prevent context overflow and provider stalls.
   const context=rawContext.length>13000
     ?rawContext.slice(0,13000)+'\n[Η υπόλοιπη έρευνα παραλείφθηκε λόγω ορίου μήκους.]'
     :rawContext;
   if(context&&messages[0]?.role==='system')messages[0].content+='\n\n'+context;
  }catch(e){emit('error',{error:'Η προετοιμασία της έρευνας απέτυχε: '+String(e.message||e).slice(0,160)});if(!res.writableEnded)res.end();return;}
  const url=BASE.replace(/\/$/,'')+'/chat/completions';
  if(!/^https:\/\//.test(url)){emit('error',{error:'Μη έγκυρη διεύθυνση μοντέλου'});res.end();return;}

  emit('status',{stage:'model',message:'Οι πηγές ελέγχθηκαν. Το N7 συντάσσει την απάντηση…'});
  try{
   for(let pass=0;pass<2;pass++){
    const ask=pass?[
      ...messages,{role:'assistant',content:final.slice(-4500)},
      {role:'user',content:'Συνέχισε ακριβώς από εκεί που σταμάτησες, χωρίς επανάληψη.'}
    ]:messages;
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);
    const request={model:MODEL,messages:ask,temperature:0.3,stream:true,
      max_completion_tokens:1800};
    if(BASE==='https://api.groq.com/openai/v1'&&MODEL==='qwen/qwen3.8-27b'){
      request.reasoning_effort='none';request.max_completion_tokens=1800;
    }
    let completion;
    try{
      const response=await fetcher(url,{
        method:'POST',headers:{Authorization:'Bearer '+API_KEY,'Content-Type':'application/json'},
        body:JSON.stringify(request),signal:controller.signal
      });
      completion=await readGroqStream(response,part=>{final+=part;emit('delta',{text:part})});
    }finally{clearTimeout(timeout);}
    if(completion.reason!=='length'){done=true;break;}
    emit('status',{stage:'continuation',message:'Η απάντηση συνεχίζεται…'});
   }
   if(!final)throw Error('Το μοντέλο δεν έστειλε κείμενο');
   const footer=publicSearch.sourceFooter(evidence);
   if(footer){final+=footer;emit('delta',{text:footer});}
   if(!done){
    const note='\n\n[Η απάντηση διακόπηκε στο όριο μήκους· γράψε «συνέχισε».]';
    final+=note;emit('delta',{text:note});
   }
   const fresh=load(),current=fresh.find(c=>c.id===id);
   if(!current)throw Error('Η συνομιλία διαγράφηκε πριν ολοκληρωθεί η απάντηση');
   current.messages=[...history,{role:'assistant',content:final}].slice(-100);
   current.updated=new Date().toISOString();
   if(current.title==='Νέα συνομιλία')current.title=content.slice(0,70);
   save(fresh);
   emit('done',{conversation:{id:current.id,title:current.title}});
  }catch(e){
   if(final){
    // Do not lose a response after it started streaming.
    const fresh=load(),current=fresh.find(c=>c.id===id);
    if(current){current.messages=[...history,{role:'assistant',content:final+'\n\n[Μη ολοκληρωμένη απάντηση]'}].slice(-100);
      current.updated=new Date().toISOString();try{save(fresh);}catch{}}
   }
   emit('error',{error:'Η απάντηση διακόπηκε: '+String(e.message||e).slice(0,150)});
  }finally{if(started&&!res.writableEnded)res.end();}
 };
}
function writeError(res,status,message){
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
 res.end(JSON.stringify({error:message}));
}
module.exports={makeHandler,parseAttachments,docxText,readGroqStream,buildPrompt,safeName,unpackAttachment};
