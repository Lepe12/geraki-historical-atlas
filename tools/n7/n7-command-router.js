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
 // N7_SPLIT_MAP_V1: match a command against the records the map itself reported (data.json:
 // place / historicalNames / modernName). Only an existing record id is returned; never a coordinate.
 function recordNames(r){
  const out=[];
  const add=(v,rank)=>{for(const part of String(v||'').split(/[\/(),;]+/)){const n=fold(part).replace(/[^\p{L}\p{N} ]+/gu,' ').replace(/\s+/g,' ').trim();if(n.length>=4&&!out.some(x=>x.n===n))out.push({n,rank});}};
  add(r.place,0);add(r.historicalNames,1);add(String(r.modernName||'').split(',')[0],2);add(r.modernName,3);
  return out;
 }
 // Greek names inflect (Κέρκυρα / Κέρκυρας / Κέρκυρα): compare a stem without the final vowel(s)/σ.
 const stem=n=>n.length>=6&&/[\u0370-\u03ff]/.test(n)?n.replace(/[αεηιουω]+σ?$|σ$/u,''):n;
 function matchRecord(text,records){
  const f=' '+fold(text).replace(/[^\p{L}\p{N} ]+/gu,' ').replace(/\s+/g,' ')+' ';
  let best=null;
  for(const r of Array.isArray(records)?records:[]){
   for(const {n,rank} of recordNames(r)){
    const k=stem(n);
    const hit=k===n?f.includes(' '+n+' '):new RegExp('(?<![\\p{L}])'+k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'[\\p{L}]{0,3}(?![\\p{L}])','u').test(f);
    if(!hit)continue;
    const score=n.length*10-rank;
    if(!best||score>best.score)best={score,record:r};
   }
  }
  return best?{id:best.record.id,name:best.record.place,coordinateStatus:best.record.coordinateStatus}:null;
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
 // N7_HISTORY_GLOSSARY_V1: Greek names and historical subjects -> the exact words the (often English,
 // Italian or Spanish) sources use. Only adds search terms; matches are still exact words in real pages.
 // Generic words (battle, fleet, author, expedition) were measured to push unrelated pages up, so they are not mapped.
 const NAMES=[
  {keys:['ναυπακτ','lepanto','λεπαντ'],terms:['Lepanto']},
  {keys:['τζερμπ','τζερβ','djerba','jerba','gerba'],terms:['Djerba','Jerba','Gerba']},
  {keys:['πρεβεζ','preveza','prevesa'],terms:['Prevesa','Preveza']},
  {keys:['μπαρμπαροσ','barbaross','χαιρεντιν','hayreddin','kheyr'],terms:['Barbarossa','Kheyr-ed-Din']},
  {keys:['τουργκουτ','ντραγκουτ','ντραγουτ','dragut','turgut'],terms:['Dragut','Turgut']},
  {keys:['ντορια','doria'],terms:['Doria']},
  {keys:['θερβαντ','σερβαντ','cervantes','κιχωτ','quixote'],terms:['Cervantes','Quixote']},
  {keys:['καρολο','charles v'],terms:['Charles','Emperor']},
  {keys:['πενιον','penon','peñon'],terms:['Peñon','Penon']},
  {keys:['ουλουτζ','ουλουζ','uluj','ochiali','occhiali'],terms:['Uluj','Ochiali']}
 ];
 const SUBJECTS=[
  {keys:['γαλερ','κατεργ','galley'],terms:['galley','galleys']},
  {keys:['κωπηλατ','κουπι','κωπηλασ'],terms:['oars','rowers']},
  {keys:['σκλαβ','δουλ'],terms:['slaves','slave']},
  {keys:['αιχμαλωτ','αιχμαλωσ'],terms:['captives','captivity']},
  {keys:['κουρσαρ','πειρατ'],terms:['corsairs','pirates']},
  {keys:['φρουρι','καστρ','οχυρ'],terms:['fortress','castle']},
  {keys:['επιδρομ','λεηλασ'],terms:['raid','sacked']},
  {keys:['πολιορκ'],terms:['siege','besieged']},
  {keys:['λυτρ'],terms:['ransom']},
  {keys:['φυλακ','μπανιο'],terms:['bagnio','bagnios']}
 ];
 function libraryTerms(text){
  const f=fold(text),out=[];
  for(const p of [...PLACES,...REGIONS,...NAMES])if(p.keys.some(k=>f.includes(k)))out.push(...p.terms);
  // Subject words fill the remaining slots after specific names and places.
  for(const g of SUBJECTS)if(g.keys.some(k=>f.includes(k)))out.push(...g.terms);
  const quoted=String(text).match(/[«"“]([^»"”]{2,80})[»"”]/);if(quoted)out.unshift(quoted[1].trim());
  if(!out.length){
   const words=(String(text).match(/[\p{L}\p{N}-]{5,}/gu)||[]).filter(w=>!STOP.has(fold(w)));
   out.push(...words.sort((a,b)=>b.length-a.length).slice(0,2));
  }
  return [...new Set(out)].filter(x=>x.length>=2&&x.length<=150).slice(0,8);
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
  // Conversational questions are not imperative commands. Route them to the SAME
  // N7 chat, so a user can ask for an opinion about NABOU, the library or history
  // without opening a map or launching a search. Explicit commands still win.
  const asksForOpinion=/(τι (?:πιστευεισ|γνωμη|αποψη)|ποια (?:ειναι )?(?:η )?(?:γνωμη|αποψη)|πωσ σου φαινεται|πωσ το βλεπεισ|συμφωνεισ|διαφωνεισ|να (?:το )?συζητησουμε|what do you think|your opinion)/u.test(f);
  const explicitAction=/(?:^|\s)(?:ανοιξε|δειξε|εμφανισε|εστιασε|πηγαινε|βρεσ|ψαξε|αναζητησε|εκτελεσε|φτιαξε|γραψε)(?:\s|$)/u.test(f);
  if(asksForOpinion&&!explicitAction)return pick('chat');
  if(/βιβλιοθηκ|στισ πηγεσ μασ|στα βιβλια μασ/u.test(f))return pick('library.search',{terms:libraryTerms(text)});
  if(/github|pull request|repository|κωδικα|commit/u.test(f)||/(?<![a-z])(pr|repo|ci)(?![a-z])/.test(f))return pick('coding');
  if(W('καιρο|θερμοκρασι|βροχ|weather|forecast'))return pick('weather',{location:place?place.name:weatherPlace(text)});
  if(W('ειδησε|news'))return pick('web.news');
  if(/διαδικτυ|στο web|στον ιστο|google|online|δημοσιευσ|επιστημονικ/u.test(f))return pick('web.search');
  if(mapWord&&!place)return pick('nabou.open');
  if(place&&(mapWord||/^(?:n7[ ,]*)?(δειξε|ανοιξε|εστιασε|πηγαινε|εμφανισε)/u.test(f)))return pick('nabou.focus');
  // A show-command followed by a proper name: the map decides from its own records whether it exists.
  if(/^(?:n7[ ,]*)?(?:δειξε|εστιασε|πηγαινε|show)\s/u.test(f)&&/\s\p{Lu}/u.test(text.trim().replace(/^\S+/,'')))return pick('nabou.focus');
  if(/ιστορικ|πηγεσ|πειρατ|κουρσαρ|ορμητηρι|επιδρομ/u.test(f))return pick('historical.research');
  return pick('chat');
 }
 function weatherPlace(text){
  const m=String(text).match(/(?:στην|στη|στον|στο|in)\s+([\p{Lu}][\p{L}\s'-]{1,50})/u);
  return m?m[1].trim().replace(/[;?.!]+$/,''):null;
 }
 // N7_AGENT_SPEECH_V1: the spoken version of an answer from the News & Geopolitics or Weather agent, for the
 // Humanoid screen's device voice. The text on screen is not changed. Figures, units and dates are said as Greek
 // words; addresses, citation marks and error codes are left out; speech stops at about half a minute and says
 // where the rest is. Text that is not from an agent is returned unchanged. The same rules (and the same test
 // sentences) are used by the /n7-apex Humanoid (tools/n7_apex_preview/N7AgentSpeech.ts in the atlas repository).
 const SPEECH_MONTHS=['Ιανουαρίου','Φεβρουαρίου','Μαρτίου','Απριλίου','Μαΐου','Ιουνίου','Ιουλίου','Αυγούστου','Σεπτεμβρίου','Οκτωβρίου','Νοεμβρίου','Δεκεμβρίου'];
 const SPEECH_DAYS={'Δευ':'Δευτέρα','Τρί':'Τρίτη','Τετ':'Τετάρτη','Πέμ':'Πέμπτη','Παρ':'Παρασκευή','Σάβ':'Σάββατο','Κυρ':'Κυριακή'};
 const SPEECH_WIND={'Β':'βόρεια','ΒΑ':'βορειοανατολικά','Α':'ανατολικά','ΝΑ':'νοτιοανατολικά','Ν':'νότια','ΝΔ':'νοτιοδυτικά','Δ':'δυτικά','ΒΔ':'βορειοδυτικά'};
 const SPEECH_SECTION={'ΓΕΓΟΝΟΤΑ ΜΕ ΔΙΑΣΤΑΥΡΩΣΗ':'Γεγονότα που διασταυρώθηκαν από περισσότερα μέσα.','ΑΝΑΦΟΡΕΣ ΧΩΡΙΣ ΔΙΑΣΤΑΥΡΩΣΗ':'Αναφορές που δεν έχουν διασταυρωθεί.','ΙΣΧΥΡΙΣΜΟΙ, ΔΗΛΩΣΕΙΣ':'Ισχυρισμοί και δηλώσεις.','ΑΝΑΛΥΣΕΙΣ ΚΑΙ ΣΧΟΛΙΑ':'Αναλύσεις και σχόλια, δηλαδή γνώμες.'};
 const MAX_SPOKEN_CHARACTERS=700;
 function spokenGreek(line){
  return String(line)
   .replace(/^[•·\-]\s*/,'')
   .replace(/(?<![\p{L}])(Δευ|Τρί|Τετ|Πέμ|Παρ|Σάβ|Κυρ)\s+(?=\d)/gu,(_,d)=>SPEECH_DAYS[d]+' ')
   .replace(/\b(\d{1,2})\/(\d{2})\/(\d{4})\b/g,(_,d,m,y)=>String(Number(d))+' '+(SPEECH_MONTHS[Number(m)-1]||'')+' '+y)
   .replace(/,?\s*ώρα [A-Za-z]+\/[A-Za-z_]+/g,'')
   .replace(/από (ΒΑ|ΒΔ|ΝΑ|ΝΔ|Β|Α|Ν|Δ)(?![\p{L}])/gu,(_,w)=>'από '+SPEECH_WIND[w])
   .replace(/(\d)\s?°C/g,'$1 βαθμούς Κελσίου').replace(/(\d)\s?km\/h/g,'$1 χιλιόμετρα την ώρα')
   .replace(/(\d)\s?mm\b/g,'$1 χιλιοστά').replace(/(\d)\s?%/g,'$1 τοις εκατό')
   .replace(/\s*\([A-Z][A-Z0-9_]{5,}\)/g,'')
   .replace(/\s*[·•]\s*/g,', ').replace(/\s—\s/g,', ').replace(/https?:\/\/\S+/g,'').replace(/\[S\d{1,2}\]\s?/g,'').replace(/\s{2,}/g,' ').trim();
 }
 function speakAgent(text){
  const input=String(text||''),agent=input.match(/^\[(Weather|News & Geopolitics) Agent\]\n/);
  if(!agent)return input;
  const lines=input.slice(agent[0].length).split('\n').map(l=>l.trim()).filter(Boolean),out=[];
  for(const line of lines){
   if(/^(?:[^:\n]{1,90}: )?https:\/\/\S+$/.test(line)||/^(?:Πηγή|Σημείωση):/.test(line)||/^Ενημέρωση:/.test(line))continue;
   const header=Object.keys(SPEECH_SECTION).find(k=>line.startsWith(k));
   if(header){out.push(SPEECH_SECTION[header]);continue;}
   const headline=line.match(/^\[S\d+\]\s+(.+?)\s+—\s+\d{2}\/\d{2}\/\d{4}\s+—\s+(.+)$/);
   out.push(headline?headline[1]+', σύμφωνα με '+headline[2]:line);
  }
  let spoken='',cut=false;
  for(const raw of out){const line=spokenGreek(raw);if(!line)continue;if(spoken.length+line.length>MAX_SPOKEN_CHARACTERS){cut=true;break;}spoken+=(spoken?' ':'')+(/[.;!:]$/.test(line)?line:line+'.');}
  const sources=/https:\/\//.test(input);
  if(cut)return spoken+(sources?' Η πλήρης απάντηση με τις πηγές είναι γραμμένη στη συνομιλία.':' Η πλήρης απάντηση είναι γραμμένη στη συνομιλία.');
  return spoken+(sources?' Οι πηγές είναι γραμμένες στη συνομιλία.':'');
 }
 const api={classify,CATEGORIES,fold,PLACES,REGIONS,AGENTS,route,findPlace,linkPlaces,matchRecord,years,libraryTerms,speakAgent,spokenGreek};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.N7CommandRouter=api;
})(typeof window==='undefined'?globalThis:window);
