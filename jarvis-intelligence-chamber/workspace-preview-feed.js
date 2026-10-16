// Isolated layout demonstration. Never opens a production socket or dispatches research.
export {missionState,isTerminal} from './live-bridge.js?v=startup-feedback-20261016-2';
const sample=await fetch('./workspace-preview-sample.json').then(r=>{if(!r.ok)throw Error('preview_sample_unavailable');return r.json()});
const subscribers=new Set();let current=null,request='preview-layout',target='',phase='ready',usingSample=false;
const base={schema:'pct-command-center-live-v1',run_id:'9001',project:'piratecartography',safety:{automatic_verified:false,human_review_required:true},claims:[],coverage:[],contradictions:{records:[]}};
export function previewSetState(next,options={}){
 phase=next;if('sample' in options)usingSample=!!options.sample;if(usingSample)target=sample.target;if(options.request)request=options.request;if(options.target)target=options.target;
 const statuses={ready:'READY',waiting:'QUEUED',running:'RUNNING',complete:'COMPLETED',failed:'FAILED'};
 current={...base,request_id:request,generated_utc:new Date().toISOString(),mission:{target,preview:true,preview_sample:usingSample,status:statuses[phase]||'RUNNING',purpose:'Δοκιμή διάταξης · δείγμα από καταγεγραμμένη έρευνα'},agents:(['ready','waiting'].includes(phase)||phase==='complete'&&!usingSample)?[]:[{id:'greek',status:phase==='running'?'RUNNING':'COMPLETED',phase:'Αναζήτηση καταλόγων και συλλογών'},{id:'travellers',status:phase==='running'?'RUNNING':'COMPLETED',phase:'Εντοπισμός αφηγηματικών πηγών'},{id:'source_genealogy',status:'COMPLETED',phase:'Έλεγχος βιβλιογραφικών σχέσεων'}],discoveries:phase==='complete'&&usingSample?sample.discoveries:[],blockers:phase==='complete'&&usingSample?sample.blockers:[],events:[{schema:'pct-jarvis-event-v1',run_id:'9001',request_id:request,event_id:'layout-'+Date.now(),agent_id:phase==='running'?'greek':'jarvis',status:statuses[phase],detail:phase==='waiting'?'Το αίτημα παραλήφθηκε. Αναμονή διαθέσιμου ερευνητή.':phase==='running'?'Αναζήτηση στις ελληνικές συλλογές και στις αφηγηματικές πηγές.':'Η δοκιμαστική ροή ολοκληρώθηκε. Τα παρακάτω δείγματα παραμένουν ανεπιβεβαίωτες αναφορές.'}]};
 for(const o of subscribers){o.onSnapshot?.(current,'PREVIEW');o.onState?.('PREVIEW');}
 return current;
}
export function connectResearchFeed(options={}){subscribers.add(options);if(!current)previewSetState('ready');else{options.onSnapshot?.(current,'PREVIEW');options.onState?.('PREVIEW');}return()=>subscribers.delete(options);}
export function selectResearchRun(){/* The preview has one clearly labelled sample. */}
export function waitForResearchRequest(id){request=id;for(const o of subscribers)o.onReset?.();previewSetState('waiting',{sample:false,request:id,target:document.getElementById('operatorQuery')?.value.trim()||target});}
