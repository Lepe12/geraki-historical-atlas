// N7_APEX_VOICE_QUALITY_V1: spoken forms of Latin names and the choice of the Greek voice.
// Run with: node --test tools/n7_apex_preview/test_pronunciation.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {forSpeech,pickGreekVoice,speechPieces} from './N7Pronunciation.ts';

test('Latin names are said in Greek, other text is unchanged',()=>{
  assert.equal(forSpeech('Καλώς ήρθες. Είμαι η N7. Ανοίγω το NABOU και τους Agents.'),'Καλώς ήρθες. Είμαι η Ν επτά. Ανοίγω το Ναμπού και τους Έιτζεντς.');
  assert.equal(forSpeech('Άνοιξε το Chat στο Humanoid'),'Άνοιξε το τσατ στο Χιούμανοϊντ');
  assert.equal(forSpeech('Πηγή: Open-Meteo, Wikipedia, GitHub'),'Πηγή: Όπεν Μετέο, Βικιπαίδεια, Γκιτχαμπ');
  assert.equal(forSpeech('Η Αθήνα έχει 21 βαθμούς.'),'Η Αθήνα έχει 21 βαθμούς.');
  assert.equal(forSpeech('N77 και XN7X'),'N77 και XN7X','only the whole word N7 is replaced');
});
test('the best Greek female voice is chosen; male names and other languages are not',()=>{
  const v=(name,lang,extra={})=>({name,lang,voiceURI:name,...extra});
  const edge=v('Microsoft Athina Online (Natural) - Greek (Greece)','el-GR',{localService:false});
  const google=v('Google ελληνικά','el-GR',{localService:false});
  const stefanos=v('Microsoft Stefanos - Greek (Greece)','el-GR',{localService:true});
  const english=v('Google US English','en-US');
  assert.equal(pickGreekVoice([english,stefanos,google,edge]),edge,'Edge natural first');
  assert.equal(pickGreekVoice([english,stefanos,google]),google,'then Google');
  assert.equal(pickGreekVoice([english,stefanos]),null,'a male voice alone is not used: the built-in female voice stays');
  assert.equal(pickGreekVoice([english]),null);
  assert.equal(pickGreekVoice([]),null);
  assert.equal(pickGreekVoice([v('Some Greek voice','el')]).name,'Some Greek voice','any other Greek voice that is not a male name');
});

test('speech is cut into whole sentences, the first alone, none longer than the limit',()=>{
  const text='Καλώς ήρθες. Είμαι η Ν επτά. Μπορούμε να συζητήσουμε, να συνεχίσουμε τη συγγραφή σου, να αναζητήσουμε ιστορικές πηγές ή να ανοίξουμε τον χάρτη. Πες μου τι χρειάζεσαι.';
  const pieces=speechPieces(text,100);
  assert.equal(pieces[0],'Καλώς ήρθες.','the first sentence is alone, so speech starts quickly');
  assert.ok(pieces.every(p=>p.length<=100),JSON.stringify(pieces.map(p=>p.length)));
  assert.equal(pieces.join(' ').replace(/\s+/g,' '),text,'nothing is lost or reordered');
  assert.ok(pieces.slice(0,-1).every(p=>/[.;!?·…,]$/.test(p)),'cuts fall after punctuation: '+JSON.stringify(pieces));
  const long='λέξη '.repeat(80).trim();
  assert.ok(speechPieces(long,60).every(p=>p.length<=60),'a sentence without punctuation is cut at spaces');
  assert.deepEqual(speechPieces('',100),[]);
});
