// N7_APEX_HOME_V1: navigation phrases, the shared conversation ID and the once-per-login greeting flag.
// Run with: node --test tools/n7_apex_preview/test_navigation.mjs (Node 22 strips the types).
import test from 'node:test';
import assert from 'node:assert/strict';
import {navCommand,isAgentsStatus,describeAgents,targetUrl,readConversationId,writeConversationId,wasGreeted,markGreeted,SHARED_STATE_KEY,GREETING} from './N7Navigation.ts';

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
test('the greeting is marked once and the text is the approved Greek sentence',()=>{
  const store=mem();assert.equal(wasGreeted(store),false);markGreeted(store);assert.equal(wasGreeted(store),true);
  assert.equal(GREETING,'Καλώς ήρθες. Είμαι η N7. Πώς μπορώ να σε βοηθήσω σήμερα;');
});

test('the status of the agents is asked in plain words and answered from the real report',()=>{
  for(const text of ['Δείξε μου την κατάσταση των Agents','N7, δείξε μου την κατάσταση των agents.','κατάσταση των agents','πες μου την κατάσταση των agents']) assert.equal(isAgentsStatus(text),true,text);
  for(const text of ['Τι κάνουν οι agents','Ξεκίνα έρευνα για τους agents','άνοιξε τους agents']) assert.equal(isAgentsStatus(text),false,text);
  const report={summary:{total:3,ready:2,notReady:['browser_reader']},agents:[{greek:'Συντονιστής',ready:true},{greek:'Καιρός',ready:true},{greek:'Browser Reader',ready:false,reason:'Λείπει: επιτρεπόμενα domains (BROWSER_ALLOWED_DOMAINS).'}]};
  assert.match(describeAgents(report),/^Από τους 3 Agents, οι 2 έχουν τις απαραίτητες ρυθμίσεις/);
  assert.match(describeAgents(report),/Browser Reader.*server αναφέρει μόνο ρυθμίσεις/);
  report.agents[1].observed={last_status:'provider_unavailable',last_run_at:'2026-11-20T12:00:00Z',last_success_at:'2026-11-19T12:00:00Z',last_error_at:'2026-11-20T12:00:00Z'};
  assert.match(describeAgents(report),/Καιρός: η πηγή δεν απάντησε.*Τελευταία επιτυχία.*Τελευταίο σφάλμα/);
  assert.match(describeAgents({summary:{total:2,ready:2},agents:[{ready:true},{ready:true}]}),/Δεν λείπει καμία απαίτηση/);
  assert.equal(describeAgents({}),'Δεν έλαβα κατάσταση των Agents από τον server.');
});


test("a request for the saved Creveliers report resolves without launching research", async () => {
  const {privateReportRun}=await import("./N7Navigation.ts");
  assert.equal(privateReportRun("N7, δείξε μου την ολοκληρωμένη εργασία Creveliers"),"44486434472");
  assert.equal(privateReportRun("Άνοιξε την ιδιωτική αναφορά 44486434472"),"44486434472");
  assert.equal(privateReportRun("Ψάξε για Creveliers στην Ιεράπετρα το 1675"),null);
});
