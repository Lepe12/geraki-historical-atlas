'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const reader=require('./document-reader');
function pdf(pages){
 const objs=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${3+i*2} 0 R`).join(' ')}] >>`];
 for(const text of pages){const page=objs.length+1,stream=page+1,font=3+pages.length*2;
 objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R >>`);
 const body=text?`BT /F1 12 Tf 20 200 Td (${text}) Tj ET`:'';objs.push(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
 }objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
 let out='%PDF-1.4\n',offsets=[0];objs.forEach((o,i)=>{offsets.push(Buffer.byteLength(out));out+=`${i+1} 0 obj\n${o}\nendobj\n`});const pos=Buffer.byteLength(out);
 out+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF`;
 return Buffer.from(out);
}
test('reject private, mapped, local and mixed DNS targets',async()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.0.1','192.168.1.2','100.64.0.1','::1','::ffff:127.0.0.1','fc00::1','2001:db8::1'])assert.equal(reader.publicIP(ip),false,ip);
 assert.equal(reader.publicIP('8.8.8.8'),true);
 await assert.rejects(reader.resolvePublic('example.org',async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]),/private_address/);
 for(const u of ['http://example.org','https://u:p@example.org','https://example.org:8443'])assert.throws(()=>reader.validateURL(u));
});
test('revalidates redirect DNS before making second request',async()=>{
 const {Readable}=require('node:stream'),{EventEmitter}=require('node:events');let requests=0;
 const request=(_u,_opt,cb)=>{requests++;const e=new EventEmitter();e.end=()=>{const r=Readable.from([]);r.statusCode=302;r.headers={location:'https://127.0.0.1/private'};cb(r);e.emit('close')};return e;};
 await assert.rejects(reader.fetchPublic('https://example.org',{lookup:async()=>[{address:'8.8.8.8',family:4}],request}),/private_address/);assert.equal(requests,1);
});
test('robots supports agent groups and longest allow rule',()=>{
 const r='User-agent: *\nDisallow: /private\nAllow: /private/open$';assert.equal(reader.robotsAllowed(r,'/private/secret'),false);assert.equal(reader.robotsAllowed(r,'/private/open'),true);
 assert.equal(reader.robotsAllowed('User-agent: OtherBot\nDisallow: /\nUser-agent: *\nAllow: /','/article'),true);
});
test('extract PDF real page numbers, mark partial and identify scanned pages',async()=>{
 const r=await reader.pdfText(pdf(['ARCHIVE 1573','CORFU 1608','']));assert.match(r.text,/\[PDF page 2\]\nCORFU 1608/);assert.equal(r.totalPages,3);assert.deepEqual(r.emptyPages,[3]);assert.equal(r.ocrRequired,true);
 const limited=await reader.pdfText(pdf(['first','second']),{maxPages:1});assert.equal(limited.partial,true);assert.doesNotMatch(limited.text,/second/);
 const empty=await reader.pdfText(pdf(['']));assert.equal(empty.reason,'ocr_required');assert.equal(empty.text,'');
});
test('never reads robots-disallowed pages and never mistakes a challenge for article',async()=>{
 let calls=0;await assert.rejects(reader.readDocument('https://example.org/private',{fetcher:async()=>{calls++;return {body:Buffer.from('User-agent: *\nDisallow: /private')}}}),/robots_disallowed/);assert.equal(calls,1);
 assert.throws(()=>reader.htmlText('<html>Verify you are human</html>'),/access_challenge/);
 assert.equal(reader.htmlText('<article><p>Evidence</p><script>invented</script></article>'),'Evidence');
});
test('direct links trigger research and PDF context contains cited physical pages',async()=>{
 const search=require('./public-web-search');assert.equal(search.classify([{role:'user',content:'Διάβασε https://example.org/article.pdf'}]).directUrls[0],'https://example.org/article.pdf');
 const c=search.contextForResearch({searched:true,kind:'general',items:[{url:'https://example.org/doc.pdf',title:'doc',source:'archive',articleRead:true,articleText:'[PDF page 2]\nEvidence',pdfPages:[{page:2}],partial:true}]});assert.match(c,/PARTIAL/);assert.match(c,/PDF physical page/);
});
test('PDF attachment is parsed privately before prompt and stored evidence survives follow-up',async()=>{
 const {makeHandler,buildPrompt}=require('./stream-attachments'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{Readable}=require('node:stream');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'n7-pdf-'));try{
  const id='11111111-1111-4111-8111-111111111111',db=[{id,title:'Νέα συνομιλία',messages:[]}];let payload;
  const handler=makeHandler({API_KEY:'test',MODEL:'test',BASE:'https://example.org',DATA_DIR:dir,promptMessages:h=>[{role:'system',content:''},...h],load:()=>db,save:()=>{},publicSearch:{researchMessages:async()=>({searched:false,items:[]}),contextForResearch:()=>'',sourceFooter:()=>''},fetcher:async(_u,o)=>{payload=JSON.parse(o.body);return new Response('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n')}});
  const req=Readable.from([Buffer.from(JSON.stringify({message:'read PDF',attachments:[{name:'source.pdf',base64:pdf(['ARCHIVE PAGE ONE']).toString('base64')}]}) )]);let status;const res={writeHead:s=>{status=s},write:()=>{},end(){this.writableEnded=true}};await handler(req,res,id);
  assert.equal(status,200);assert.match(JSON.stringify(payload),/ARCHIVE PAGE ONE/);assert.match(JSON.stringify(buildPrompt(db[0].messages,id,dir,h=>h)),/PDF page 1/);assert.equal(db[0].messages[0].attachments[0].type,'application/pdf');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
