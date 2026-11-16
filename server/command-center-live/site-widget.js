/* «Ρώτα τον Καπετάνιο» chat bubble for piratecartography.com, served by pct-live at /site/widget.
   Closed: a small round portrait button bottom-right (label only as tooltip). Rendered in a Shadow DOM so the theme cannot restyle or misplace it.
   Loaded by one footer <script> tag in WordPress (Code Snippets). No WPBakery, no plugin, no external fonts.
   Answers come from pct-live POST /site/ask, which only searches the site's own public texts. */
(function(){
if(window.__pcCaptainLoaded||!document.body)return;window.__pcCaptainLoaded=true;
var API="https://pct-live.piratecartography.com/site/ask";
var AVATAR="https://pct-live.piratecartography.com/site/captain"; // N7 portrait (NABOU cartographer-gold), served by pct-live
var CHIPS=["Ποιοι ήταν οι Μπαρμπαρόσα;","Τι ήταν η γαλέρα;","Ποια βιβλία έχει το site;"];
var WHEEL='<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"><circle cx="32" cy="32" r="17"/><circle cx="32" cy="32" r="6"/>'+
 [0,45,90,135,180,225,270,315].map(function(a){return '<line x1="32" y1="32" x2="32" y2="3" transform="rotate('+a+' 32 32)"/>';}).join("")+
 '</g><g fill="currentColor">'+[0,45,90,135,180,225,270,315].map(function(a){return '<circle cx="32" cy="4" r="3.6" transform="rotate('+a+' 32 32)"/>';}).join("")+'<circle cx="32" cy="32" r="3"/></g></svg>';
var F='Georgia,"Noto Serif",serif';
var css=':host{all:initial;display:block}'+
 '*,*::before,*::after{box-sizing:border-box;text-transform:none;letter-spacing:normal;text-shadow:none}'+
 'button,input{margin:0;min-height:0;line-height:1.2}img{max-width:none;border:0}'+
 '#pcc-btn{position:fixed;right:calc(20px + env(safe-area-inset-right,0px));bottom:calc(20px + env(safe-area-inset-bottom,0px));z-index:2147483000;'+
 'width:54px;height:54px;padding:0;border-radius:50%;border:2px solid #c4974a;background:#120b05;cursor:pointer;overflow:visible;'+
 'box-shadow:0 0 0 1px rgba(42,23,12,.55),0 4px 12px rgba(0,0,0,.35);transition:transform .15s ease,box-shadow .15s ease}'+
 '#pcc-btn:hover,#pcc-btn:focus-visible{transform:scale(1.06);box-shadow:0 0 0 1px rgba(42,23,12,.6),0 6px 16px rgba(0,0,0,.42)}'+
 '#pcc-btn:focus-visible{outline:2px solid #e9c77f;outline-offset:2px}'+
 '#pcc-btn img{display:block;width:100%;height:100%;border-radius:50%;object-fit:cover;object-position:50% 30%}'+
 '#pcc-tip{position:absolute;right:calc(100% + 10px);top:50%;transform:translateY(-50%) translateX(4px);white-space:nowrap;pointer-events:none;opacity:0;'+
 'background:#2f1b0e;color:#f3e3bd;border:1px solid #c4974a;border-radius:6px;padding:5px 9px;font:13px/1.2 '+F+';box-shadow:0 3px 10px rgba(0,0,0,.3);transition:opacity .15s ease,transform .15s ease}'+
 '#pcc-btn:hover #pcc-tip,#pcc-btn:focus-visible #pcc-tip{opacity:1;transform:translateY(-50%)}'+
 '#pcc-btn[aria-expanded="true"] #pcc-tip{display:none}'+
 '.pcc-av{display:block;flex:none;border-radius:50%;object-fit:cover;object-position:50% 30%;background:#120b05;border:3px solid #c4974a;box-shadow:0 0 0 2px #2a170c,inset 0 0 0 1px #e9c77f}'+
 '#pcc-panel{position:fixed;right:calc(20px + env(safe-area-inset-right,0px));bottom:calc(86px + env(safe-area-inset-bottom,0px));z-index:2147483000;width:400px;max-width:calc(100vw - 24px);height:640px;max-height:calc(100vh - 110px);display:flex;flex-direction:column;'+
 'border-radius:14px;overflow:hidden;border:2px solid #c4974a;box-shadow:0 0 0 4px rgba(42,23,12,.6),0 18px 40px rgba(0,0,0,.5);font:15px/1.45 '+F+';color:#2b1d10;text-align:left;'+
 'background:#f2e4c4 radial-gradient(ellipse at center,#f7ecd2 0%,#efdfb9 65%,#dcc28f 100%)}#pcc-panel[hidden]{display:none}'+
 '#pcc-head{display:flex;align-items:center;gap:12px;padding:12px 14px;background:linear-gradient(180deg,#5a3720,#2f1b0e);color:#f3e3bd;border-bottom:2px solid #c4974a}'+
 '#pcc-head .pcc-av{width:58px;height:58px}#pcc-head b{display:block;font-size:19px;letter-spacing:.3px}#pcc-head small{display:block;font-size:12.5px;opacity:.9;line-height:1.3}'+
 '#pcc-x{margin-left:auto;align-self:flex-start;background:none;border:0;color:#f3e3bd;font-size:24px;cursor:pointer;line-height:1;padding:2px 4px}'+
 '#pcc-log{position:relative;flex:1;overflow-y:auto;padding:12px 12px 4px}'+
 '.pcc-m{margin:0 0 10px;max-width:94%;padding:9px 12px;border-radius:12px}'+
 '.pcc-u{margin-left:auto;background:#3a2213;color:#f3e3bd;border-bottom-right-radius:3px;width:fit-content}'+
 '.pcc-c{background:rgba(255,250,236,.75);border:1px solid #cfae73;border-bottom-left-radius:3px}'+
 '.pcc-chips{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 12px}'+
 '.pcc-chips button{background:#fffaf0;border:1px solid #b58c4a;color:#5a2a10;border-radius:16px;padding:6px 12px;font:14px/1.2 '+F+';cursor:pointer;text-align:left}'+
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
 '@media (max-width:520px){#pcc-btn{width:48px;height:48px;right:calc(14px + env(safe-area-inset-right,0px));bottom:calc(14px + env(safe-area-inset-bottom,0px))}'+
 '#pcc-panel{right:10px;left:10px;width:auto;max-width:none;bottom:calc(72px + env(safe-area-inset-bottom,0px));height:auto;top:12px;max-height:none}}'+
 '@media (prefers-reduced-motion:reduce){#pcc-btn,#pcc-tip{transition:none}}';
// Shadow DOM host on <html> (not <body>): the theme's CSS cannot reach inside, and a transformed/filtered <body>
// cannot turn position:fixed into "fixed to the page", which is what misplaced the old button.
var host=document.createElement("pc-captain");
host.setAttribute("style","all:initial !important;display:block !important;position:fixed !important;top:auto !important;left:auto !important;right:0 !important;bottom:0 !important;width:0 !important;height:0 !important;margin:0 !important;padding:0 !important;border:0 !important;transform:none !important;filter:none !important;z-index:2147483000 !important;");
var root=host.attachShadow?host.attachShadow({mode:"open"}):host;
var st=document.createElement("style");st.textContent=css;root.appendChild(st);
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
var av='<img class="pcc-av" src="'+esc(AVATAR)+'" alt="">';
var b=document.createElement("button");b.id="pcc-btn";b.type="button";b.setAttribute("aria-label","Ρώτα τον Καπετάνιο");b.setAttribute("aria-expanded","false");b.setAttribute("aria-controls","pcc-panel");
b.innerHTML='<img src="'+esc(AVATAR)+'" alt=""><span id="pcc-tip" aria-hidden="true">Ρώτα τον Καπετάνιο</span>';
var p=document.createElement("div");p.id="pcc-panel";p.hidden=true;p.setAttribute("role","dialog");p.setAttribute("aria-label","Ο Καπετάνιος");
p.innerHTML='<div id="pcc-head">'+av+'<div><b>Ο Καπετάνιος</b><small>Ρώτα με για πειρατές, κουρσάρους, χάρτες και βιβλία του site.</small></div><button id="pcc-x" type="button" aria-label="Κλείσιμο">×</button></div>'+
 '<div id="pcc-log"><div class="pcc-m pcc-c">Καλώς ήρθες στο κατάστρωμα! Τι θέλεις να μάθεις;</div><div class="pcc-chips">'+
 CHIPS.map(function(c){return '<button type="button">'+esc(c)+'</button>';}).join("")+'</div></div>'+
 '<form id="pcc-f"><input id="pcc-q" maxlength="200" autocomplete="off" placeholder="π.χ. Ποιος ήταν ο Πέτρος Λάντζας;"><button type="submit">Ρώτα</button></form>';
root.appendChild(p);root.appendChild(b);(document.documentElement||document.body).appendChild(host);
var log=p.querySelector("#pcc-log"),inp=p.querySelector("#pcc-q");
function add(cls,html){var d=document.createElement("div");d.className="pcc-m "+cls;d.innerHTML=html;log.appendChild(d);log.scrollTop=log.scrollHeight;return d;}
function toggle(open){p.hidden=!open;b.setAttribute("aria-expanded",open?"true":"false");if(open&&matchMedia("(min-width:521px)").matches)inp.focus();}
document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!p.hidden){toggle(false);b.focus();}});
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
