// N7_APEX_HOME_V1: navigation phrases, the shared conversation ID and the once-per-login greeting flag.
// Run with: node --test tools/n7_apex_preview/test_navigation.mjs (Node 22 strips the types).
import test from 'node:test';
import assert from 'node:assert/strict';
import {navCommand,isAgentsStatus,describeAgents,targetUrl,readConversationId,writeConversationId,wasGreeted,markGreeted,SHARED_STATE_KEY,GREETING_FIRST,GREETING_AGAIN,isFirstVisit,markWelcomed,WELCOMED_KEY,isWriteCommand,isTasksQuery,describeTasks,isCapabilitiesQuery,describeCapabilities} from './N7Navigation.ts';

const mem=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),_m:m};};

test('spoken and typed commands reach Chat, NABOU and the Humanoid',()=>{
  for(const [text,want] of [
    ['N7, άνοιξε το Chat.','chat'],['άνοιξε το chat','chat'],['Πήγαινε στο Chat','chat'],['άνοιξε τη συνομιλία','chat'],['πήγαινε στο γραπτό chat','chat'],
    ['N7, άνοιξε τον ιστορικό χάρτη.','nabou'],['Άνοιξε το NABOU','nabou'],['άνοιξε το ναμπού','nabou'],['πήγαινε στο NABOU','nabou'],
    ['Άνοιξε τη βιβλιοθήκη','library'],['N7, άνοιξε την ιστορική βιβλιοθήκη.','library'],['άνοιξε τους agents','agents'],['πήγαινε στους Agents','agents'],
    ['N7, επέστρεψε στο ολόγραμμα.','humanoid'],['πήγαινε στο Humanoid','humanoid'],['επιστροφή στο ολόγραμμα','humanoid']]){
    assert.equal(navCommand(text),want,text);
  }
});
test('longer questions and research requests are never taken for navigation',()=>{
  for(const text of ['Τι είναι το chat;','Ξεκίνα ιστορική έρευνα για τον Πέτρο Λάντζα','Πες μου τι γράφει ο χάρτης της Κρήτης','άνοιξε το παράθυρο','Τι καιρό κάνει στην Αθήνα;','',
    'Πες μου για τον ιστορικό χάρτη του 1700 και τι έδειχνε για την Κρήτη, παρακαλώ με λεπτομέρειες και πηγές']){
    assert.equal(navCommand(text),null,text);
  }
});
test('targets point at the existing N7 screens on the same origin',()=>{
  assert.equal(targetUrl('chat'),'/?view=chat');assert.equal(targetUrl('nabou'),'/?view=nabou');assert.equal(targetUrl('humanoid'),'/n7-apex/');assert.equal(targetUrl('library'),'/?view=library');assert.equal(targetUrl('agents'),'/?view=agents');
});
test('writing the conversation keeps every other field of the shared state',()=>{
  const store=mem();
  store.setItem(SHARED_STATE_KEY,JSON.stringify({schema:'n7-shared-state/v1',conversationId:null,topic:'Κρήτη',actions:[{kind:'x'}],prefs:{tts:true}}));
  writeConversationId('a1b2c3d4-0000-4000-8000-123456789abc',store);
  const value=JSON.parse(store.getItem(SHARED_STATE_KEY));
  assert.equal(value.conversationId,'a1b2c3d4-0000-4000-8000-123456789abc');assert.equal(value.topic,'Κρήτη');assert.deepEqual(value.prefs,{tts:true});assert.equal(value.actions.length,1);
  assert.equal(readConversationId(store),'a1b2c3d4-0000-4000-8000-123456789abc');
});
test('an unsafe ID or a foreign state is neither read nor written',()=>{
  const store=mem();writeConversationId('../etc/passwd',store);assert.equal(store.getItem(SHARED_STATE_KEY),null);
  store.setItem(SHARED_STATE_KEY,JSON.stringify({schema:'other',conversationId:'abc'}));assert.equal(readConversationId(store),null);
  store.setItem(SHARED_STATE_KEY,'not json');assert.equal(readConversationId(store),null);
  assert.equal(readConversationId(null),null);
});
test('the greeting flag is per login and the approved Greek sentences are exact',()=>{
  const store=mem();assert.equal(wasGreeted(store),false);markGreeted(store);assert.equal(wasGreeted(store),true);
  assert.equal(GREETING_FIRST,'Καλώς ήρθες. Είμαι η N7. Μπορούμε να συζητήσουμε, να συνεχίσουμε τη συγγραφή σου, να αναζητήσουμε ιστορικές πηγές ή να ανοίξουμε τον ιστορικό χάρτη NABOU. Μπορώ επίσης να αναλάβω εργασίες μέσω των διαθέσιμων Agents σου. Πες μου τι χρειάζεσαι. Αν προτιμάς να γράψεις, πάτησε το μικρό πληκτρολόγιο στο κάτω μέρος της οθόνης.');
  assert.equal(GREETING_AGAIN,'Καλώς ήρθες ξανά. Πώς μπορώ να σε βοηθήσω;');
});
test('first visit: remembered by this browser and confirmed by the server',()=>{
  const store=mem();
  assert.equal(isFirstVisit(false,store),true,'nothing stored, no conversations');
  assert.equal(isFirstVisit(true,store),false,'the server already has conversations');
  markWelcomed(store);assert.equal(store.getItem(WELCOMED_KEY),'1');
  assert.equal(isFirstVisit(false,store),false,'welcomed before');
  assert.equal(isFirstVisit(false,null),true,'no storage available: treated as first visit only when the server has no conversation');
});
test('«θέλω να γράψω» is a command, a longer sentence is not',()=>{
  for(const text of ['N7, θέλω να γράψω.','θέλω να γράψω','Άνοιξε το πληκτρολόγιο']) assert.equal(isWriteCommand(text),true,text);
  for(const text of ['θέλω να γράψω ένα γράμμα στον αδελφό μου για την Χίο','γράψε μου ένα ποίημα','']) assert.equal(isWriteCommand(text),false,text);
});
test('tasks: the question and the answer from the real list',()=>{
  for(const text of ['N7, ποιες εργασίες εκτελούν οι Agents;','Ποιες εργασίες εκτελούν οι agents','ποιες εργασίες τρέχουν τώρα','τι εργασίες εκτελούνται']) assert.equal(isTasksQuery(text),true,text);
  for(const text of ['ξεκίνα μια εργασία για τη Χίο','Τι είναι οι agents']) assert.equal(isTasksQuery(text),false,text);
  assert.equal(describeTasks({tasks:[]}),'Αυτή τη στιγμή δεν εκτελείται καμία εργασία. Δεν υπάρχουν καταγεγραμμένες εργασίες.');
  assert.equal(describeTasks({tasks:[{status:'completed',prompt:'x'},{status:'failed',prompt:'y'}]}),'Αυτή τη στιγμή δεν εκτελείται καμία εργασία. Έχουν καταγραφεί 2 εργασίες συνολικά, 1 ολοκληρωμένες.');
  assert.equal(describeTasks({tasks:[{status:'running',prompt:'Ανάλυση πηγών για τη Χίο'},{status:'queued',prompt:'Επιμέλεια κειμένου'},{status:'completed',prompt:'z'}]}),'Εκτελούνται 1: Ανάλυση πηγών για τη Χίο. Σε αναμονή 1: Επιμέλεια κειμένου.');
  assert.equal(describeTasks({}),'Αυτή τη στιγμή δεν εκτελείται καμία εργασία. Δεν υπάρχουν καταγεγραμμένες εργασίες.');
});
test('capabilities: built from the real readiness report',()=>{
  assert.equal(isCapabilitiesQuery('N7, τι μπορείς να κάνεις;'),true);assert.equal(isCapabilitiesQuery('τι μπορείς να κάνεις με τη βιβλιοθήκη μου και πώς'),false);
  const report={summary:{total:4,ready:3},agents:[{id:'news_geopolitics',greek:'Ειδήσεις',ready:true},{id:'weather',greek:'Καιρός',ready:true},{id:'historian',greek:'Ιστορική έρευνα',ready:false},{id:'browser_reader',greek:'Browser Reader',ready:false}]};
  const text=describeCapabilities(report);
  assert.match(text,/ειδήσεις και γεωπολιτική/);assert.match(text,/τον καιρό/);assert.doesNotMatch(text,/ιστορικές πηγές στη βιβλιοθήκη/,'a library that is not ready is not promised');
  assert.match(text,/Από τους 4 Agents, οι 3 είναι έτοιμοι\./);assert.match(text,/Δεν είναι διαθέσιμοι τώρα: Ιστορική έρευνα, Browser Reader\./);
  assert.match(describeCapabilities({}),/^Μπορώ να συζητώ μαζί σου/);
});


