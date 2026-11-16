'use strict';
// N7_SPECIALIST_AGENTS_V1: registry and dispatcher of the specialist agents that answer inside the
// one N7 conversation (Humanoid text or voice). It recognises the intent of the user's last
// message, hands the task to one agent and returns that agent's Greek answer for the same chat.
// It never opens a second chat and never invents data: an agent that has no real provider data
// says so. Agents here use only free public providers (Open-Meteo, Google News RSS, Bing News RSS).
const pick=(a,b)=>{try{return require(a);}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;return require(b);}};
// The assembled runtime renames two shared modules; the source tree keeps the original names.
const weatherTool=pick('./n7-weather.js','./weather-tool.js');
const news=require('./news-geopolitics.js');
const router=require('./n7-command-router.js');
const fold=router.fold;
const REGISTRY=Object.freeze({
 news_geopolitics:Object.freeze({id:'news_geopolitics',label:'News & Geopolitics',greek:'Ειδήσεις και Γεωπολιτική',
  description:'Πρόσφατες ελληνικές και διεθνείς ειδήσεις, γεωπολιτική, διεθνείς σχέσεις, συγκρούσεις, διπλωματία και οικονομικές εξελίξεις, με διασταύρωση μέσων.',
  tool:'public-web-search.js (Google News RSS, Bing News RSS)',providers:['news.google.com','www.bing.com'],paid:false,
  examples:['Τι νέα υπάρχουν σήμερα;','Ποιες είναι οι γεωπολιτικές εξελίξεις;','Νέα για την Ουκρανία']}),
 weather:Object.freeze({id:'weather',label:'Weather',greek:'Καιρός',
  description:'Τρέχουσες συνθήκες και πρόγνωση τριών ημερών ανά τοποθεσία: θερμοκρασία, βροχόπτωση, άνεμοι.',
  tool:'weather-tool.js (Open-Meteo)',providers:['geocoding-api.open-meteo.com','api.open-meteo.com'],paid:false,
  examples:['Τι καιρό κάνει στην Αθήνα;','Θα βρέξει αύριο στη Θεσσαλονίκη;']})
});
const ASK_PLACE='Για ποια τοποθεσία θέλεις τον καιρό; Πες μου πόλη ή περιοχή.';
// «καιρός» also means "time" in Greek: these phrases are not about the weather.
const NOT_WEATHER=/(?:πολυ|λιγο|τοσο|ποσο|αρκετο|εδω και|πριν απο|τον τελευταιο|μετα απο|απο|με τον|στον) καιρο|καιρο (?:τωρα|πριν|μετα)|καιροσ να |ωρα και καιροσ|καιροσκοπ/u;
const WEATHER=/(?<![\p{L}])(?:καιρ(?:οσ|ο|ου|ικ)|θερμοκρασι|προγνωσ[ηε]|μετεωρολογ|βροχ[ηε]|βρεχει|βρεξει|χιον[ιί]|χιονισει|ανεμ(?:οσ|οι|ουσ)|μποφορ|καυσων|παγετ|ποσουσ βαθμουσ|weather|forecast|temperature)/u;
const HISTORICAL=/αιωνα|αιωνεσ|πειρατ|κουρσαρ|ιστορικ|βιβλιοθηκ|μεσαιων|βυζαντ|οθωμαν|βενετ|century|histor/u;
const NEWS=/(?<![\p{L}])(?:ειδησ|επικαιροτητα|τα νεα|τι νεα (?:υπαρχουν|εχουμε|εχει|για|απο|σημερα)|νεα για|νεα απο|τελευταια νεα|news|headlines|γεωπολιτικ|geopolit|διεθνεισ σχεσεισ|διεθνεισ εξελιξεισ|διεθνη νεα|οικονομικεσ εξελιξεισ|οικονομικα νεα|τι συμβαινει (?:στον κοσμο|στην|στη|στο|σημερα)|τι γινεται (?:στον κοσμο|στην|στη|στο) )/u;
const CURRENT_AFFAIRS=/(?<![\p{L}])(?:πολεμ|συγκρουσ|διπλωματ|εκεχειρ|κυρωσεισ|συνοδο|νατο|οηε|πληθωρισμ|επιτοκι|χρηματιστηρι|αγορεσ|war|ceasefire|sanctions|diplomac|inflation)/u;
const RECENT=/(?<![\p{L}])(?:σημερ|τωρα|χθεσ|προσφατ|τελευται|εξελιξ|τρεχ|αυτη την εβδομαδα|αυτεσ τισ μερεσ|today|latest|recent|now)/u;
const NO_SEARCH=/(?:μην|χωρισ|οχι)\s+(?:ψαξεισ|αναζητησεισ|μπεισ στο (?:ιντερνετ|διαδικτυο)|ιντερνετ|διαδικτυο)/u;
const PLACE_STOP=new Set(['σημερα','αυριο','μεθαυριο','τωρα','αποψε','παρακαλω','λιγο','καιρο','καιροσ','καιρου','τον','την','το','τι','θα','κανει','εχει','πεσ','μου','ποιοσ','ποια','ειναι','η','ο','θερμοκρασια','προγνωση','βρεξει','βρεχει','βροχη','ποσο','ποσουσ','βαθμουσ','ν7','n7','weather','forecast','the','in','for','today','tomorrow','what','is','σαββατοκυριακο','εβδομαδα','αυτη','πρωι','βραδυ','και','δωσε','δειξε','θελω','να','μαθω','ζεστη','κρυο','αερα','ανεμο','ανεμοι','φυσαει','χιονισει']);
function cleanPlace(raw){
 const words=String(raw||'').replace(/[;?.!,·:«»"“”()]/g,' ').split(/\s+/).filter(Boolean);
 while(words.length&&PLACE_STOP.has(fold(words.at(-1))))words.pop();
 while(words.length&&PLACE_STOP.has(fold(words[0])))words.shift();
 const place=words.slice(0,4).join(' ');
 return weatherTool.validPlace(place)?place:null;
}
// Works for typed and dictated text (speech recognition often returns lower case).
function weatherPlace(text){
 const t=String(text||'');
 const m=t.match(/(?:^|\s)(?:στην|στη|στον|στο|στα|στους|στις|για την|για τη|για τον|για το|για τα|in|at|for)\s+([\p{L}][\p{L}\s.'-]{1,60})/iu);
 if(m){const place=cleanPlace(m[1]);if(place)return place;}
 const rest=(t.match(/[\p{L}][\p{L}.'-]*/gu)||[]).filter(w=>!PLACE_STOP.has(fold(w))&&!WEATHER.test(fold(w)));
 return rest.length&&rest.length<=3?cleanPlace(rest.join(' ')):null;
}
const SUBJECT_STOP=/(?<![\p{L}])(?:πεσ|δωσε|δειξε|βρεσ|ψαξε|θελω|θα ηθελα|μπορεισ|ποιεσ|ποια|ποιοι|ποιο|τι|μου|μασ|τισ|τα|οι|το|τον|την|τησ|του|των|ειναι|υπαρχουν|εχουμε|σημερ\p{L}*|χθεσ\p{L}*|τωρα|ειδησ\p{L}*|νεα|τελευται\p{L}*|προσφατ\p{L}*|εξελιξ\p{L}*|γεωπολιτικ\p{L}*|διεθν\p{L}*|ελληνικ\p{L}*|οικονομικ\p{L}*|σχεσ\p{L}*|επικαιροτητα|συμβαινει|γινεται|κοσμο\p{L}*|παγκοσμ\p{L}*|για|με|στην|στη|στον|στο|στα|απο|και|σχετικα|news|today|latest|the|about|on|world|headlines|geopolit\p{L}*|ν7|n7|να|μαθω|ενημερωσ\p{L}*)(?![\p{L}])/gu;
function newsRequest(text){
 const f=fold(text);
 const topic=/γεωπολιτικ|geopolit|διεθν|διπλωματ|συγκρουσ|πολεμ|εκεχειρ|κυρωσ|νατο|οηε|συνοδο|war|ceasefire|sanction|diplomac/u.test(f)?'geopolitics'
  :/οικονομ|πληθωρισμ|επιτοκι|αγορεσ|χρηματιστ|πετρελαι|ενεργει|econom|inflation|market/u.test(f)?'economy':'general';
 const scope=/διεθν|παγκοσμ|κοσμο|world|international|εξωτερικ/u.test(f)?'world':/ελληνικ|ελλαδ|εγχωρι|greece|greek/u.test(f)?'greece':'both';
 // The subject keeps the user's own words (accents and case) for the search feeds.
 const kept=[];
 for(const w of String(text).match(/[\p{L}\p{N}][\p{L}\p{N}.'-]*/gu)||[]){
  SUBJECT_STOP.lastIndex=0;
  if(!SUBJECT_STOP.test(' '+fold(w)+' '))kept.push(w);
 }
 const subject=kept.join(' ').trim();
 return {topic,scope,subject:subject.length>=3?subject.slice(0,120):''};
}
// Returns {agent,...} for the two specialist agents, or null when the message belongs elsewhere.
function detect(text,{previousAssistant=''}={}){
 const raw=String(text||'').trim();
 if(!raw||raw.length>600)return null;
 const f=fold(raw);
 if(NO_SEARCH.test(f))return null;
 // Answer to the agent's own question "for which place?".
 if(String(previousAssistant).includes(ASK_PLACE)&&raw.length<=60){
  const place=cleanPlace(raw);if(place)return {agent:'weather',place};
 }
 if(HISTORICAL.test(f)||router.years(raw))return null;
 const routed=router.route(raw).intent;
 if((routed==='weather'||WEATHER.test(f))&&!NOT_WEATHER.test(f)&&WEATHER.test(f))return {agent:'weather',place:weatherPlace(raw)};
 if(['library.search','coding','nabou.open','nabou.focus','nabou.sources','nabou.results','humanoid.return'].includes(routed))return null;
 if(NEWS.test(f)||(CURRENT_AFFAIRS.test(f)&&RECENT.test(f)))return {agent:'news_geopolitics',...newsRequest(raw)};
 return null;
}
async function runWeather(found,{fetcher=fetch,now=()=>new Date()}={}){
 if(!found.place)return {reply:ASK_PLACE,data:null,status:'needs_place'};
 const attempts=[found.place];
 // Greek genitive and accusative endings («της Αθήνας»): try the nominative too.
 if(/[ςσ]$/u.test(found.place))attempts.push(found.place.slice(0,-1));
 let lastError='WEATHER_UNAVAILABLE';
 for(const place of attempts){
  try{
   const report=await weatherTool.forecast(place,{fetcher,now});
   return {reply:weatherTool.describe(report),data:report,status:'ok'};
  }catch(e){
   lastError=String(e&&e.message||'');
   if(lastError!=='WEATHER_PLACE_NOT_FOUND')break;
  }
 }
 const reply=lastError==='WEATHER_PLACE_NOT_FOUND'
  ?'Δεν βρήκα την τοποθεσία «'+found.place+'» στο Open-Meteo. Δώσε μου το όνομα αλλιώς ή μια κοντινή πόλη.'
  :'Το Open-Meteo δεν απάντησε αυτή τη στιγμή ('+(lastError.startsWith('WEATHER_')?lastError:'WEATHER_UNAVAILABLE')+'). Δεν έχω πραγματικές μετρήσεις για «'+found.place+'» και δεν θα επινοήσω. Δοκίμασε ξανά σε λίγο.';
 return {reply,data:null,status:lastError==='WEATHER_PLACE_NOT_FOUND'?'place_not_found':'provider_unavailable'};
}
// Plain completion on the already configured model; used only to word a summary of real headlines.
async function complete({apiKey,model,base,fetcher=fetch,timeout=25000},system,user){
 if(!apiKey||!model||!base)return '';
 const endpoint=new URL(String(base).replace(/\/$/,'')+'/chat/completions');
 if(!['https:','http:'].includes(endpoint.protocol))return '';
 const request={model,temperature:0.1,max_tokens:700,messages:[{role:'system',content:system},{role:'user',content:user}]};
 if(endpoint.hostname==='api.groq.com'&&String(model).startsWith('qwen/')){delete request.max_tokens;request.max_completion_tokens=700;request.reasoning_effort='none';}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{
  const response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+apiKey},body:JSON.stringify(request),signal:controller.signal});
  if(!response.ok)return '';
  const text=(await response.json())?.choices?.[0]?.message?.content;
  return typeof text==='string'?text:'';
 }catch{return '';}
 finally{clearTimeout(timer);}
}
async function runNews(found,{transport=fetch,now=()=>new Date(),model={},modelFetcher=fetch}={}){
 let report;
 try{report=await news.gather(found,{transport,now});}
 catch{return {reply:'Η αναζήτηση ειδήσεων απέτυχε αυτή τη στιγμή. Δεν έχω πραγματικά δεδομένα και δεν θα επινοήσω ειδήσεις.',data:null,status:'provider_unavailable'};}
 if(!report.clusters.length)return {reply:news.describe(report),data:report,status:report.availableProviders?'no_results':'provider_unavailable'};
 const prompt=news.synthesisPrompt(report);
 const synthesis=news.acceptSynthesis(await complete({...model,fetcher:modelFetcher},prompt.system,prompt.user),prompt.ids);
 return {reply:news.describe(report,{synthesis}),data:report,status:'ok',synthesis:Boolean(synthesis)};
}
// history: [{role,content}] ending with the user's message. Returns null when no specialist agent applies.
async function dispatch(history,options={}){
 if(!Array.isArray(history))return null;
 const last=history.at(-1);
 if(!last||last.role!=='user'||typeof last.content!=='string')return null;
 const previousAssistant=[...history.slice(0,-1)].reverse().find(m=>m&&m.role==='assistant')?.content||'';
 const found=detect(last.content,{previousAssistant});
 if(!found)return null;
 const agent=REGISTRY[found.agent];
 const result=found.agent==='weather'
  ?await runWeather(found,{fetcher:options.fetcher||fetch,now:options.now})
  :await runNews(found,{transport:options.fetcher||fetch,now:options.now,model:{apiKey:options.apiKey,model:options.model,base:options.base},modelFetcher:options.modelFetcher||fetch});
 return {agent:{id:agent.id,label:agent.label,greek:agent.greek},request:found,status:result.status,
  reply:'['+agent.label+' Agent]\n'+result.reply,data:result.data,synthesis:result.synthesis===true};
}
function list(){return Object.values(REGISTRY).map(a=>({...a,status:'available'}));}

// N7_AGENT_STATUS_V1: what each N7 agent needs to work on THIS installation, read from the real
// configuration and files, never assumed. "ready" means every requirement is present; it does not
// claim that the agent's output was verified, and it never touches a provider or the owner's data.
const fs=require('node:fs'),path=require('node:path');
const NEED={
 model:{label:'μοντέλο γλώσσας (LLM_API_KEY και LLM_MODEL)',ok:c=>Boolean(c.env.LLM_API_KEY&&c.env.LLM_MODEL)},
 library_key:{label:'κλειδί γέφυρας βιβλιοθήκης (.n7-library-bridge-key)',ok:c=>c.exists(path.join(c.dir,'.n7-library-bridge-key'))},
 browser_domains:{label:'επιτρεπόμενα domains (BROWSER_ALLOWED_DOMAINS) και Python Playwright στον server',ok:c=>Boolean(String(c.env.BROWSER_ALLOWED_DOMAINS||'').trim())},
 github_token:{label:'διακριτικό GitHub (N7_GITHUB_DISPATCH_TOKEN)',ok:c=>Boolean(String(c.env.N7_GITHUB_DISPATCH_TOKEN||'').trim())},
 pdf_runtime:{label:'φορητό PDF runtime (vendor/pdf.mjs)',ok:c=>c.exists(path.join(c.dir,'vendor','pdf.mjs'))},
 skills:{label:'εγκεκριμένα skills (skills/registry.js)',ok:c=>c.exists(path.join(c.dir,'skills','registry.js'))}
};
// The graph shown in the Humanoid (18 nodes) plus the two agents added here.
const ROSTER=[
 ['orchestrator','consultant','Συντονιστής','server',['model'],'Δρομολογεί αιτήματα στους Agents και στη συνομιλία.'],
 ['memory','consultant','Μνήμη','server',[],'Αποθηκεύει συνομιλίες και εγκεκριμένα μαθήματα στον server.'],
 ['research_planner','consultant','Σχεδιασμός έρευνας','server',['library_key','model'],'Σχεδιάζει ιστορική έρευνα πάνω στη μόνιμη βιβλιοθήκη.'],
 ['historian','consultant','Ιστορική έρευνα','server',['library_key','model'],'Αναζητά αποσπάσματα στη βιβλιοθήκη και συνθέτει με παραπομπές.'],
 ['evidence_audit','consultant','Έλεγχος τεκμηρίων','server',[],'Ελέγχει βιβλιογραφία και ταυτότητα πηγών στο κείμενο που ανακτήθηκε.'],
 ['editor','consultant','Ελληνικός επιμελητής','server',['skills','model'],'Επιμέλεια ελληνικού κειμένου με εγκεκριμένα skills.'],
 ['coding_agent','doer','Coding Agent','github-actions',['github_token'],'Στέλνει εργασία στο υπάρχον workflow και διαβάζει PR και CI. Δεν κάνει merge ή deploy.'],
 ['task_runner','doer','Εκτελεστής εργασιών','server',['model'],'Ουρά εργασιών τύπου analysis και agent με περιορισμένα εργαλεία.'],
 ['source_scout','doer','Source Scout','github-actions',[],'Βρίσκει βιβλιογραφικά μεταδεδομένα (Crossref). Τρέχει ως GitHub Action, όχι στον server.'],
 ['web_research','doer','Έρευνα στο διαδίκτυο','server',[],'Δημόσιες ροές ειδήσεων και Wikipedia, με όρια και χωρίς κλειδί.'],
 ['browser_reader','doer','Browser Reader','server',['browser_domains'],'Διαβάζει μόνο σελίδες από ρητή λίστα domains. Δεν κάνει σύνδεση ή υποβολή φορμών.'],
 ['pdf_reader','doer','PDF Reader','server',['pdf_runtime'],'Εξάγει κείμενο ανά σελίδα και δηλώνει σελίδες που χρειάζονται OCR.'],
 ['library_ingest','doer','Εισαγωγή βιβλιοθήκης','server',['library_key'],'Εισάγει αρχεία στη μόνιμη βιβλιοθήκη με κομμάτια και hashes.'],
 ['source_library','tool','Βιβλιοθήκη πηγών','server',['library_key'],'Αναζήτηση σε εισηγμένο υλικό με αποσπάσματα και παραπομπές.'],
 ['conversation_store','tool','Συνομιλίες','server',[],'Ιδιωτικό ιστορικό συνομιλιών με επαναφορά μετά από επανεκκίνηση.'],
 ['skills','tool','Skills','server',['skills'],'Φορτώνει εγκεκριμένα SKILL.md και καταγράφει διορθώσεις του ιδιοκτήτη.'],
 ['mission_bridge','tool','Mission Bridge','server',['library_key'],'Υπογεγραμμένη αποστολή ερευνητικών εργασιών προς το backend.'],
 ['model_runtime','tool','Μοντέλο','server',['model'],'Το ρυθμισμένο μοντέλο συνομιλίας.'],
 ['news_geopolitics','specialist','Ειδήσεις και Γεωπολιτική','server',[],REGISTRY.news_geopolitics.description],
 ['weather','specialist','Καιρός','server',[],REGISTRY.weather.description]
];
function status({env=process.env,dir=__dirname,exists=target=>fs.existsSync(target)}={}){
 const context={env,dir,exists};
 const agents=ROSTER.map(([id,kind,greek,runsIn,needs,purpose])=>{
  const missing=needs.filter(key=>!NEED[key].ok(context));
  return {id,kind,greek,runsIn,purpose,needs:needs.map(key=>({key,label:NEED[key].label,met:!missing.includes(key)})),ready:missing.length===0,
   reason:missing.length?'Λείπει: '+missing.map(key=>NEED[key].label).join(' · '):runsIn==='github-actions'?'Τρέχει εκτός server (GitHub Actions).':'Οι προϋποθέσεις υπάρχουν· η ποιότητα της εξόδου δεν επαληθεύεται εδώ.'};
 });
 return {agents,summary:{total:agents.length,ready:agents.filter(a=>a.ready).length,notReady:agents.filter(a=>!a.ready).map(a=>a.id)}};
}
module.exports={REGISTRY,ASK_PLACE,detect,weatherPlace,newsRequest,dispatch,runWeather,runNews,list,status,ROSTER};
