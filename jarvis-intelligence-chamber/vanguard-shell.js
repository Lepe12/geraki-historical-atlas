/* Right-hand view binds to existing live DOM, never simulates historical results. */
(()=>{"use strict";const $=id=>document.getElementById(id);
const nav=(view)=>document.querySelector('.nxs-dock [data-nxs-view="'+view+'"]')?.click();
document.querySelectorAll("[data-vgd-open]").forEach(b=>b.addEventListener("click",()=>nav(b.dataset.vgdOpen)));
const paint=()=>{const agents=document.querySelectorAll(".nxs-agent[data-activity='active']").length;
const total=document.querySelectorAll(".nxs-agent").length;
const el=$("vgdAgents");if(el)el.textContent=agents+" / "+total;
const count=$("resultsCount");if($("vgdResults"))$("vgdResults").textContent=count?.textContent?.trim()||"0";
const state=document.querySelector(".nxs-status small")?.textContent?.trim()||"Άγνωστη";
if($("vgdBridge")){$("vgdBridge").textContent=state;$("vgdBridge").className=/ζωνταν|live/i.test(state)?"vgd-live":/χωρίς|offline/i.test(state)?"vgd-warn":"";}
const mission=$("missionState")?.textContent?.trim();if($("vgdMission"))$("vgdMission").textContent=mission||"Έτοιμο";
};new MutationObserver(paint).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["data-activity"]});paint();
})();