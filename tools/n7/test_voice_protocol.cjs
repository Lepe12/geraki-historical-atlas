'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const P=require('./voice-protocol');
test('voice protocol bounds public map context and rejects invalid scopes',()=>{
 const scope=P.context({place:'Βενετία',from:1570,to:1580,sources:[{title:'valid',url:'https://example.org/source'},{title:'bad',url:'javascript:alert(1)'},{title:'credentials',url:'https://user:secret@example.org/'}]});
 assert.equal(scope.sources.length,1);assert.match(P.question('Τι γνωρίζουμε;',scope),/Βενετία/);assert.ok(P.question('x'.repeat(6000),scope).length<12000);assert.throws(()=>P.question('x'.repeat(6001)),/6.000/);assert.equal(P.context({...scope,from:1701}),null);assert.equal(P.context({...scope,from:1581}),null);
});
test('only the exact popup/origin/nonce and matching question id can resolve a voice answer',async()=>{
 const listeners={},states=[];const popup={closed:false,focus(){},sent:[],postMessage(data,origin){this.sent.push({data,origin});}};
 const window={N7VoiceProtocol:P,open:()=>popup,addEventListener:(type,fn)=>listeners[type]=fn,N7AtlasContext:{read:()=>({place:'Κέρκυρα',from:1570,to:1580,sources:[]})}};
 const context={window,document:{dispatchEvent:e=>states.push(e.detail)},location:{origin:P.ATLAS},crypto:require('node:crypto').webcrypto,CustomEvent:class{constructor(type,init){this.detail=init.detail}},setInterval:()=>0,setTimeout,clearTimeout,Error,Promise};
 vm.runInNewContext(fs.readFileSync(require.resolve('./atlas-voice-link'),'utf8'),context);
 const link=window.N7VoiceLink;link.connect();
 // Read nonce from the popup connection URL without any authentication material.
 let nonce;window.open=(url)=>{nonce=JSON.parse(new URL(url).hash.slice('#n7voice='.length)?decodeURIComponent(new URL(url).hash.slice('#n7voice='.length)):'{}').nonce;return popup;};link.disconnect();link.connect();
 const event=(origin,source,data)=>listeners.message({origin,source,data});
 event('https://evil.example',popup,{schema:P.SCHEMA,nonce,type:'ready'});assert.equal(link.isConnected(),false);
 event(P.BOT,{}, {schema:P.SCHEMA,nonce,type:'ready'});assert.equal(link.isConnected(),false);
 event(P.BOT,popup,{schema:P.SCHEMA,nonce:'0'.repeat(32),type:'ready'});assert.equal(link.isConnected(),false);
 event(P.BOT,popup,{schema:P.SCHEMA,nonce,type:'ready'});assert.equal(link.isConnected(),true);
 const answer=link.ask('Θυμάσαι το έργο μου;');const sent=popup.sent.at(-1).data;assert.equal(sent.type,'question');assert.equal(sent.context.place,'Κέρκυρα');
 event(P.BOT,popup,{schema:P.SCHEMA,nonce,type:'answer',id:'not-the-request',text:'wrong'});assert.equal(popup.sent.length>0,true);
 event(P.BOT,popup,{schema:P.SCHEMA,nonce,type:'answer',id:sent.id,text:'actual answer'});assert.equal((await answer).text,'actual answer');
 link.disconnect();assert.equal(link.isConnected(),false);await assert.rejects(link.ask('question'),/Σύνδεση/);
});
