// N7_COMMAND_ROUTER_V1: deterministic routing of one user command to an existing N7 capability.
// It never executes a tool or invents a result. Unknown places get no coordinates.
(function(root){
 'use strict';
 const fold=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/ς/g,'σ');
 // atlas: id of a reference point that exists in NABOU (professional-atlas.js); null = recognised
 // name without an approved map position. Keys are folded prefixes / historical spellings.
 const PLACES=[
  {id:'corfu',terms:['Κέρκυρα','Corfu','Corcyra'],atlas:'corfu',name:'Κέρκυρα',keys:['κερκυρ','corfu','corcyra','korfu','κορυφω']},
  {id:'venice',terms:['Βενετία','Venice','Venezia'],atlas:'venice',name:'Βενετία',keys:['βενετι','venice','venezia']},
  {id:'algiers',terms:['Αλγέρι','Algiers','Alger'],atlas:'algiers',name:'Αλγέρι',keys:['αλγερι','algiers','alger']},
  {id:'barcelona',terms:['Βαρκελώνη','Barcelona'],atlas:'barcelona',name:'Βαρκελώνη',keys:['βαρκελων','barcelona']},
  {id:'tunis',terms:['Τύνιδα','Tunis'],atlas:'tunis',name:'Τύνιδα',keys:['τυνιδ','tunis']},
  {id:'istanbul',terms:['Κωνσταντινούπολη','Constantinople','Istanbul'],atlas:'istanbul',name:'Κωνσταντινούπολη',keys:['κωνσταντινουπολ','istanbul','constantinople']},
  {id:'chania',terms:['Χανιά','Canea','Chania'],atlas:'chania',name:'Χανιά',keys:['χανια','chania','canea']},
  {id:'heraklion',terms:['Χάνδακας','Candia','Heraklion'],atlas:'heraklion',name:'Χάνδακας',keys:['χανδακ','ηρακλει','candia','heraklion']},
  {id:'tripoli',terms:['Τρίπολη','Tripoli'],atlas:'tripoli',name:'Τρίπολη',keys:['τριπολη τησ λιβυησ','tripoli']},
  {id:'alexandria',terms:['Αλεξάνδρεια','Alexandria'],atlas:'alexandria',name:'Αλεξάνδρεια',keys:['αλεξανδρει','alexandria']},
  {id:'malta',terms:['Μάλτα','Malta'],atlas:'malta',name:'Μάλτα',keys:['μαλτα','malta','valletta','βαλετα']},
  {id:'astypalaia',terms:['Αστυπάλαια','Astypalaia','Stampalia','Astropalia'],atlas:null,name:'Αστυπάλαια',keys:['αστυπαλ','astypal','astipal','stampali','astropal']},
  {id:'gramvousa',terms:['Γραμβούσα','Gramvousa','Grabusa','Garabusa'],atlas:null,name:'Γραμβούσα',keys:['γραμβουσ','gramvous','grabus','garabus','grabous']}
 ];
 // Sea regions: valid search terms, never a map point.
 const REGIONS=[
  {id:'aegean',name:'Αιγαίο',keys:['αιγαι','aegean','archipelag','αρχιπελαγ'],terms:['Αιγαίο','Aegean','Archipelago']},
  {id:'ionian',name:'Ιόνιο',keys:['ιονι','ionian'],terms:['Ιόνιο','Ionian']},
  {id:'crete',name:'Κρήτη',keys:['κρητ','crete','candia'],terms:['Κρήτη','Crete','Candia']}
 ];
 const STOP=new Set(['αναζητησε','αναζητηση','βιβλιοθηκη','βιβλιοθηκησ','αναφορεσ','πηγεσ','ιστορικεσ','ιστορικα','μεταξυ','σχετικα','δειξε','βρεσ','ολεσ','κατα','αιωνα','αιωνεσ','περιοχη','στοιχεια','search','library','sources']);
 const AGENTS={
  'nabou.open':'NABOU Map Tools','nabou.focus':'NABOU Map Tools','nabou.sources':'NABOU Map Tools',
  'nabou.results':'NABOU Map Tools','humanoid.return':'Humanoid','library.search':'Historical Library Search',
  'historical.research':'Historical Research','web.news':'Web Research','web.search':'Web Research',
  'weather':'Weather data (Open-Meteo)','coding':'Coding Agent','chat':'N7 Core'
 };
 // Actions that run in the browser against NABOU / the library endpoint; all others go to the N7 server.
 const LOCAL=new Set(['nabou.open','nabou.focus','nabou.sources','nabou.results','humanoid.return','library.search','weather']);
 function findPlace(text){
  const f=' '+fold(text)+' ';
  for(const p of PLACES)if(p.keys.some(k=>f.includes(k)))return {id:p.id,name:p.name,atlas:p.atlas};
  return null;
 }
 function linkPlaces(text){
  const f=fold(text),out=[];
  for(const p of PLACES){const k=p.keys.find(k=>f.includes(k));if(k)out.push({id:p.id,name:p.name,atlas:p.atlas,matched:k,method:'NAME_MATCH_IN_SOURCE_TEXT'});}
  return out;
 }
 function years(text){
  const f=fold(text);
  const c=[...f.matchAll(/(?<![0-9])(1[0-9]|[5-9])\s*(?:ου|οσ|ο|th)(?![\p{L}])/gu)].map(m=>+m[1]).filter(n=>n>=5&&n<=19);
  if(/αιων|century/.test(f)&&c.length)return {from:(Math.min(...c)-1)*100,to:Math.max(...c)*100-1};
  const y=[...f.matchAll(/(?<![0-9])(1[0-9]{3})(?![0-9])/g)].map(m=>+m[1]);
  if(y.length>=2)return {from:Math.min(...y),to:Math.max(...y)};
  if(y.length===1)return {from:y[0],to:y[0]};
  return null;
 }
 function libraryTerms(text){
  const f=fold(text),out=[];
  for(const p of [...PLACES,...REGIONS])if(p.keys.some(k=>f.includes(k)))out.push(...p.terms);
  const quoted=String(text).match(/[«"“]([^»"”]{2,80})[»"”]/);if(quoted)out.unshift(quoted[1].trim());
  if(!out.length){
   const words=(String(text).match(/[\p{L}\p{N}-]{5,}/gu)||[]).filter(w=>!STOP.has(fold(w)));
   out.push(...words.sort((a,b)=>b.length-a.length).slice(0,2));
  }
  return [...new Set(out)].filter(x=>x.length>=2&&x.length<=150).slice(0,6);
 }
 // Section 9E categories. A keyword hit marks an excerpt for human reading; it proves nothing.
 const CATEGORIES=[
  {id:'base',label:'Πειρατικό ορμητήριο',re:/ορμητηρι|λημερ|καταφυγιο πειρατ|φωλια|nest of pirates|pirate base|corsair base|haunt|lair|rifugio|nido/u},
  {id:'attack',label:'Πειρατική επίθεση',re:/επιδρομ|λεηλατ|αιχμαλωτ|επιθεσ|raid|sack|plunder|attack|captive|saccheg/u},
  {id:'refuge',label:'Καταφύγιο / οχύρωση',re:/καστρ|οχυρ|πυργ|καταφυγ|fortress|castle|fort|tower|refuge|fortezz/u},
  {id:'piracy',label:'Γενική αναφορά πειρατείας',re:/πειρατ|κουρσαρ|κουρσ|pirat|corsair|corsar|privateer/u}
 ];
 function classify(text){const f=fold(text);return CATEGORIES.filter(c=>c.re.test(f)).map(c=>c.id);}
 function route(input){
  const text=String(input||'').trim();
  if(!text||text.length>6000)return {intent:'invalid',agent:null,local:true,error:'Η εντολή πρέπει να έχει 1–6.000 χαρακτήρες.'};
  const f=fold(text),place=findPlace(text),period=years(text);
  const pick=(intent,extra={})=>({intent,agent:AGENTS[intent],local:LOCAL.has(intent),text,place,years:period,...extra});
  const W=(re)=>new RegExp('(?<![\\p{L}\\p{N}])(?:'+re+')','u').test(f);
  const mapWord=W('χαρτ|nabou|ναμπου|ατλαντ');
  if(/(γυρνα|γυρισε|επιστροφ|επεστρεψε|πισω).*(humanoid|χιουμανοιντ|ανθρωποειδ|n7|αρχικ)/u.test(f)||/^(πισω|επιστροφη)$/u.test(f))return pick('humanoid.return');
  if(/(δειξε|ανοιξε|εμφανισε).*αποτελεσματ/u.test(f)&&mapWord)return pick('nabou.results');
  if(/(δειξε|ανοιξε|εμφανισε).*(πηγεσ|τεκμηρια|παραπομπεσ)/u.test(f)&&!/(αναζητ|βρεσ|ψαξε)/u.test(f))return pick('nabou.sources');
  if(/βιβλιοθηκ|στισ πηγεσ μασ|στα βιβλια μασ/u.test(f))return pick('library.search',{terms:libraryTerms(text)});
  if(/github|pull request|repository|κωδικα|commit/u.test(f)||/(?<![a-z])(pr|repo|ci)(?![a-z])/.test(f))return pick('coding');
  if(W('καιρο|θερμοκρασι|βροχ|weather|forecast'))return pick('weather',{location:place?place.name:weatherPlace(text)});
  if(W('ειδησε|news'))return pick('web.news');
  if(/διαδικτυ|στο web|στον ιστο|google|online|δημοσιευσ|επιστημονικ/u.test(f))return pick('web.search');
  if(mapWord&&!place)return pick('nabou.open');
  if(place&&(mapWord||/^(?:n7[ ,]*)?(δειξε|ανοιξε|εστιασε|πηγαινε|εμφανισε)/u.test(f)))return pick('nabou.focus');
  if(/ιστορικ|πηγεσ|πειρατ|κουρσαρ|ορμητηρι|επιδρομ/u.test(f))return pick('historical.research');
  return pick('chat');
 }
 function weatherPlace(text){
  const m=String(text).match(/(?:στην|στη|στον|στο|in)\s+([\p{Lu}][\p{L}\s'-]{1,50})/u);
  return m?m[1].trim().replace(/[;?.!]+$/,''):null;
 }
 const api={classify,CATEGORIES,fold,PLACES,REGIONS,AGENTS,route,findPlace,linkPlaces,years,libraryTerms};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.N7CommandRouter=api;
})(typeof window==='undefined'?globalThis:window);