test('the status of the agents is asked in plain words and answered from the real report',()=>{
  for(const text of ['Δείξε μου την κατάσταση των Agents','N7, δείξε μου την κατάσταση των agents.','κατάσταση των agents','πες μου την κατάσταση των agents']) assert.equal(isAgentsStatus(text),true,text);
  for(const text of ['Τι κάνουν οι agents','Ξεκίνα έρευνα για τους agents','άνοιξε τους agents']) assert.equal(isAgentsStatus(text),false,text);
  const report={summary:{total:3,ready:2,notReady:['browser_reader']},agents:[{greek:'Συντονιστής',ready:true},{greek:'Καιρός',ready:true},{greek:'Browser Reader',ready:false,reason:'Λείπει: επιτρεπόμενα domains (BROWSER_ALLOWED_DOMAINS).'}]};
  assert.equal(describeAgents(report),'Από τους 3 Agents, οι 2 είναι έτοιμοι. Δεν είναι έτοιμοι: Browser Reader (Λείπει: επιτρεπόμενα domains (BROWSER_ALLOWED_DOMAINS)). «Έτοιμος» σημαίνει ότι υπάρχουν οι απαιτήσεις του, όχι ότι η έξοδός του έχει επαληθευτεί.');
  assert.match(describeAgents({summary:{total:2,ready:2},agents:[{ready:true},{ready:true}]}),/Δεν λείπει καμία απαίτηση/);
  assert.equal(describeAgents({}),'Δεν έλαβα κατάσταση των Agents από τον server.');
});
