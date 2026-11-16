'use strict';
// N7_WEATHER_TOOL_V1: real current conditions and forecast data from Open-Meteo (free, no key). Server-side only, because
// the N7 page CSP allows browser connections to 'self' alone. Returns the provider URLs used.
const HOSTS=new Set(['geocoding-api.open-meteo.com','api.open-meteo.com']);
const CODES={0:'Αίθριος',1:'Κυρίως αίθριος',2:'Μερικώς νεφελώδης',3:'Νεφελώδης',45:'Ομίχλη',48:'Παγωμένη ομίχλη',51:'Ασθενές ψιχάλισμα',53:'Ψιχάλισμα',55:'Πυκνό ψιχάλισμα',61:'Ασθενής βροχή',63:'Βροχή',65:'Ισχυρή βροχή',71:'Ασθενής χιονόπτωση',73:'Χιονόπτωση',75:'Ισχυρή χιονόπτωση',80:'Ασθενείς μπόρες',81:'Μπόρες',82:'Ισχυρές μπόρες',95:'Καταιγίδα',96:'Καταιγίδα με χαλάζι',99:'Ισχυρή καταιγίδα με χαλάζι'};
function validPlace(v){return typeof v==='string'&&v.trim().length>=2&&v.length<=80&&/^[\p{L}\p{M}\s.'-]+$/u.test(v.trim());}
async function bounded(url,fetcher,timeout=7000){
 const u=new URL(url);if(u.protocol!=='https:'||!HOSTS.has(u.hostname))throw Error('WEATHER_HOST_NOT_ALLOWED');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{const r=await fetcher(u.href,{redirect:'error',signal:controller.signal,headers:{Accept:'application/json'}});
  if(!r.ok)throw Error('WEATHER_HTTP_'+r.status);
  const text=await r.text();if(text.length>200000)throw Error('WEATHER_RESPONSE_TOO_LARGE');return JSON.parse(text);}
 finally{clearTimeout(timer);}
}
async function forecast(place,{fetcher=fetch,now=()=>new Date()}={}){
 if(!validPlace(place))throw Error('WEATHER_INVALID_PLACE');
 const geoUrl='https://geocoding-api.open-meteo.com/v1/search?count=1&language=el&format=json&name='+encodeURIComponent(place.trim());
 const geo=await bounded(geoUrl,fetcher);
 const hit=Array.isArray(geo.results)?geo.results[0]:null;
 if(!hit||!Number.isFinite(hit.latitude)||!Number.isFinite(hit.longitude))throw Error('WEATHER_PLACE_NOT_FOUND');
 const fUrl='https://api.open-meteo.com/v1/forecast?latitude='+hit.latitude+'&longitude='+hit.longitude+
  '&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m'+
  '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max&timezone=auto&forecast_days=3';
 const data=await bounded(fUrl,fetcher);
 const d=data.daily;
 if(!d||!Array.isArray(d.time)||!d.time.length)throw Error('WEATHER_INVALID_RESPONSE');
 const days=d.time.slice(0,3).map((date,i)=>({date,summary:CODES[d.weather_code?.[i]]??('Κωδικός '+d.weather_code?.[i]),
  max_c:d.temperature_2m_max?.[i]??null,min_c:d.temperature_2m_min?.[i]??null,
  precipitation_probability:d.precipitation_probability_max?.[i]??null,wind_max_kmh:d.wind_speed_10m_max?.[i]??null,
  precipitation_mm:num(d.precipitation_sum?.[i]),wind_gust_max_kmh:num(d.wind_gusts_10m_max?.[i])}));
 // N7_WEATHER_AGENT_V1: current conditions exactly as the provider reports them; a missing field stays null.
 const c=data.current&&typeof data.current==='object'&&typeof data.current.time==='string'?data.current:null;
 const current=c?{time:c.time,summary:CODES[c.weather_code]??(Number.isFinite(c.weather_code)?'Κωδικός '+c.weather_code:null),
  temperature_c:num(c.temperature_2m),apparent_c:num(c.apparent_temperature),humidity_percent:num(c.relative_humidity_2m),
  precipitation_mm:num(c.precipitation),wind_kmh:num(c.wind_speed_10m),wind_gust_kmh:num(c.wind_gusts_10m),wind_direction_deg:num(c.wind_direction_10m)}:null;
 return {schema:'n7-weather-v1',place:{name:hit.name,country:hit.country||'',admin:hit.admin1||'',latitude:hit.latitude,longitude:hit.longitude,timezone:data.timezone||''},
  current,days,
  // The Open-Meteo forecast API carries no official warnings, so none are reported or derived.
  warnings:{available:false,items:[],reason:'PROVIDER_HAS_NO_WARNINGS'},
  provider:'Open-Meteo',sources:[geoUrl,fUrl],retrieved_at:now().toISOString()};
}
const num=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
// Greek presentation of a report. Every figure comes from the report; a null field is left out.
const WIND=['Β','ΒΑ','Α','ΝΑ','Ν','ΝΔ','Δ','ΒΔ'];
const fmt=v=>String(Math.round(v*10)/10).replace('.',',');
function greekDate(iso){const m=String(iso).match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);if(!m)return String(iso);
 const day=['Κυρ','Δευ','Τρί','Τετ','Πέμ','Παρ','Σάβ'][new Date(Date.UTC(+m[1],+m[2]-1,+m[3])).getUTCDay()];
 return day+' '+m[3]+'/'+m[2]+'/'+m[1]+(m[4]?' '+m[4]+':'+m[5]:'');}
function describe(report){
 const p=report.place,where=[p.name,p.admin&&p.admin!==p.name?p.admin:'',p.country].filter(Boolean).join(', ');
 const lines=['Καιρός — '+where],c=report.current;
 if(c){
  const parts=[];
  if(c.temperature_c!==null)parts.push(fmt(c.temperature_c)+'°C'+(c.apparent_c!==null?' (αίσθηση '+fmt(c.apparent_c)+'°C)':''));
  if(c.summary)parts.push(c.summary);
  if(c.wind_kmh!==null)parts.push('άνεμος '+fmt(c.wind_kmh)+' km/h'+(c.wind_direction_deg!==null?' από '+WIND[Math.round(c.wind_direction_deg/45)%8]:'')+(c.wind_gust_kmh!==null?', ριπές '+fmt(c.wind_gust_kmh)+' km/h':''));
  if(c.precipitation_mm!==null)parts.push('βροχόπτωση '+fmt(c.precipitation_mm)+' mm');
  if(c.humidity_percent!==null)parts.push('υγρασία '+fmt(c.humidity_percent)+'%');
  if(parts.length)lines.push('Τώρα ('+greekDate(c.time)+(p.timezone?', ώρα '+p.timezone:'')+'): '+parts.join(' · ')+'.');
 }else lines.push('Τρέχουσες συνθήκες: ο πάροχος δεν επέστρεψε μέτρηση.');
 lines.push('Πρόγνωση:');
 for(const d of report.days){
  const parts=[d.summary];
  if(d.min_c!==null&&d.max_c!==null)parts.push(fmt(d.min_c)+' έως '+fmt(d.max_c)+'°C');
  if(d.precipitation_probability!==null)parts.push('πιθανότητα βροχής '+fmt(d.precipitation_probability)+'%');
  if(d.precipitation_mm!==null&&d.precipitation_mm!==undefined)parts.push('ύψος βροχής '+fmt(d.precipitation_mm)+' mm');
  if(d.wind_max_kmh!==null)parts.push('άνεμος έως '+fmt(d.wind_max_kmh)+' km/h'+(d.wind_gust_max_kmh!==null&&d.wind_gust_max_kmh!==undefined?' (ριπές έως '+fmt(d.wind_gust_max_kmh)+')':''));
  lines.push('• '+greekDate(d.date)+': '+parts.filter(Boolean).join(' · '));
 }
 lines.push(report.warnings?.available&&report.warnings.items.length?'Προειδοποιήσεις: '+report.warnings.items.join(' · ')
  :'Προειδοποιήσεις: ο πάροχος δεν δίνει επίσημες προειδοποιήσεις, άρα δεν αναφέρω καμία. Για έκτακτα δελτία ισχύει η ΕΜΥ.');
 const at=new Intl.DateTimeFormat('el-GR',{timeZone:'Europe/Athens',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(report.retrieved_at));
 lines.push('Πηγή: '+report.provider+' · ανάκτηση '+at+' (ώρα Ελλάδας)');
 lines.push(...report.sources);
 return lines.join('\n');
}
module.exports={forecast,validPlace,describe,greekDate,HOSTS};
