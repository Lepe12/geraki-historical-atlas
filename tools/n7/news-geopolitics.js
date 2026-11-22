'use strict';
// N7_NEWS_GEOPOLITICS_AGENT_V1: recent Greek and international news with cross-checking.
// Free Google News RSS through the bounded fetcher of
// public-web-search.js. Headlines are search metadata, never verified article text.
// Nothing is invented: an item exists only if a feed returned it with a date and a link.
// The assembled runtime names this module n7-public-web-search.js; the source tree keeps public-web-search.js.
const S=(()=>{try{return require('./n7-public-web-search');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;return require('./public-web-search');}})();
const GOOGLE='https://news.google.com/rss';
const LOCALE={el:'hl=el&gl=GR&ceid=GR:el',en:'hl=en-US&gl=US&ceid=US:en'};
const fold=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/ς/g,'σ');
const compact=(v,max=220)=>String(v||'').replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
function entity(s){
 return String(s||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,' ')
  .replace(/&#x([a-f0-9]+);/gi,(_,x)=>String.fromCodePoint(Math.min(parseInt(x,16),0x10ffff)))
  .replace(/&#([0-9]+);/g,(_,x)=>String.fromCodePoint(Math.min(Number(x),0x10ffff)))
  .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi,(_,n)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[n.toLowerCase()]);
}
function tag(item,name){
 const m=item.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'));
 return compact(entity(m?.[1]||''),600);
}
// Bing wraps the publisher address in an http click link; the real https address is its url= parameter.
function publisherLink(raw){
 const link=String(raw||'').trim();
 try{
  const u=new URL(link);
  if(u.hostname==='www.bing.com'&&u.pathname==='/news/apiclick.aspx'){
   const inner=u.searchParams.get('url');return inner?S.safeLink(inner):'';
  }
 }catch{return '';}
 return S.safeLink(link);
}
function parseFeed(xml,{provider,language,now=Date.now(),maxAgeDays=3,limit=25}={}){
 const text=String(xml||'');
 if(!text.includes('<item'))return [];
 const out=[];
 for(const item of (text.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)||[]).slice(0,60)){
  const url=publisherLink(tag(item,'link'));
  let title=compact(tag(item,'title'),220);
  const millis=Date.parse(tag(item,'pubDate'));
  if(!title||!url||!Number.isFinite(millis)||millis>now+3600000||millis<now-maxAgeDays*86400000)continue;
  let publisher=compact(tag(item,'source')||tag(item,'News:Source'),90);
  // Google News appends " - Publisher" to every title.
  if(publisher&&title.endsWith(' - '+publisher))title=title.slice(0,-(publisher.length+3)).trim();
  if(!publisher){try{publisher=new URL(url).hostname.replace(/^www\./,'');}catch{publisher='';}}
  if(!publisher||!title)continue;
  out.push({title,url,publisher,published:new Date(millis).toISOString(),provider,language});
  if(out.length>=limit)break;
 }
 return out;
}
// Established outlets and agencies, matched on the folded publisher name. This is an editorial
// list used for ordering and for the "cross-checked" label only; it proves nothing about a story.
const ESTABLISHED=['reuters','associated press','ap news','bbc','afp','agence france','deutsche welle','dw','euronews','the guardian','guardian',
 'new york times','washington post','financial times','bloomberg','al jazeera','france 24','politico','npr','pbs','cnn','the economist','wall street journal',
 'αθηναικο','απε-μπε','amna','ερτ','ertnews','καθημερινη','kathimerini','ναυτεμπορικη','naftemporiki','το βημα','tovima','τα νεα','tanea','skai','σκαϊ','σκαι',
 'in.gr','capital.gr','οικονομικοσ ταχυδρομοσ','ot.gr','news247','efsyn','εφημεριδα των συντακτων','protothema','πρωτο θεμα','iefimerida','liberal','cnn greece','cnn.gr','μακεδονικο πρακτορειο'];
