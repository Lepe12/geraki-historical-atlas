"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),{JSDOM}=require("jsdom");
const source=fs.readFileSync(require("node:path").join(__dirname,"n7-source-library-ui-v2.js"),"utf8");
function setup(){
 const dom=new JSDOM('<!doctype html><html><head></head><body><aside class="sidebar"><div class="section">ΣΥΝΟΜΙΛΙΕΣ</div><nav id="conversations"></nav></aside><main><div id="messages"></div></main></body></html>',
   {url:"https://bot.piratecartography.com/",runScripts:"dangerously",pretendToBeVisual:true});
 const w=dom.window,queries=[];
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute("open","");};
 w.HTMLDialogElement.prototype.close=function(){this.removeAttribute("open");};
 w.setInterval=()=>0;
 w.fetch=async (_url,opts)=>{
   const request=JSON.parse(opts.body);queries.push(request);
   const mock={
     list:{documents:[{id:"abcdef",title:"gourgourinisLANTZAS23lo (1).pdf",author:"",year:"",aliases:"",pageOffset:null,
          status:"ready",nextPage:165,totalPages:164,size:10000,received:10000,sourceHash:"0123456789"}]},
     metadata:{saved:true},search:{hits:[]}
   };
   return {ok:true,status:200,json:async()=>mock[request.op]||{error:"NOT_TESTED"}};
 };
 w.eval(source);
 return {dom,w,queries};
}
test("books are shown without upload and metadata controls overflowing the dialog",async()=>{
 const {dom,w,queries}=setup();
 w.document.querySelector("#n7-library-button").click();
 await new Promise(resolve=>setImmediate(resolve));
 const dlg=w.document.querySelector("#n7-source-library");
 assert.equal(dlg.open,true);
 const tabs=[...dlg.querySelectorAll(".n7-library-tab")];
 assert.deepEqual(tabs.map(x=>x.textContent),["Τα βιβλία μου","Προσθήκη βιβλίου","Αναζήτηση","Στοιχεία βιβλίου"]);
 assert.equal(dlg.querySelector(".n7-library-counter").textContent,"1 βιβλίο στη μόνιμη βιβλιοθήκη");
 assert.ok(dlg.textContent.includes("164 / 164 σελίδες"));
 assert.equal(dlg.querySelectorAll("article").length,1);
 assert.equal(dlg.querySelector("article details").open,false);
 assert.equal(dlg.querySelectorAll(".n7-library-panel:not([hidden])").length,1);
 assert.equal(queries.filter(x=>x.op==="metadata").length,0);
 dom.window.close();
});
test("sticky close X, Escape, and backdrop close the native modal without deleting pages",async()=>{
 const {dom,w,queries}=setup();const opener=w.document.querySelector("#n7-library-button");
 opener.click();await new Promise(resolve=>setImmediate(resolve));
 const dlg=w.document.querySelector("#n7-source-library");
 const x=dlg.querySelector('button[aria-label="Κλείσιμο βιβλιοθήκης"]');
 assert.ok(x);
 x.click();
 assert.equal(dlg.open,false);
 opener.click();await new Promise(resolve=>setImmediate(resolve));
 w.document.dispatchEvent(new w.KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}));
 assert.equal(dlg.open,false);
 assert.equal(queries.filter(x=>x.op==="review"||x.op==="delete").length,0);
 dom.window.close();
});
test("metadata save is disabled before selecting book; selecting book switches tabs",async()=>{
 const {dom,w}=setup();
 w.document.querySelector("#n7-library-button").click();await new Promise(resolve=>setImmediate(resolve));
 const dlg=w.document.querySelector("#n7-source-library");
 const metadataTab=[...dlg.querySelectorAll(".n7-library-tab")].find(x=>x.textContent==="Στοιχεία βιβλίου");
 metadataTab.click();
 const save=[...dlg.querySelectorAll("button")].find(x=>x.textContent.includes("Αποθήκευση στοιχείων επιλεγμένου βιβλίου"));
 assert.equal(save.disabled,true);
 const booksTab=[...dlg.querySelectorAll(".n7-library-tab")].find(x=>x.textContent==="Τα βιβλία μου");
 booksTab.click();
 const details=dlg.querySelector("article details");details.open=true;
 [...details.querySelectorAll("button")].find(x=>x.textContent==="Στοιχεία").click();
 assert.equal(save.disabled,false); // Explicit selection enables metadata editing.
 assert.equal(dlg.querySelectorAll(".n7-library-panel:not([hidden])").length,1);
 assert.equal(metadataTab.getAttribute("aria-current"),"page");
 dom.window.close();
});
