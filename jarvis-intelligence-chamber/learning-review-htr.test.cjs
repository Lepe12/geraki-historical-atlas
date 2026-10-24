"use strict";
// Browser-handler regression for scanned PDF -> authenticated server preview -> review.
// Only the CDN pdf.js import is substituted with a one-page in-memory fixture.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class Element {
  constructor() {
    this.dataset = {};
    this.listeners = {};
    this.classList = {add(){},remove(){}};
    this.textContent = "";
    this.innerHTML = "";
    this.disabled = false;
    this.hidden = false;
    this.value = "";
    this.files = [];
    this.inert = false;
    this.children = new Map();
  }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  fire(type, evt={}) { assert.ok(this.listeners[type], type); return this.listeners[type](evt); }
  before() {}
  after() {}
  append() {}
  focus() {}
  querySelector(sel) {
    if (!this.children.has(sel)) this.children.set(sel, new Element());
    return this.children.get(sel);
  }
  querySelectorAll() { return []; }
}
const names = ["learningPanel", "learningToggle", "closeLearning", "learningFile",
  "learningAnalyze", "learningState", "learningSource", "learningItems",
  "learningSummary", "learningSave"];
const els = Object.fromEntries(names.map(x => [x, new Element()]));
const calls = [];
let reviewBody;
const fakePdf = {
  GlobalWorkerOptions: {},
  getDocument() {
    return {promise:Promise.resolve({
      numPages:1,
      async getPage() {return {async getTextContent(){return {items:[]};},cleanup(){}};},
      async destroy(){}
    })};
  },
};
const sandbox = {
  window: {},
  document: {
    getElementById(id) { return els[id] || null; },
    createElement() { return new Element(); },
  },
  __pdfjsMock: fakePdf,
  setTimeout: (cb) => { cb();return 1; },
  fetch: async (url, options={}) => {
    calls.push({url, options});
    if (url.endsWith("/knowledge/upload")) {
      assert.equal(options.credentials, "include");
      return {ok:true,status:201,json:async()=>({source_id:"src-test-scanned"})};
    }
    if (url.endsWith("/knowledge/preview")) {
      assert.equal(options.credentials, "include");
      assert.deepEqual(JSON.parse(options.body), {source_id:"src-test-scanned"});
      return {ok:true,status:200,json:async()=>({
        schema:"nabou-pdf-preview-v1",source_id:"src-test-scanned",
        historically_verified:false,htr_pages:1,
        pages:[{page:1,method:"KRAKEN_HTR",htr_status:"OK",
          transcription_review:"UNREVIEWED",
          text:"In the year 1677 a Venetian galley reached Milo harbour."}],
      })};
    }
    if (url.endsWith("/knowledge/review")) {
      assert.equal(options.credentials, "include");
      reviewBody = JSON.parse(options.body);
      return {ok:true,status:200,json:async()=>({accepted_items:1,historically_verified:false})};
    }
    throw Error("Unrecognized network endpoint " + url);
  },
};
async function main() {
  let original = fs.readFileSync(path.join(__dirname,"learning-review.js"),"utf8");
  const cdn='const pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs");';
  assert.ok(original.includes(cdn),"PDF.js import moved; update fixture");
  original=original.replace(cdn,"const pdfjs = globalThis.__pdfjsMock;");
  vm.runInNewContext(original,sandbox,{filename:"learning-review.js"});
  const file={name:"Venice-1677.pdf",type:"application/pdf",size:128,
    async arrayBuffer(){return Uint8Array.from([37,80,68,70,45]).buffer;}};
  els.learningFile.files=[file];
  await els.learningFile.fire("change");
  await els.learningAnalyze.fire("click");
  assert.equal(calls.length,2,"scanned PDF must upload and preview");
  assert.match(els.learningItems.innerHTML,/1677/);
  assert.match(els.learningSummary.textContent,/Kraken HTR/);
  assert.notMatch(els.learningItems.innerHTML,/VERIFIED/);
  const card={dataset:{i:"0"},querySelector(){return null;}};
  const btn={dataset:{act:"accept"}};
  els.learningItems.fire("click",{target:{closest(sel){
    return sel==="button[data-act]"?btn:sel===".learning-item"?card:null;
  }}});
  await els.learningSave.fire("click");
  assert.equal(calls.length,3);
  assert.equal(reviewBody.source_id,"src-test-scanned");
  assert.equal(reviewBody.items.length,1);
  assert.equal(reviewBody.pages[0].method,"KRAKEN_HTR");
  assert.equal(reviewBody.pages[0].transcription_review,"UNREVIEWED");
  console.log("NABOU SCANNED PDF UI -> SERVER HTR PREVIEW -> REVIEW PASS");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
