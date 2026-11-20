const S=require(process.env.NBC_SERVE||'./serve.cjs'),assert=require('assert');
(async()=>{const b=await S.launch();const ctx=await b.newContext({viewport:{width:1440,height:900}});await S.route(ctx);
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
const U='https://lepe12.github.io/geraki-historical-atlas/jarvis-intelligence-chamber/';
await p.goto(U+'?map3d=0');await p.waitForFunction(()=>document.body.dataset.nbcRecords==='44',null,{timeout:30000});await p.waitForTimeout(1500);
const ok=m=>console.log('PASS',m);
// search a GERAKI record through the existing top field
await p.click('#n7Search');await p.keyboard.type('Parga');await p.waitForTimeout(300);
const opts=await p.$$eval('#n7SearchResults button',bs=>bs.map(b=>b.textContent));assert(opts.some(t=>/GERAKI/.test(t)),JSON.stringify(opts));
await p.keyboard.press('Enter');await p.waitForTimeout(800);
assert.match(await p.textContent('#nbcRecord .nbc-name'),/Πάργα|Parga/);ok('search → GERAKI record in dock: '+await p.textContent('#nbcRecord .nbc-name'));
assert(await p.$eval('.nbc-pin[data-sel]',e=>!!e));ok('pin highlighted');
// reference place keeps original path
await p.evaluate(()=>NABOU_PRO_ATLAS.select('corfu'));await p.waitForTimeout(500);
assert.equal(await p.evaluate(()=>NABOU_PRO_ATLAS.selected),'corfu');
assert(await p.isVisible('#proPlaceInfo'));assert.match(await p.textContent('#nbcRecord'),/Κέρκυρα/);ok('reference place Κέρκυρα: card + linked GERAKI record');
for(const t of ['towns','monuments','people','routes','sources']){await p.click(`.nbc-tab[data-tab="${t}"]`);const n=await p.$$eval('#nbcRecord .nbc-item,#nbcRecord .nbc-person,#nbcRecord .nbc-src',x=>x.length);assert(n>0,t);ok('tab '+t+' '+n);}
await p.screenshot({path:'t-people.png'});
// book + timeline
await p.click('.nbc-seg button[data-book="Book III"]');const vis=await p.$$eval('.nbc-pin:not([hidden])',x=>x.length);ok('book III visible pins '+vis);
await p.click('.nbc-seg button[data-book="All"]');
await p.click('.nbc-yr-ev');await p.waitForTimeout(300);{const per=await p.evaluate(()=>NABOU_COMMAND.state);assert.equal(per.from,1500);assert.equal(per.to,1700);
 assert(/Γεγονότα πειρατείας/.test(await p.textContent('#nbcKicker')));ok('timeline event bin → events list, period unchanged');}
{const R=await p.$eval('#n7TimelineRange',e=>e.getBoundingClientRect().toJSON());await p.mouse.click(R.x+R.width*.25,R.y+R.height/2);await p.waitForTimeout(200);
 const per=await p.evaluate(()=>NABOU_COMMAND.state);assert.equal(per.from,1550);assert.equal(per.to,1700);ok('timeline press moves only the nearest end');
 await p.evaluate(()=>{const [a,b]=document.querySelectorAll('#n7TimelineRange input[type=range]');a.value='1500';a.dispatchEvent(new Event('input',{bubbles:true}));});}
assert.equal(await p.$$eval('.nbc-person',x=>x.filter(e=>/Adel|Artemis|Kontokal/i.test(e.textContent)).length),0);ok('no novel characters in people');
// nav panel button + layers
await p.click('.n7-nav [data-nbc-panel="towns"]');assert.equal(await p.evaluate(()=>NABOU_COMMAND.state.tab),'towns');ok('Neocom panel button');
await p.click('.n7-nav [data-n7-nav="layers"]');await p.waitForTimeout(300);assert(await p.isVisible('#nbcLayers'));ok('layers panel with GERAKI section');
await p.click('.n7-nav [data-n7-nav="layers"]');
// 3D
await p.click('#nbc3d');await p.waitForFunction(()=>window.NABOU_MAP3D?.enabled&&NABOU_MAP3D.ready,null,{timeout:60000});await p.waitForTimeout(4000);
const n3=await p.$$eval('.nbc-pin3d',x=>x.length);assert(n3>20);ok('3D on, GERAKI pins in 3D: '+n3);
await p.evaluate(()=>NABOU_COMMAND.selectRecord(DATA_ID='recpx7D977eKSHziY'));await p.waitForTimeout(2500);
await p.screenshot({path:'/home/claude/nabou-work/ch/t-3d.png'});
assert.deepEqual(errs,[]);ok('no page errors');
// embed: interface stays off
const e=await ctx.newPage();await e.goto(U);await e.evaluate(()=>0);
await b.close();})().catch(e=>{console.error('FAIL',e);process.exit(1)});
