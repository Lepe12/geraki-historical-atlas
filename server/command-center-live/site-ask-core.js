// Shared search core: runs in Node (pct-live) and in the browser (demo). No network.
(function(root,factory){if(typeof module==="object"&&module.exports)module.exports=factory();else root.PCSiteAsk=factory();})(this,function(){
function createAsk(IDX){
const norm=s=>String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/ς/g,"σ");
const STOP=new Set("ο η το οι τα του τησ των τον την και να με σε στο στη στην στον στα στουσ για απο που ποιοσ ποια ποιο ποιοι τι πωσ ειναι ηταν εχει εχετε υπαρχει υπαρχουν site σαιτ σελιδα μου μασ σασ ενα μια ενασ κατι λεει λεω πεσ ειπε θελω ξερεισ αυτο αυτη για-τον τουσ τισ ή αν δεν".split(" "));
const stem=w=>w.length>5?w.slice(0,Math.max(5,w.length-3)):w; // crude Greek inflection: Λάντζας/Λάντζα, πειρατές/πειρατών
const toks=s=>norm(s).split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>1&&!STOP.has(w)).map(stem);
const docs=IDX.items.map(d=>{const t=toks(d.title),b=toks(d.text);const tf=new Map();for(const w of b)tf.set(w,(tf.get(w)||0)+1);for(const w of t)tf.set(w,(tf.get(w)||0)+6);return {d,tf,len:b.length+6*t.length,title:new Set(t)};});
const N=docs.length,avg=docs.reduce((a,x)=>a+x.len,0)/N,df=new Map();
for(const x of docs)for(const w of x.tf.keys())df.set(w,(df.get(w)||0)+1);
function snippet(text,q,type){const n=norm(text);let at=-1;for(const w of q){at=n.indexOf(w);if(at>=0)break;}
  if(at<0&&type==="βιβλίο / έντυπο")return "Βιβλίο / τεύχος στο κατάστημα του site.";let s=Math.max(0,at<0?0:at-25);if(s){const sp=text.indexOf(" ",s);if(sp>0&&sp<at)s=sp+1;}let t=text.slice(s,s+90);t=t.slice(0,Math.max(t.lastIndexOf(" "),60));return (s?"…":"")+t.trim()+"…";}
function ask(question){
  const q=[...new Set(toks(question))];
  if(/τι (εχει|υπαρχει|βρισκω)|τι περιεχει/.test(norm(question))&&q.length<=1){
    const by={};for(const x of IDX.items)by[x.type]=(by[x.type]||0)+1;
    return {found:true,answer:`Στο piratecartography.com υπάρχουν ${by["άρθρο"]||0} άρθρα (βιογραφίες πειρατών και κουρσάρων, σκαριά, χαρτογράφοι, εκδηλώσεις, συνέδρια), ${by["βιβλίο / έντυπο"]||0} βιβλία και τεύχη${by["ορμητήριο"]?`, ${by["ορμητήριο"]} σελίδες ορμητηρίων (νησιά)`:""}, και σελίδες όπως Ορμητήρια, Χαρτογραφικές Συνθέσεις, Ντοκιμαντέρ.`,
      links:IDX.items.filter(x=>["/blog-slider","/destination-list","/product-list/2-columns"].some(p=>x.url.endsWith(p))).map(x=>({title:x.title,url:x.url}))};
  }
  if(q.some(t=>t.startsWith("βιβλι"))&&q.filter(t=>!t.startsWith("βιβλι")&&!["εχει","εκδοσ","γραψ"].some(p=>t.startsWith(p))).length===0){
    const prods=IDX.items.filter(x=>x.type==="βιβλίο / έντυπο");const mags=prods.filter(x=>/Τεύχος/.test(x.title)),books=prods.filter(x=>!/Τεύχος/.test(x.title));
    return {found:true,answer:`Το site έχει ${books.length} βιβλία και ${mags.length} τεύχη της «Στρατιωτικής Ιστορίας». Μερικά:`,
      links:books.slice(0,3).map(x=>({title:x.title,type:x.type,url:x.url,image:x.image||null,snippet:snippet(x.text,[],x.type)})).concat([{title:"Όλα τα βιβλία",type:"σελίδα",url:"https://www.piratecartography.com/product-list/2-columns",image:null,snippet:"Η σελίδα Βιβλία του site."}])};
  }
  const scored=docs.map(x=>{let s=0,hit=0;for(const w of q){const f=x.tf.get(w)||0;if(!f)continue;hit++;
      const idf=Math.log(1+(N-df.get(w)+0.5)/(df.get(w)+0.5));s+=idf*f*2.2/(f+1.2*(0.25+0.75*x.len/avg));if(x.title.has(w))s+=2;}
    const hub=/\/(blog-slider|ships|product-list\/2-columns|cartographers-explorers|documentary)?$/.test(x.d.url)&&x.d.type==="σελίδα";
    const allT=q.length&&q.every(t=>x.title.has(t));const w=(allT?2+q.length/x.title.size:1)*(hub?0.45:x.d.type==="άρθρο"?1.1:1);return {x,s:w*s*(hit/Math.max(1,q.length)),hit};}).filter(r=>r.hit).sort((a,b)=>b.s-a.s);
  const best=scored[0];
  if(!q.length||!best||best.s<2.5)return {found:false,answer:"Δεν βρήκα κάτι στο site γι’ αυτό. Δες τις Βιογραφίες Πειρατών ή τα Ορμητήρια:",links:[{title:"Βιογραφίες Πειρατών & Κουρσάρων",url:"https://www.piratecartography.com/blog-slider"},{title:"Ορμητήρια",url:"https://www.piratecartography.com/destination-list"}]};
  const top=scored.filter(r=>r.s>=best.s*0.35).slice(0,3);
  return {found:true,answer:"Στο site βρήκα:",links:top.map(r=>({title:r.x.d.title,type:r.x.d.type,url:r.x.d.url,image:r.x.d.image||null,snippet:snippet(r.x.d.text,q,r.x.d.type),score:+r.s.toFixed(2)}))};
}
return ask;
}
return {createAsk};
});
