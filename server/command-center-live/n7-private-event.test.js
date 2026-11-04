"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {isTrustedPrivateWorker}=require("./app");
const valid={
  repository:"Lepe12/independent-ai-bot",
  ref:"refs/heads/main",
  workflow_ref:"Lepe12/independent-ai-bot/.github/workflows/n7-private-model.yml@refs/heads/main",
  run_id:"123456789"
};
test("accept only a specific private N7 main-branch workflow",()=>{
  assert.equal(isTrustedPrivateWorker(valid),true);
  assert.equal(isTrustedPrivateWorker({...valid,repository:"Lepe12/geraki-historical-atlas"}),false);
  assert.equal(isTrustedPrivateWorker({...valid,ref:"refs/heads/experiment"}),false);
  assert.equal(isTrustedPrivateWorker({...valid,workflow_ref:"Lepe12/independent-ai-bot/.github/workflows/unreviewed.yml@refs/heads/main"}),false);
  assert.equal(isTrustedPrivateWorker({...valid,run_id:"not-numeric"}),false);
  assert.equal(isTrustedPrivateWorker(null),false);
});
