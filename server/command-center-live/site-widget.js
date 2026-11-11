/* «Ρώτα τον Καπετάνιο» chat bubble for piratecartography.com, served by pct-live at /site/widget.js.
   Loaded by one footer <script> tag in WordPress (Code Snippets). No WPBakery, no plugin, no external fonts.
   Answers come from pct-live POST /site/ask, which only searches the site's own public texts. */
(function(){
if(window.__pcCaptainLoaded||!document.body)return;window.__pcCaptainLoaded=true;
var API="https://pct-live.piratecartography.com/site/ask";
var AVATAR="https://pct-live.piratecartography.com/site/captain.jpg"; // N7 portrait (NABOU cartographer-gold), served by pct-live
var CHIPS=["Ποιοι ήταν οι Μπαρμπαρόσα;","Τι ήταν η γαλέρα;","Ποια βιβλία έχει το site;"];
var WHEEL='<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"><circle cx="32" cy="32" r="17"/><circle cx="32" cy="32" r="6"/>'+
 [0,45,90,135,180,225,270,315].map(function(a){return '<line x1="32" y1="32" x2="32" y2="3" transform="rotate('+a+' 32 32)"/>';}).join("")+
 '</g><g fill="currentColor">'+[0,45,90,135,180,225,270,315].map(function(a){return '<circle cx="32" cy="4" r="3.6" transform="rotate('+a+' 32 32)"/>';}).join("")+'<circle cx="32" cy="32" r="3"/></g></svg>';
var F='Georgia,"Noto Serif",serif';
var css='#pcc-btn,#pcc-panel,#pcc-panel *{box-sizing:border-box;text-transform:none;letter-spacing:normal;text-shadow:none}#pcc-btn,#pcc-panel button,#pcc-panel input{margin:0;min-height:0;width:auto;height:auto;line-height:1.2}#pcc-panel img,#pcc-btn img{max-width:none}'+
 '#pcc-btn{position:fixed;right:24px;bottom:24px;z-index:2147483000;display:flex;align-items:center;gap:12px;padding:7px 24px 7px 7px;border-radius:48px;cursor:pointer;'+
 'background:linear-gradient(180deg,#5a3720 0%,#3a2213 55%,#2a170c 100%);color:#f3e3bd;border:2px solid #c4974a;box-shadow:0 0 0 3px rgba(42,23,12,.55),0 10px 26px rgba(0,0,0,.5);'+
 'font:600 19px/1.1 '+F+';letter-spacing:.2px}#pcc-btn:hover{filter:brightness(1.12)}'+
 '.pcc-av{display:block;flex:none;border-radius:50%;object-fit:cover;object-position:50% 30%;background:#120b05;border:3px solid #c4974a;box-shadow:0 0 0 2px #2a170c,inset 0 0 0 1px #e9c77f}'+
 '#pcc-btn .pcc-av{width:56px;height:56px}#pcc-btn .w{width:22px;height:22px;color:#d9ad5c;margin-left:-4px}'+
 '#pcc-panel{position:fixed;right:24px;bottom:104px;z-index:2147483000;width:400px;max-width:calc(100vw - 24px);height:640px;max-height:calc(100vh - 128px);display:flex;flex-direction:column;'+
 'border-radius:14px;overflow:hidden;border:2px solid #c4974a;box-shadow:0 0 0 4px rgba(42,23,12,.6),0 18px 40px rgba(0,0,0,.5);font:15px/1.45 '+F+';color:#2b1d10;'+
 'background:#f2e4c4 radial-gradient(ellipse at center,#f7ecd2 0%,#efdfb9 65%,#dcc28f 100%)}#pcc-panel[hidden]{display:none}'+
 '#pcc-head{display:flex;align-items:center;gap:12px;padding:12px 14px;background:linear-gradient(180deg,#5a3720,#2f1b0e);color:#f3e3bd;border-bottom:2px solid #c4974a}'+
 '#pcc-head .pcc-av{width:58px;height:58px}#pcc-head b{display:block;font-size:19px;letter-spacing:.3px}#pcc-head small{display:block;font-size:12.5px;opacity:.9;line-height:1.3}'+
 '#pcc-x{margin-left:auto;align-self:flex-start;background:none;border:0;color:#f3e3bd;font-size:24px;cursor:pointer;line-height:1;padding:2px 4px}'+
 '#pcc-log{position:relative;flex:1;overflow-y:auto;padding:12px 12px 4px}'+
 '.pcc-m{margin:0 0 10px;max-width:94%;padding:9px 12px;border-radius:12px}'+
 '.pcc-u{margin-left:auto;background:#3a2213;color:#f3e3bd;border-bottom-right-radius:3px;width:fit-content}'+
 '.pcc-c{background:rgba(255,250,236,.75);border:1px solid #cfae73;border-bottom-left-radius:3px}'+
 '.pcc-chips{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 12px}'+
 '.pcc-chips button{background:#fffaf0;border:1px solid #b58c4a;color:#5a2a10;border-radius:16px;padding:6px 12px;font:14px '+F+';cursor:pointer;text-align:left}'+
 '.pcc-chips button:hover{background:#3a2213;color:#f3e3bd}'+
 '.pcc-cards{display:flex;flex-direction:column;gap:7px;margin-top:7px}'+
 '.pcc-card{display:flex;gap:10px;align-items:center;padding:6px;border-radius:9px;background:#fffaf0;border:1px solid #d8bb83;text-decoration:none;color:#2b1d10}'+
 '.pcc-card:hover{border-color:#8a5a22;box-shadow:0 2px 8px rgba(60,35,10,.18)}'+
 '.pcc-img{flex:none;width:58px;height:58px;border-radius:6px;object-fit:cover;background:#e8d3a4;border:1px solid #c9a868}'+
 '.pcc-ph{display:flex;align-items:center;justify-content:center;color:#a37b3c;background:radial-gradient(circle,#f3e4bf,#dcc28f)}.pcc-ph svg{width:30px;height:30px}'+
 '.pcc-tx{min-width:0;flex:1}.pcc-ti{display:block;color:#7a2e12;font-weight:700;font-size:14px;line-height:1.25;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}'+
 '.pcc-t{display:inline-block;margin:2px 0 1px;font-style:normal;font-size:10.5px;color:#6b4a22;background:#ead6a6;border-radius:8px;padding:0 6px}'+
 '.pcc-sn{font-size:12px;color:#5b4428;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}'+
 '#pcc-f{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #cfae73;background:rgba(220,194,143,.35)}'+
 '#pcc-q{flex:1;min-width:0;padding:9px 11px;border:1px solid #b58c4a;border-radius:8px;background:#fffaf0;font:15px '+F+';color:#2b1d10}'+
 '#pcc-f button{background:linear-gradient(180deg,#5a3720,#2f1b0e);color:#f3e3bd;border:1px solid #c4974a;border-radius:8px;padding:0 14px;font:600 14px '+F+';cursor:pointer}'+
 '@media (max-width:520px){#pcc-btn{right:14px;bottom:14px;font-size:17px;padding-right:18px}#pcc-btn .pcc-av{width:50px;height:50px}'+
 '#pcc-panel{right:10px;left:10px;width:auto;bottom:88px;height:auto;top:12px;max-height:none}}';
var st=document.createElement("style");st.textContent=css;document.head.appendChild(st);
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
var av='<img class="pcc-av" src="'+esc(AVATAR)+'" alt="">';
var b=document.createElement("button");b.id="pcc-btn";b.type="button";b.innerHTML=av+'<span>Ρώτα τον Καπετάνιο</span><span class="w">'+WHEEL+'</span>';
var p=document.createElement("div");p.id="pcc-panel";p.hidden=true;p.setAttribute("role","dialog");p.setAttribute("aria-label","Ο Καπετάνιος");
p.innerHTML='<div id="pcc-head">'+av+'<div><b>Ο Καπετάνιος</b><small>Ρώτα με για πειρατές, κουρσάρους, χάρτες και βιβλία του site.</small></div><button id="pcc-x" type="button" aria-label="Κλείσιμο">×</button></div>'+
 '<div id="pcc-log"><div class="pcc-m pcc-c">Καλώς ήρθες στο κατάστρωμα! Τι θέλεις να μάθεις;</div><div class="pcc-chips">'+
 CHIPS.map(function(c){return '<button type="button">'+esc(c)+'</button>';}).join("")+'</div></div>'+
 '<form id="pcc-f"><input id="pcc-q" maxlength="200" autocomplete="off" placeholder="π.χ. Ποιος ήταν ο Πέτρος Λάντζας;"><button type="submit">Ρώτα</button></form>';
document.body.appendChild(p);document.body.appendChild(b);
var log=p.querySelector("#pcc-log"),inp=p.querySelector("#pcc-q");
function add(cls,html){var d=document.createElement("div");d.className="pcc-m "+cls;d.innerHTML=html;log.appendChild(d);log.scrollTop=log.scrollHeight;return d;}
function toggle(open){p.hidden=!open;if(open&&matchMedia("(min-width:521px)").matches)inp.focus();}
b.onclick=function(){toggle(p.hidden);};p.querySelector("#pcc-x").onclick=function(){toggle(false);};
function remote(q){return fetch(API,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({question:q})}).then(function(r){return r.json().then(function(j){if(!r.ok&&!j.answer)throw new Error(r.status);return j;});});}
function card(l){var img=l.image?'<img class="pcc-img" src="'+esc(l.image)+'" alt="" loading="lazy" onerror="this.outerHTML=\'<span class=&quot;pcc-img pcc-ph&quot;></span>\'">':'<span class="pcc-img pcc-ph">'+WHEEL+'</span>';
 return '<a class="pcc-card" href="'+esc(l.url)+'" target="_top">'+img+'<span class="pcc-tx"><span class="pcc-ti">'+esc(l.title)+'</span>'+(l.type?'<em class="pcc-t">'+esc(l.type)+'</em>':'')+(l.snippet?'<span class="pcc-sn">'+esc(l.snippet)+'</span>':'')+'</span></a>';}
function askQ(q){var qd=add("pcc-u",esc(q));
 remote(q).then(function(r){
  add("pcc-c",esc(r.answer||"Δεν βρήκα κάτι στο site.")+'<div class="pcc-cards">'+(r.links||[]).map(card).join("")+'</div>');log.scrollTop=qd.offsetTop-8;
 }).catch(function(){add("pcc-c","Ο Καπετάνιος δεν απαντά τώρα. Δοκίμασε σε λίγο.");});}
p.querySelector("#pcc-f").onsubmit=function(e){e.preventDefault();var q=inp.value.trim();if(!q)return;inp.value="";askQ(q);};
[].forEach.call(p.querySelectorAll(".pcc-chips button"),function(c){c.onclick=function(){askQ(c.textContent);};});
})();
