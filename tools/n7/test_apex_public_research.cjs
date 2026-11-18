'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Readable}=require('node:stream');
const {EventEmitter}=require('node:events');
const {createApexPublicChat}=require('./apex-public-chat.cjs');
function invoke(chat,messages){
 const body=JSON.stringify({messages});
 const req=Readable.from([Buffer.from(body)]);
 req.method='POST';req.url='/api/n7-apex/chat';
 req.headers={'origin':'https://bot.piratecartography.com','content-type':'application/json'};
 req.socket={remoteAddress:'127.0.0.55'};
 const res=new EventEmitter();
 res.writableEnded=false;
 res.writeHead=(status,headers)=>{res.status=status;res.headers=headers;};
 res.end=(text)=>{res.writableEnded=true;res.data=JSON.parse(text);};
 return chat.handle(req,res).then(()=>res);
}
test('Humanoid researcher includes read-only public evidence in real model request and source link in reply',async()=>{
 let request=null,consulted=0,read=0;
 const research={
  async researchMessages(){consulted++;return {searched:true,query:'Creveliers Ierapetra',items:[{title:'Source One',url:'https://example.org/crete',articleRead:true,articleText:'Primary source excerpt'}]};},
  async enrichPublisherArticles(result){read++;return result;},
  contextForResearch(){return 'PUBLIC SOURCE: Creveliers in Crete; https://example.org/crete';},
  sourceFooter(){return '\n\nΠηγές έρευνας:\nhttps://example.org/crete';}
 };
 const chat=createApexPublicChat({apiKey:'test',model:'qwen/test',base:'https://api.groq.com/openai/v1',research,
  fetchImpl:async(url,opts)=>{request=JSON.parse(opts.body);return new Response(JSON.stringify({choices:[{message:{content:'Βρήκα τη σχετική πηγή.'}}]}),{status:200});}});
 const res=await invoke(chat,[{role:'user',content:'Ψάξε ιστορικές πηγές για Creveliers Ιεράπετρα'}]);
 assert.equal(res.status,200);
 assert.equal(consulted,1);assert.equal(read,1);
 assert.match(request.messages[0].content,/PUBLIC SOURCE/);
 assert.match(res.data.reply,/Βρήκα/);
 assert.match(res.data.reply,/https:\/\/example.org\/crete/);
 assert.deepEqual(res.data.research,{attempted:true,sources:1});
});
test('Humanoid casual dialogue does not invent web citations or require research',async()=>{
 let request=null;
 const research={
  async researchMessages(){return {searched:false,items:[]};},
  async enrichPublisherArticles(){throw Error('Must not read without search');},
  contextForResearch(){return '';},sourceFooter(){return ''}};
 const chat=createApexPublicChat({apiKey:'test',model:'plain',base:'https://api.groq.com/openai/v1',research,
  fetchImpl:async(url,opts)=>{request=JSON.parse(opts.body);return new Response(JSON.stringify({choices:[{message:{content:'Καλημέρα!'}}]}),{status:200});}});
 const res=await invoke(chat,[{role:'user',content:'Καλημέρα'}]);
 assert.equal(res.status,200);assert.equal(res.data.reply,'Καλημέρα!');
 assert.equal(res.data.research.attempted,false);
 assert.doesNotMatch(request.messages[0].content,/PUBLIC SOURCE/);
});
test('Humanoid reports search failure honestly, without fabricated sources',async()=>{
 let request;
 const research={async researchMessages(){throw Error('blocked');},contextForResearch(){return '';},
  sourceFooter(){return ''},async enrichPublisherArticles(){return null;}};
 const chat=createApexPublicChat({apiKey:'test',model:'plain',base:'https://api.groq.com/openai/v1',research,
  fetchImpl:async(url,opts)=>{request=JSON.parse(opts.body);return new Response(JSON.stringify({choices:[{message:{content:'Δεν μπόρεσα να βρω επαληθευμένες πηγές.'}}]}),{status:200});}});
 const res=await invoke(chat,[{role:'user',content:'Ψάξε ιστορικές πηγές'}]);
 assert.equal(res.status,200);
 assert.equal(res.data.research.sources,0);
 assert.match(request.messages[0].content,/Never fabricate sources/);
 assert.equal(res.data.reply.includes('https://'),false);
});

test('production public Humanoid loads renamed reviewed web researcher module',()=>{
 const source=require('node:fs').readFileSync(require.resolve('./apex-public-chat.cjs'),'utf8');
 const deploy=require('node:fs').readFileSync(require('node:path').join(__dirname,'deploy_reconciled_runtime.py'),'utf8');
 assert.match(source,/require\(['"]\.\/n7-public-web-search['"]\)/);
 assert.match(deploy,/'n7-public-web-search\.js': 'public-web-search\.js'/);
});