const established=p=>{const f=fold(p);return ESTABLISHED.some(k=>f===k||f.includes(k));};
const publisherKey=p=>fold(p).replace(/^the\s+/,'').replace(/\.(gr|com|org|net|eu)$/,'').replace(/[^\p{L}\p{N}]+/gu,'');
// Headline type from wording alone. A statement attributed to a person or body is a claim;
// opinion and explainer formats are analysis; everything else is a reported event.
const ANALYSIS=/(?:^|[\s:«"(])(?:αναλυση|αποψη|σχολιο|γνωμη|παρεμβαση|αρθρο|γραφει ο|γραφει η|τι σημαινει|τι κρυβεται|γιατι |πωσ |opinion|analysis|explainer|editorial|commentary|what it means|what to expect|τι να περιμενουμε|why |how )/u;
const CLAIM=/(?:«[^»]{3,}»|"[^"]{3,}"|“[^”]{3,}”|^[\p{L}.\s-]{2,40}:\s|(?:^|\s)(?:δηλωσε|δηλωνει|λεει|ειπε|ισχυριζεται|υποστηριζει|κατηγορει|προειδοποιει|διαψευδει|απανταει|απαντα|καλει|ζητα|says|said|claims|claimed|accuses|warns|denies|vows|urges|alleges|according to|συμφωνα με|reports|report says|sources say|αναφερει|μεταδιδει|πληροφοριεσ)(?:\s|$))/u;
function headlineKind(title){
 const f=fold(title);
 if(ANALYSIS.test(f))return 'analysis';
 if(CLAIM.test(f)||CLAIM.test(title))return 'claim';
 return 'report';
}
const STOP=new Set(['απο','στην','στον','στη','στο','στα','στισ','στουσ','την','τον','τησ','του','των','τουσ','τισ','και','για','που','πωσ','οτι','ειναι','ηταν','εχει','ειχε','θα','να','δεν','μετα','πριν','κατα','προσ','μεσα','ενα','μια','ενασ','οι','τα','το','με','σε','ωσ','εωσ','πιο','νεα','νεο','νεοσ','σημερα','χθεσ','ειδησεισ','βιντεο','video','live','news','the','and','for','with','from','that','this','after','over','into','says','said','will','has','have','its','his','her','are','was','new']);
const stem=w=>/[Ͱ-Ͽ]/.test(w)&&w.length>=6?w.replace(/[αεηιουω]{1,2}σ?$|σ$/u,''):w.replace(/(?:ing|ed|es|s)$/,'');
function tokens(title){
 const out=new Set();
 for(const w of fold(title).match(/[\p{L}\p{N}]{4,}/gu)||[]){if(!STOP.has(w))out.add(stem(w));}
 return out;
}
function similar(a,b){
 let shared=0;for(const t of a)if(b.has(t))shared++;
 if(shared<3)return false;
 return shared>=4||shared/(a.size+b.size-shared)>=0.3;
}
const headlineKey=title=>fold(title).replace(/[^\p{L}\p{N}]+/gu,' ').trim();
// Group related headlines and treat verbatim republications as one report.
function cluster(items){
 const groups=[];
 for(const item of items){
  const t=tokens(item.title),key=headlineKey(item.title);
  const group=groups.find(g=>g.language===item.language&&g.members.some(m=>m.key===key||similar(m.tokens,t)));
  const member={...item,tokens:t,key};
  if(group){if(!group.members.some(m=>publisherKey(m.publisher)===publisherKey(item.publisher)))group.members.push(member);}
  else groups.push({language:item.language,members:[member]});
 }
 return groups.map(g=>{
  const members=g.members.sort((a,b)=>Number(established(b.publisher))-Number(established(a.publisher))||a.published.localeCompare(b.published));
  const lead=members[0],distinct=[];
  for(const member of members){
   if(!distinct.some(m=>m.key===member.key||m.url===member.url))distinct.push(member);
  }
  const independent=distinct.length,known=distinct.filter(m=>established(m.publisher)).length;
  return {kind:headlineKind(lead.title),title:lead.title,language:g.language,independentSources:independent,establishedSources:known,
   // This ranks distinct reporting in the feeds. Headlines cannot prove independent sourcing.
   crossChecked:independent>=2&&known>=1,
   latest:members.map(m=>m.published).sort().at(-1),
   sources:members.map(m=>({title:m.title,publisher:m.publisher,url:m.url,published:m.published,provider:m.provider}))};
 }).sort((a,b)=>Number(b.crossChecked)-Number(a.crossChecked)||b.independentSources-a.independentSources||b.establishedSources-a.establishedSources||b.latest.localeCompare(a.latest));
}
const TOPICS={
 geopolitics:{label:'Γεωπολιτική και διεθνείς σχέσεις',
  el:'γεωπολιτική OR διπλωματία OR "διεθνείς σχέσεις" OR εκεχειρία OR κυρώσεις OR "σύνοδος κορυφής" OR πόλεμος',
  // Not the bare words "summit" or "conflict": they match company names (a drug maker called Summit)
  // and climate or business "summits". Specific phrases keep the results on international affairs.
  en:'geopolitics OR diplomacy OR ceasefire OR sanctions OR "peace talks" OR "leaders summit" OR "foreign minister" OR "security council"'},
 economy:{label:'Οικονομικές εξελίξεις',
  el:'οικονομία OR πληθωρισμός OR αγορές OR επιτόκια OR ενέργεια',
  en:'economy OR inflation OR markets OR "central bank" OR energy prices'},
 general:{label:'Κύριες ειδήσεις',el:'',en:''}
};
function searchUrl(query,language,days){
 return GOOGLE+'/search?q='+encodeURIComponent(compact(query,150)+' when:'+days+'d')+'&'+LOCALE[language];
}
// request: {topic:'geopolitics'|'economy'|'general', scope:'greece'|'world'|'both', subject:string}
function plan(request){
 const topic=TOPICS[request.topic]?request.topic:'general',subject=compact(request.subject,120),feeds=[];
 const add=(name,url,language,maxAgeDays)=>feeds.push({name,url,language,maxAgeDays});
 if(subject){
  add('Google News (αναζήτηση, ελληνικά)',searchUrl(subject,'el',7),'el',7);
  if(/[a-z]{3,}/i.test(subject))add('Google News (search, English)',searchUrl(subject,'en',7),'en',7);
  return feeds;
 }
 if(topic==='general'){
  if(request.scope!=='world')add('Google News (Ελλάδα, κύριες ειδήσεις)',GOOGLE+'?'+LOCALE.el,'el',2);
  if(request.scope!=='greece'){
   add('Google News (διεθνή, ελληνικά)',searchUrl('διεθνείς ειδήσεις OR κόσμος','el',2),'el',2);
   add('Google News (world, English)',searchUrl(TOPICS.geopolitics.en,'en',1),'en',2);
  }
  return feeds;
 }
 const t=TOPICS[topic];
 if(request.scope!=='world')add('Google News (ελληνικά)',searchUrl((request.scope==='greece'?'Ελλάδα ':'')+t.el,'el',2),'el',3);
 else add('Google News (ελληνικά)',searchUrl(t.el,'el',2),'el',3);
 if(request.scope!=='greece')add('Google News (English)',searchUrl(t.en,'en',1),'en',2);
 return feeds;
}
async function gather(request,{transport=fetch,now=()=>new Date()}={}){
 const feeds=plan(request),at=now();
 const results=await Promise.allSettled(feeds.map(async feed=>
  parseFeed(await S.boundedFetch(feed.url,{transport}),{provider:feed.name,language:feed.language,now:at.getTime(),maxAgeDays:feed.maxAgeDays})));
 const items=[],seen=new Set(),providers=[];
 results.forEach((r,i)=>{
  providers.push({name:feeds[i].name,ok:r.status==='fulfilled',items:r.status==='fulfilled'?r.value.length:0});
  if(r.status!=='fulfilled')return;
  for(const x of r.value){const key=publisherKey(x.publisher)+'|'+fold(x.title).slice(0,80);if(seen.has(key))continue;seen.add(key);items.push(x);}
 });
 const clusters=cluster(items).slice(0,12);
 return {schema:'n7-news-v1',topic:TOPICS[request.topic]?request.topic:'general',topicLabel:(TOPICS[request.topic]||TOPICS.general).label,
  scope:request.scope||'both',subject:compact(request.subject,120),retrieved_at:at.toISOString(),providers,
  availableProviders:providers.filter(p=>p.ok).length,itemCount:items.length,clusters};
}
const athens=(iso,withTime=true)=>new Intl.DateTimeFormat('el-GR',{timeZone:'Europe/Athens',day:'2-digit',month:'2-digit',year:'numeric',
 ...(withTime?{hour:'2-digit',minute:'2-digit',hour12:false}:{})}).format(new Date(iso));
// Numbered evidence list [S1]… in display order.
function numbered(report){
 const order=[...report.clusters.filter(c=>c.kind==='report'&&c.crossChecked),...report.clusters.filter(c=>c.kind==='report'&&!c.crossChecked),
  ...report.clusters.filter(c=>c.kind==='claim'),...report.clusters.filter(c=>c.kind==='analysis')];
 return order.map((c,i)=>({...c,id:'S'+(i+1)}));
}
function describe(report){
 const list=numbered(report),scope={greece:'Ελλάδα',world:'Διεθνή',both:'Ελλάδα και διεθνή'}[report.scope]||'Ελλάδα και διεθνή';
 const lines=['Ειδήσεις — '+report.topicLabel+(report.subject?' · θέμα: '+report.subject:'')+' · '+scope,
  'Ενημέρωση: '+athens(report.retrieved_at)+' (ώρα Ελλάδας)'];
 if(!list.length){
  lines.push(report.availableProviders?'Οι πηγές απάντησαν, αλλά δεν επέστρεψαν πρόσφατες ειδήσεις για αυτό το αίτημα. Δεν θα επινοήσω καμία.'
   :'Καμία πηγή ειδήσεων δεν απάντησε αυτή τη στιγμή. Δεν έχω πραγματικά δεδομένα και δεν θα επινοήσω ειδήσεις.');
  return lines.join('\n');
 }
 const section=(title,rows)=>{
  if(!rows.length)return;
  lines.push('',title);
  for(const c of rows){
   lines.push('['+c.id+'] '+c.title+' — '+athens(c.latest,false)+' — '+c.sources.map(s=>s.publisher).join(', '));
   for(const s of c.sources.slice(0,3))lines.push(s.publisher+': '+s.url);
  }
 };
 section('ΣΧΕΤΙΚΟΙ ΤΙΤΛΟΙ ΑΠΟ ΠΕΡΙΣΣΟΤΕΡΑ ΜΕΣΑ:',list.filter(c=>c.kind==='report'&&c.crossChecked));
 section('ΛΟΙΠΟΙ ΤΙΤΛΟΙ ΕΙΔΗΣΕΩΝ:',list.filter(c=>c.kind==='report'&&!c.crossChecked));
 section('ΙΣΧΥΡΙΣΜΟΙ, ΔΗΛΩΣΕΙΣ ΚΑΙ ΑΠΟΔΙΔΟΜΕΝΕΣ ΑΝΑΦΟΡΕΣ (ανήκουν σε όσους τους διατυπώνουν):',list.filter(c=>c.kind==='claim'));
 section('ΑΝΑΛΥΣΕΙΣ ΚΑΙ ΣΧΟΛΙΑ (γνώμες, όχι γεγονότα):',list.filter(c=>c.kind==='analysis'));
 const failed=report.providers.filter(p=>!p.ok).map(p=>p.name);
 lines.push('','Σημείωση: διαβάστηκαν μόνο τίτλοι, ημερομηνίες και μέσα από δημόσιες ροές ειδήσεων, όχι τα ίδια τα άρθρα. '+
  'Η κατάταξη βασίζεται στη διατύπωση του τίτλου. Η ανεξαρτησία των δημοσιευμάτων δεν έχει ελεγχθεί.'+(failed.length?' Δεν απάντησαν: '+failed.join(', ')+'.':''));
 return lines.join('\n');
}
module.exports={parseFeed,publisherLink,headlineKind,tokens,similar,cluster,plan,gather,describe,numbered,established,TOPICS};
