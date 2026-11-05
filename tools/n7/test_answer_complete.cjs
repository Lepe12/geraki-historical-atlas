'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname+'/answer_complete_function.js', 'utf8');
function makeAnswer(responses, groq=true) {
  const calls = [];
  const context = {
    API_KEY:'test-key', MODEL: groq?'qwen/qwen3.8-27b':'other-model',
    BASE: groq?'https://api.groq.com/openai/v1':'https://other.example/v1',
    promptMessages:x=>x, URL, AbortController, setTimeout, clearTimeout,
    console:{warn:()=>{}},
    fetch:async (_url,req)=>{
      calls.push(JSON.parse(req.body));
      const datum=responses.shift();
      if (datum instanceof Error) throw datum;
      return {ok: true, json:async()=>({choices:[{message:{content:datum.text},finish_reason:datum.reason}]})};
    }
  };
  return {answer:vm.runInNewContext(source+'\nanswer',context),calls};
}
test('full output returns without an unnecessary retry',async()=>{
  const s=makeAnswer([{text:'Ολοκληρώθηκε.',reason:'stop'}]);
  assert.equal(await s.answer([{role:'user',content:'Δοκιμή'}]),'Ολοκληρώθηκε.');
  assert.equal(s.calls.length,1);
  assert.equal(s.calls[0].max_completion_tokens,4096);
  assert.equal(s.calls[0].reasoning_effort,'none');
});
test('finish_reason=length continues automatically without dropping prior text',async()=>{
  const s=makeAnswer([{text:'Η αρχή. ',reason:'length'}, {text:'Το τέλος.',reason:'stop'}]);
  assert.equal(await s.answer([{role:'user',content:'Δοκιμή'}]),'Η αρχή. Το τέλος.');
  assert.equal(s.calls.length,2);
  assert.equal(s.calls[1].messages.at(-2).content,'Η αρχή. ');
});
test('third truncated block is marked visibly',async()=>{
  const s=makeAnswer([{text:'Α',reason:'length'}, {text:'Β',reason:'length'}, {text:'Γ',reason:'length'}]);
  const out=await s.answer([]);
  assert.match(out,/ΑΒΓ/);
  assert.match(out,/διακόπηκε/);
  assert.equal(s.calls.length,3);
});
test('partial answer survives retry transport failure',async()=>{
  const s=makeAnswer([{text:'Πρώτο μέρος.',reason:'length'},new Error('connection failure')]);
  const out=await s.answer([]);
  assert.match(out,/Πρώτο μέρος/);
  assert.match(out,/συνέχισε/);
});
test('other model is unaffected by Groq-specific parameters',async()=>{
  const s=makeAnswer([{text:'Other',reason:'stop'}],false);
  assert.equal(await s.answer([]),'Other');
  assert.equal(s.calls[0].max_completion_tokens,undefined);
});
