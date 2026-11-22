'use strict';
// N7_SPECIALIST_AGENTS_V1: registry and dispatcher of the specialist agents that answer inside the
// one N7 conversation (Humanoid text or voice). It recognises the intent of the user's last
// message, hands the task to one agent and returns that agent's Greek answer for the same chat.
// It never opens a second chat and never invents data: an agent that has no real provider data
// says so. Agents here use only free public providers (Open-Meteo and Google News RSS).
const pick=(a,b)=>{try{return require(a);}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;return require(b);}};
// The assembled runtime renames two shared modules; the source tree keeps the original names.
const weatherTool=pick('./n7-weather.js','./weather-tool.js');
const news=require('./news-geopolitics.js');
const router=require('./n7-command-router.js');
const fold=router.fold;
const REGISTRY=Object.freeze({
 news_geopolitics:Object.freeze({id:'news_geopolitics',label:'News & Geopolitics',greek:'Ειδήσεις και Γεωπολιτική',
  description:'Πρόσφατες ελληνικές και διεθνείς ειδήσεις, γεωπολιτική, διεθνείς σχέσεις, συγκρούσεις, διπλωματία και οικονομικές εξελίξεις, με διασταύρωση μέσων.',
  tool:'public-web-search.js (Google News RSS)',providers:['news.google.com'],paid:false,
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
// Returns a specialist request or null when the message belongs elsewhere.
function detect(text,{previousAssistant=''}={}){
 const raw=String(text||'').trim();
 const audit=raw.match(/^n7_security_headers_audit(?:\s+([\s\S]*))?$/i);
 if(audit)return {agent:'security_headers_audit',headersJson:audit[1]||''};
 const page=raw.match(/^(?:διάβασε|διαβασε|άνοιξε|ανοιξε|read|open)\s+(?:τη σ[εέ]λ[ιί]δα\s+)?(https?:\/\/[^\s<>]+)\s*$/iu);
 if(page)return {agent:'browser_reader',url:page[1]};
 if(!raw||raw.length>600)return null;
 const f=fold(raw);
 if(NO_SEARCH.test(f))return null;
 // Answer to the agent's own question "for which place?".
 if(String(previousAssistant).includes(ASK_PLACE)&&raw.length<=60){
  const place=cleanPlace(raw);if(place)return {agent:'weather',place};
 }
 if(HISTORICAL.test(f)||router.years(raw))return null;
 const parts=router.splitWeatherNews(raw);
 if(parts){
  const requests=parts.map(part=>detect(part));
  if(requests.some(r=>r?.agent==='weather')&&requests.some(r=>r?.agent==='news_geopolitics'))return {agent:'combined',requests};
 }
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
async function runNews(found,{transport=fetch,now=()=>new Date()}={}){
 let report;
 try{report=await news.gather(found,{transport,now});}
 catch{return {reply:'Η αναζήτηση ειδήσεων απέτυχε αυτή τη στιγμή. Δεν έχω πραγματικά δεδομένα και δεν θα επινοήσω ειδήσεις.',data:null,status:'provider_unavailable'};}
 if(!report.clusters.length)return {reply:news.describe(report),data:report,status:report.availableProviders?'no_results':'provider_unavailable'};
 return {reply:news.describe(report),data:report,status:'ok'};
}
// An explicit command is handled before the general model or web tools.
async function dispatchHeaderAudit(raw){
 const agent={id:'security_headers_audit',label:'Security Headers Audit',greek:'Έλεγχος κεφαλίδων ασφαλείας'};
 let headers;
 try{
  if(raw.length>4000)throw Error('header input too large');
  headers=JSON.parse(raw);
  if(!headers||typeof headers!=='object'||Array.isArray(headers)||
     Object.entries(headers).some(([key,value])=>!/^[a-z0-9-]{1,80}$/i.test(key)||typeof value!=='string'||value.length>2000))
   throw Error('invalid headers');
 }catch{
  return {agent,status:'invalid_input',reply:'Δώσε τις κεφαλίδες ως αντικείμενο JSON μετά το n7_security_headers_audit.'};
 }
 try{
  const {invoke}=pick('./skills/mcp-client','../../skills/mcp-client');
  const result=await invoke('call','n7_security_headers_audit',{headers});
  const data=JSON.parse(result.content[0].text);
  if(data.schema!=='n7-security-headers-audit-v1'||data.mode!=='OFFLINE_PASSIVE'||!Array.isArray(data.findings))
   throw Error('unexpected audit result');
  const findings=data.findings.map(f=>f.id+' · '+f.reason+' · '+f.recommendation);
  const summary=findings.length?findings.join('\n'):'Δεν εντοπίστηκαν ελλείψεις στους ελέγχους που εφαρμόστηκαν.';
  return {agent,status:'ok',data,reply:'Έλεγχος μόνο των κεφαλίδων που έδωσες.\n'+summary};
 }catch{
  return {agent,status:'unavailable',reply:'Το εργαλείο παθητικού ελέγχου κεφαλίδων δεν είναι διαθέσιμο.'};
 }
}

const observations=new Map();
async function dispatchBrowser(found,{browse}){
 const agent={id:'browser_reader',label:'Browser Reader',greek:'Ανάγνωση ιστοσελίδας'};
 try{
  const read=browse||pick('./browser.js','../../browser.js').browsePage;
  const page=JSON.parse(await read(found.url));
  const excerpt=page.text.slice(0,1600);
  const heading=page.title?'[Browser Reader] '+page.title:'[Browser Reader] Ανάγνωση σελίδας';
  return {agent,status:'ok',reply:heading+'\n\n'+excerpt+(page.text.length>1600?'…':'')+'\n\nΠηγή: '+page.url};
 }catch(error){
  const message=String(error.message||'');
  const denied=/^(?:Site not allowed|robots_disallowed|redirect_blocked|access_challenge)/.test(message);
  return {agent,status:denied?'blocked':'unavailable',reply:denied
   ?'Ο Browser Reader δεν μπόρεσε να ανοίξει τη συγκεκριμένη σελίδα. Χρησιμοποιεί μόνο εγκεκριμένα δημόσια HTTPS URL χωρίς ανακατευθύνσεις και σέβεται τους περιορισμούς πρόσβασης του ιστοτόπου.'
   :'Ο Browser Reader δεν κατάφερε να ανακτήσει δημόσιο κείμενο από τη σελίδα.'};
 }
}
async function dispatchOne(found,options){
 let result;
 if(found.agent==='security_headers_audit')result=await dispatchHeaderAudit(found.headersJson);
 else if(found.agent==='browser_reader')result=await dispatchBrowser(found,options);
 else{
  const agent=REGISTRY[found.agent];
  const output=found.agent==='weather'
   ?await runWeather(found,{fetcher:options.fetcher,now:options.now})
   :await runNews(found,{transport:options.fetcher,now:options.now});
  result={agent:{id:agent.id,label:agent.label,greek:agent.greek},request:found,status:output.status,
   reply:'['+agent.label+' Agent]\n'+output.reply,data:output.data,synthesis:false};
 }
 const completedAt=new Date().toISOString();
 const observed={...observations.get(found.agent),last_run_at:completedAt,last_status:result.status};
 if(result.status==='ok')observed.last_success_at=completedAt;
 if(['provider_unavailable','unavailable'].includes(result.status)){
  observed.last_error_at=completedAt;observed.last_error=result.status;
 }
 observations.set(found.agent,observed);
 return result;
}

// history: [{role,content}] ending with the user's message. Returns null when no specialist agent applies.
async function dispatch(history,options={}){
 if(!Array.isArray(history))return null;
 const last=history.at(-1);
 if(!last||last.role!=='user'||typeof last.content!=='string')return null;
 const previousAssistant=[...history.slice(0,-1)].reverse().find(m=>m&&m.role==='assistant')?.content||'';
 const found=detect(last.content,{previousAssistant});
 if(!found)return null;
 if(found.agent!=='combined')return dispatchOne(found,options);
 const results=await Promise.all(found.requests.map(request=>dispatchOne(request,options)));
 return {agent:{id:'weather_and_news',label:'Weather and News',greek:'Καιρός και Ειδήσεις'},request:found,
  status:results.every(result=>result.status==='ok')?'ok':'partial',
  reply:results.map(result=>result.reply).join('\n\n'),data:{results},synthesis:false};
}
function list(){return Object.values(REGISTRY).map(a=>({...a,status:'available'}));}

// N7_AGENT_STATUS_V1: what each N7 agent needs to work on THIS installation, read from the real
// configuration and files, never assumed. "ready" means every requirement is present; it does not
// claim that the agent's output was verified, and it never touches a provider or the owner's data.
const fs=require('node:fs'),path=require('node:path');
const NEED={
 model:{label:'μοντέλο γλώσσας (LLM_API_KEY και LLM_MODEL)',ok:c=>Boolean(c.env.LLM_API_KEY&&c.env.LLM_MODEL)},
 library_key:{label:'κλειδί γέφυρας βιβλιοθήκης (.n7-library-bridge-key)',ok:c=>c.exists(path.join(c.dir,'.n7-library-bridge-key'))},
 browser_domains:{label:'επιτρεπόμενοι δημόσιοι ιστότοποι (BROWSER_ALLOWED_DOMAINS)',ok:c=>pick('./browser.js','../../browser.js').browserHosts(c.env).size>0},
 github_token:{label:'διακριτικό GitHub (N7_GITHUB_DISPATCH_TOKEN)',ok:c=>Boolean(String(c.env.N7_GITHUB_DISPATCH_TOKEN||'').trim())},
 pdf_runtime:{label:'φορητό PDF runtime (vendor/pdf.mjs)',ok:c=>c.exists(path.join(c.dir,'vendor','pdf.mjs'))},
 skills:{label:'εγκεκριμένα skills (skills/registry.js)',ok:c=>c.exists(path.join(c.dir,'skills','registry.js'))},
 security:{label:'εγκατεστημένος έλεγχος κεφαλίδων και MCP',ok:c=>['n7-security-agent.js','skills/mcp-client.js','skills/mcp-builtin-server.js'].every(name=>c.exists(path.join(c.dir,name)))}
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
 ['weather','specialist','Καιρός','server',[],REGISTRY.weather.description],
 ['security_headers_audit','specialist','Έλεγχος κεφαλίδων ασφαλείας','server',['security'],'Παθητικός έλεγχος των κεφαλίδων που παρέχει ο χρήστης μέσω MCP.']
];
function status({env=process.env,dir=__dirname,exists=target=>fs.existsSync(target)}={}){
 const context={env,dir,exists};
 const agents=ROSTER.map(([id,kind,greek,runsIn,needs,purpose])=>{
  const missing=needs.filter(key=>!NEED[key].ok(context));
  const observed=observations.get(id);
  return {id,kind,greek,runsIn,purpose,needs:needs.map(key=>({key,label:NEED[key].label,met:!missing.includes(key)})),ready:missing.length===0,
   observed:observed?{...observed}:null,
   reason:missing.length?'Λείπει: '+missing.map(key=>NEED[key].label).join(' · '):runsIn==='github-actions'?'Τρέχει εκτός server (GitHub Actions).':'Οι προϋποθέσεις υπάρχουν· η ποιότητα της εξόδου δεν επαληθεύεται εδώ.'};
 });
 return {agents,summary:{total:agents.length,ready:agents.filter(a=>a.ready).length,notReady:agents.filter(a=>!a.ready).map(a=>a.id),
  observed:agents.filter(a=>a.observed).length,last_successful:agents.filter(a=>a.observed?.last_status==='ok').length}};
}
module.exports={REGISTRY,ASK_PLACE,detect,weatherPlace,newsRequest,dispatch,runWeather,runNews,list,status,ROSTER};
