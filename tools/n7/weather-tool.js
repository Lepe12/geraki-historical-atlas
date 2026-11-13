'use strict';
// N7_WEATHER_TOOL_V1: real forecast data from Open-Meteo (free, no key). Server-side only, because
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
  '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&timezone=auto&forecast_days=3';
 const data=await bounded(fUrl,fetcher);
 const d=data.daily;
 if(!d||!Array.isArray(d.time)||!d.time.length)throw Error('WEATHER_INVALID_RESPONSE');
 const days=d.time.slice(0,3).map((date,i)=>({date,summary:CODES[d.weather_code?.[i]]??('Κωδικός '+d.weather_code?.[i]),
  max_c:d.temperature_2m_max?.[i]??null,min_c:d.temperature_2m_min?.[i]??null,
  precipitation_probability:d.precipitation_probability_max?.[i]??null,wind_max_kmh:d.wind_speed_10m_max?.[i]??null}));
 return {schema:'n7-weather-v1',place:{name:hit.name,country:hit.country||'',admin:hit.admin1||'',latitude:hit.latitude,longitude:hit.longitude,timezone:data.timezone||''},
  days,provider:'Open-Meteo',sources:[geoUrl,fUrl],retrieved_at:now().toISOString()};
}
module.exports={forecast,validPlace,HOSTS};
