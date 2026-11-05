'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'chat-correction-confirm.js'),'utf8');
const {suggestLesson}=require('./chat-correction-confirm.js');
test('detects explicit Greek corrections and preserves their meaning',()=>{
  const examples=[
    'Αυτό είναι λάθος. Το σωστό είναι «ακούγονταν τα χτυπήματα».',
    'Μην αλλάζεις το «ακόμη» σε «ακόμα» χωρίς λόγο.',
    'Να διατηρείς τις κοφτές προτάσεις του συγγραφέα.'
  ];
  for(const input of examples)assert.equal(suggestLesson(input),input);
});
test('ordinary conversation does not trigger memory suggestion',()=>{
  for(const input of ['Τι ώρα είναι;','Πες μου για το Groq και την ιστορία του.',
    'Επιμελήσου το ακόλουθο κεφάλαιο του μυθιστορήματος.'])
      assert.equal(suggestLesson(input),null);
});
test('suggestions never exceed the storage bound',()=>{
  const large='Το σωστό είναι '+('μια αναλυτική εξήγηση '.repeat(100));
  const out=suggestLesson(large);
  assert.ok(out.length<=380);
  assert.ok(out.length>=12);
});
class Element {
  constructor(tag='div',id=''){
    this.tag=tag;this.id=id;this.style={};this.value='';
    this.listeners={};this.children=[];this.attributes={};
    this.disabled=false;this.textContent='';this.parentNode=null;
  }
  setAttribute(k,v){this.attributes[k]=v;}
  append(...nodes){this.children.push(...nodes);for(const n of nodes)n.parentNode=this;}
  addEventListener(type,handler){this.listeners[type]=handler;}
  insertAdjacentElement(_where,node){this.inserted=node;node.parentNode=this.parentNode;}
  async fire(type){if(this.listeners[type])return await this.listeners[type]({type,preventDefault(){}});}
}
function environment(){
  const root=new Element('div','compose');
  const chat=new Element('form','chat'); chat.parentNode=root;
  const message=new Element('textarea','message');
  const notice=new Element('div','notice');
  const elements={chat,message,notice};
  const posted=[];
  const document={
    createElement:tag=>new Element(tag),
    getElementById:id=>elements[id]||(chat.inserted?.id===id?chat.inserted:null)
  };
  const context={document,module:{exports:{}},fetch:async(url,options)=>{
    posted.push({url,options});
    return {ok:true,json:async()=>({lesson:{id:'test-rule'}})};
  }};
  vm.runInNewContext(source,context);
  const panel=chat.inserted;
  assert.ok(panel);
  const field=panel.children[2];
  const controls=panel.children[3];
  const [approve,dismiss,status]=controls.children;
  return {chat,message,notice,panel,field,approve,dismiss,status,posted};
}
test('sending a correction only offers approval; no automatic network write',async()=>{
  const e=environment();
  e.message.value='Αυτό είναι λάθος. Το σωστό είναι «ακούγονταν τα χτυπήματα».';
  await e.chat.fire('submit');
  assert.equal(e.posted.length,0);
  assert.equal(e.panel.style.display,'block');
  assert.equal(e.field.value,e.message.value);
  await e.dismiss.fire('click');
  assert.equal(e.posted.length,0);
  assert.equal(e.panel.style.display,'none');
});
test('explicit approval posts exactly one editable rule to protected existing API',async()=>{
  const e=environment();
  e.message.value='Μην αλλάζεις το «ακόμη» σε «ακόμα».';
  await e.chat.fire('submit');
  e.field.value='Διατήρησε το «ακόμη» όταν είναι ορθό.';
  await e.approve.fire('click');
  assert.equal(e.posted.length,1);
  assert.equal(e.posted[0].url,'/api/n7/approved-lessons');
  assert.equal(e.posted[0].options.method,'POST');
  assert.equal(JSON.parse(e.posted[0].options.body).rule,'Διατήρησε το «ακόμη» όταν είναι ορθό.');
  assert.equal(e.panel.style.display,'none');
  assert.match(e.notice.textContent,/αποθηκεύτηκε/);
});
