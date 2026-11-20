const S=require('./serve.cjs');const fs=require('fs');
(async()=>{const b=await S.launch();const c=await b.newContext({viewport:{width:1200,height:800}});await S.route(c);const p=await c.newPage();
await p.goto('https://lepe12.github.io/geraki-historical-atlas/jarvis-intelligence-chamber/?map3d=0');await p.waitForFunction(()=>document.getElementById('landP'),null,{timeout:30000});
const r=await p.evaluate(()=>{const l=document.getElementById('landP');const SC=2;const cv=document.createElement('canvas');cv.width=1800*SC;cv.height=1105*SC;const g=cv.getContext('2d');g.fillStyle='#000';g.fillRect(0,0,cv.width,cv.height);g.scale(SC,SC);g.fillStyle='#fff';
 const info={tag:l.tagName,tr:l.getAttribute('transform'),fr:l.getAttribute('fill-rule'),len:(l.getAttribute('d')||'').length,kids:l.children.length};
 const paths=l.tagName==='path'?[l]:[...l.querySelectorAll('path')];for(const e of paths)g.fill(new Path2D(e.getAttribute('d')),e.getAttribute('fill-rule')||getComputedStyle(e).fillRule||'nonzero');
 return {info,url:cv.toDataURL('image/png')};});
console.log(JSON.stringify(r.info));fs.writeFileSync('landmask.png',Buffer.from(r.url.split(',')[1],'base64'));await b.close();})();
