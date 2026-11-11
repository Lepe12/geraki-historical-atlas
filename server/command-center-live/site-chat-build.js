#!/usr/bin/env node
"use strict";
// Builds the «Ρώτα τον Καπετάνιο» site index from the PUBLIC piratecartography.com WordPress site.
// Gentle by design (shared hosting): one request at a time, SITE_CHAT_GAP_MS (default 20 s) between requests,
// no retries, and it stops on the first 429/5xx without writing anything.
// Output (only public site texts, no library PDFs/OCR): site-index.json and site-chat-assets.json (captain portrait + 150x150 featured thumbnails).
// Usage: node site-chat-build.js [--captain path/to/captain.jpg]
const fs=require("fs"),path=require("path"),crypto=require("crypto");
const BASE="https://www.piratecartography.com";
const GAP=Number(process.env.SITE_CHAT_GAP_MS||20000);
const OUT=process.env.SITE_CHAT_OUT_DIR||__dirname;
const CACHE=process.env.SITE_CHAT_HTML_CACHE||"";
const ISLANDS=["paros","milos","mytilene","lefkada"].map(s=>BASE+"/archives/popular/"+s);
const SKIP=new Set(["cart","checkout","my-account","info-right","product-list","venue-dashboard","submit-venue-form","organizer-dashboard","submit-organizer-form","event-venues","event-organizers","home-ελληνικά"]);
const TYPE={posts:"άρθρο",pages:"σελίδα",product:"βιβλίο / έντυπο"};
const ENT={"&#8211;":"–","&#8212;":"—","&#8220;":"“","&#8221;":"”","&#8217;":"’","&#8216;":"‘","&#038;":"&","&amp;":"&","&nbsp;":" ","&#8230;":"…","&quot;":"\"","&laquo;":"«","&raquo;":"»","&euro;":"€","&lt;":"<","&gt;":">","&#039;":"’"};
const dec=s=>String(s||"").replace(/&#?\w+;/g,m=>ENT[m]??(/^&#\d+;$/.test(m)?String.fromCodePoint(parseInt(m.slice(2))):m));
const strip=h=>dec(String(h||"").replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi," ").replace(/<[^>]+>/g," ").replace(/\[\/?[a-z_][^\]]*\]/gi," ")).replace(/\s+/g," ").trim();
const nice=t=>{t=strip(t);return /[α-ω][Α-Ω]/.test(t)||/[Α-ΩΆ-Ώ]{4,}/.test(t)&&t===t.toUpperCase()?t.toLowerCase().replace(/(^|\s)(\p{L})/gu,(m,a,b)=>a+b.toUpperCase()):t;};
let last=0,requests=0;
async function get(url,as){
  const wait=last?Math.max(0,last+GAP-Date.now()):0;if(wait)await new Promise(r=>setTimeout(r,wait));
  last=Date.now();requests++;
  const res=await fetch(url,{headers:{"user-agent":"piratecartography-site-chat-index/1 (+pct-live; weekly, gentle)"},signal:AbortSignal.timeout(45000)});
  last=Date.now();
  console.log(res.status,url.replace(BASE,""));
  if(res.status===429||res.status>=500){const e=new Error("STOP_SERVER_BUSY "+res.status+" "+url);e.stop=true;throw e;}
  if(!res.ok)return null;
  if(as==="json")return {data:await res.json(),pages:Number(res.headers.get("x-wp-totalpages")||1)};
  if(as==="buf")return Buffer.from(await res.arrayBuffer());
  return await res.text();
}
async function restAll(kind){
  const out=[];
  for(let page=1;page<=10;page++){
    const r=await get(`${BASE}/wp-json/wp/v2/${kind}?per_page=100&page=${page}&_fields=id,link,title,content,featured_media`,"json");
    if(!r||!Array.isArray(r.data))break;out.push(...r.data);if(page>=r.pages)break;
  }
  return out;
}
function islandText(html){
  let h=String(html).replace(/<(header|footer|nav|aside|form)[\s\S]*?<\/\1>/gi," ");
  const m=h.match(/<(article|main)[\s\S]*?<\/\1>/i);if(m)h=m[0];
  const t=strip(h),cut=t.indexOf(" Destinations ");
  return cut>=0&&cut<300?t.slice(cut+14).trim():t; // drop the theme top bar (phone, e-mail, socials)
}
module.exports={islandText,strip,nice};
function readJson(f,d){try{return JSON.parse(fs.readFileSync(f,"utf8"));}catch{return d;}}
async function main(){
  const captainArg=process.argv.indexOf("--captain");
  const assetsFile=path.join(OUT,"site-chat-assets.json"),indexFile=path.join(OUT,"site-index.json");
  const oldAssets=readJson(assetsFile,{schema:"pct-site-chat-assets-v1",captain:null,thumbs:{}});
  const oldIndex=readJson(indexFile,null);
  const items=[],featured=new Map();
  for(const kind of ["posts","pages","product"]){
    for(const x of await restAll(kind)){
      const slug=decodeURIComponent(new URL(x.link).pathname.replace(/^\/|\/$/g,""));
      if(kind==="pages"&&SKIP.has(slug))continue;
      const text=strip(x.content?.rendered);
      if(text.length<40&&kind!=="product")continue;
      if(x.featured_media)featured.set(x.id,x.featured_media);
      items.push({id:x.id,type:TYPE[kind],title:nice(x.title?.rendered),url:x.link,thumb:null,text:text.slice(0,8000)});
    }
  }
  if(items.length<20)throw new Error("TOO_FEW_ITEMS "+items.length+" (REST closed or changed?) — keeping the old index");
  for(const url of ISLANDS){
    const html=await get(url,"text");if(!html)continue;
    if(CACHE){fs.mkdirSync(CACHE,{recursive:true});fs.writeFileSync(path.join(CACHE,path.basename(url)+".html"),html);}
    const title=nice((html.match(/<title>([^<]*)/i)||[])[1]||path.basename(url)).replace(/\s*[–-]\s*Pirate Cartography.*$/i,"");
    const text=islandText(html);
    if(text.length>=40)items.push({id:"island-"+path.basename(url),type:"ορμητήριο",title,url,thumb:null,text:text.slice(0,8000)});
  }
  // Featured thumbnails (150x150): reuse cached ones by media id, fetch only new ones.
  const thumbs={},need=[...new Set(featured.values())].filter(id=>!oldAssets.thumbs[id]);
  for(const id of featured.values())if(oldAssets.thumbs[id])thumbs[id]=oldAssets.thumbs[id];
  if(need.length){
    for(let i=0;i<need.length;i+=100){
      const r=await get(`${BASE}/wp-json/wp/v2/media?per_page=100&include=${need.slice(i,i+100).join(",")}&_fields=id,source_url,media_details`,"json");
      for(const m of (r?.data||[])){
        const src=m.media_details?.sizes?.thumbnail?.source_url;if(!src)continue;
        const ext=(src.match(/\.(jpe?g|png|webp|gif)$/i)||[])[1];if(!ext)continue;
        const buf=await get(encodeURI(decodeURI(src)),"buf");
        if(buf&&buf.length<=120000)thumbs[m.id]={ext:ext.toLowerCase().replace("jpeg","jpg"),b64:buf.toString("base64")};
      }
    }
  }
  for(const it of items){const mid=featured.get(it.id);if(mid&&thumbs[mid])it.thumb=mid+"."+thumbs[mid].ext;}
  let captain=oldAssets.captain;
  if(captainArg>0)captain=fs.readFileSync(process.argv[captainArg+1]).toString("base64");
  if(!captain)throw new Error("NO_CAPTAIN_PORTRAIT: run once with --captain <jpg>");
  const sha=crypto.createHash("sha256").update(JSON.stringify(items)).digest("hex");
  const assets={schema:"pct-site-chat-assets-v1",captain,thumbs};
  const assetsChanged=JSON.stringify(assets)!==JSON.stringify(oldAssets);
  if(oldIndex&&oldIndex.content_sha256===sha&&!assetsChanged){console.log("UNCHANGED",items.length,"items,",requests,"requests");return;}
  fs.writeFileSync(indexFile,JSON.stringify({schema:"pct-site-index-v1",built_at:new Date().toISOString(),source:BASE+"/wp-json/wp/v2/{posts,pages,product} + island pages",content_sha256:sha,count:items.length,items})+"\n");
  fs.writeFileSync(assetsFile,JSON.stringify(assets)+"\n");
  console.log("CHANGED",items.length,"items,",Object.keys(thumbs).length,"thumbs,",requests,"requests");
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exit(e.stop?75:1);});
