"use strict";
/* Local PDF text heuristics. Nothing extracted here is historically verified. */
(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  root.NabouLearning=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  const stop=new Set("την τον της του των το τα τις τους στη στην στο στον και εις από απο για με ο η οι εν ένας μια ένα αυτό αυτή σελίδες περιεχόμενα κεφάλαιο βιβλιογραφία the this that from with there their they for and but not chapter page figure table introduction conclusion references bibliography".split(" "));
  const normalized=t=>t.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase();
  const confidence={date:0.45,person:0.34,place:0.3,relationship:0.28,excerpt:0.2};

  function proposals(pages){
    const items=[],seen=new Set(),add=(type,text,page)=>{
      text=String(text||"").replace(/\s+/g," ").trim();
      if(text.length<3)return;
      const key=type+"|"+page+"|"+text.toLowerCase();
      if(seen.has(key))return;
      seen.add(key);
      items.push({
        id:"k-"+items.length,
        type:type==="excerpt"?"claim":type,
        extraction_kind:type,
        text,
        page,
        pdf_page:page,
        printed_page:null,
        confidence:confidence[type]??0.2,
        extraction_method:"text_layer_heuristic",
        verification_status:"UNREVIEWED",
        status:"pending",
        editing:false
      });
    };
    for(const pg of pages||[]){
      const text=String(pg.text||"").replace(/\s+/g," ").trim();
      if(!text)continue;
      for(const m of text.matchAll(/(?<!\d)(1\d{3}|20\d{2})(?!\d)/g))add("date",m[1],pg.page);
      for(const m of text.matchAll(/[\p{Lu}][\p{Ll}’'-]{2,}(?:\s+[\p{Lu}][\p{Ll}’'-]{2,}){1,3}/gu)){
        const value=m[0].trim();
        if(value.length>90||value.split(/\s+/).some(w=>stop.has(normalized(w))))continue;
        add("person",value,pg.page);
      }
      for(const m of text.matchAll(/(?:στη|στην|στο|στον|εις|in|at|near)\s+([\p{Lu}][\p{L}’'-]{2,})/gu))add("place",m[1],pg.page);
      for(const m of text.matchAll(/([\p{Lu}][\p{L}’'-]{2,}(?:\s+[\p{Lu}][\p{L}’'-]{2,}){0,2})\s+(?:του|της|of|di)\s+([\p{Lu}][\p{L}’'-]{2,})/gu)){
        add("relationship",m[1]+" → "+m[2],pg.page);
      }
      const passages=text.match(/[^.!?]+(?:[.!?]+|$)/g)||[text];
      for(const passage of passages){
        const words=passage.trim().split(/\s+/);
        let chunk="";
        for(const word of words){
          if(chunk.length+word.length>800){add("excerpt",chunk,pg.page);chunk="";}
          chunk+=(chunk?" ":"")+word;
        }
        if(chunk.length>=35)add("excerpt",chunk,pg.page);
      }
    }
    return items;
  }

  return {proposals};
});
