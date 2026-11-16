// N7_SPECIALIST_AGENTS_V1: the spoken version of the News & Geopolitics and Weather answers.
// Run with: node --test tools/n7_apex_preview/test_agent_speech.mjs (Node 22 strips the types).
import test from 'node:test';
import assert from 'node:assert/strict';
import {speakable,spokenGreek,MAX_SPOKEN_CHARACTERS} from './N7AgentSpeech.ts';

const WEATHER=`[Weather Agent]
Καιρός — Αθήνα, Αττική, Ελλάδα
Τώρα (Σάβ 14/11/2026 20:00, ώρα Europe/Athens): 20,3°C (αίσθηση 22,4°C) · Κυρίως αίθριος · άνεμος 2,3 km/h από ΒΑ, ριπές 4,3 km/h · βροχόπτωση 0 mm · υγρασία 80%.
Πρόγνωση:
• Σάβ 14/11/2026: Κυρίως αίθριος · 18,5 έως 23,8°C · πιθανότητα βροχής 0% · ύψος βροχής 0 mm · άνεμος έως 11 km/h (ριπές έως 29,5)
• Κυρ 15/11/2026: Νεφελώδης · 15 έως 20,9°C · πιθανότητα βροχής 0% · ύψος βροχής 0 mm · άνεμος έως 8,4 km/h (ριπές έως 22,3)
Προειδοποιήσεις: ο πάροχος δεν δίνει επίσημες προειδοποιήσεις, άρα δεν αναφέρω καμία. Για έκτακτα δελτία ισχύει η ΕΜΥ.
Πηγή: Open-Meteo · ανάκτηση 14/11/2026, 20:11 (ώρα Ελλάδας)
https://geocoding-api.open-meteo.com/v1/search?count=1&name=x
https://api.open-meteo.com/v1/forecast?latitude=1`;

const NEWS=`[News & Geopolitics Agent]
Ειδήσεις — Γεωπολιτική και διεθνείς σχέσεις · Ελλάδα και διεθνή
Ενημέρωση: 14/11/2026, 20:11 (ώρα Ελλάδας)

ΓΕΓΟΝΟΤΑ ΜΕ ΔΙΑΣΤΑΥΡΩΣΗ (τουλάχιστον δύο ανεξάρτητα μέσα, ένα καθιερωμένο):
[S1] Ουκρανία και Ρωσία σε ειρηνευτικές συνομιλίες στο Αμπού Ντάμπι — 11/11/2026 — Euronews.com, Kathimerini, Skai.gr
Euronews.com: https://news.google.com/rss/articles/x
ΙΣΧΥΡΙΣΜΟΙ, ΔΗΛΩΣΕΙΣ ΚΑΙ ΑΠΟΔΙΔΟΜΕΝΕΣ ΑΝΑΦΟΡΕΣ (ανήκουν σε όσους τους διατυπώνουν):
[S2] Ζελένσκι: Οι ΗΠΑ πρότειναν ανταλλαγή — 14/11/2026 — Naftemporiki
Naftemporiki: https://news.google.com/rss/articles/y

Σημείωση: διαβάστηκαν μόνο τίτλοι, ημερομηνίες και μέσα από δημόσιες ροές ειδήσεων, όχι τα ίδια τα άρθρα.`;

// What the Greek voice must never be handed: it refuses a sentence it cannot phonemize.
const NOT_SPEAKABLE=/https?:|\[S\d+\]|\[.*Agent\]|°C|km\/h|\d+%|\d{2}\/\d{2}\/\d{4}|Europe\/|\bmm\b|[·•]/;

test('weather answer is spoken as Greek words, without addresses, marks or raw units',()=>{
 const spoken=speakable(WEATHER);
 assert.doesNotMatch(spoken,NOT_SPEAKABLE);
 assert.match(spoken,/^Καιρός, Αθήνα, Αττική, Ελλάδα\. Τώρα \(Σάββατο 14 Νοεμβρίου 2026 20:00\): 20,3 βαθμούς Κελσίου \(αίσθηση 22,4 βαθμούς Κελσίου\), Κυρίως αίθριος, άνεμος 2,3 χιλιόμετρα την ώρα από βορειοανατολικά, ριπές 4,3 χιλιόμετρα την ώρα, βροχόπτωση 0 χιλιοστά, υγρασία 80 τοις εκατό\./);
 assert.match(spoken,/Πρόγνωση: Σάββατο 14 Νοεμβρίου 2026: Κυρίως αίθριος, 18,5 έως 23,8 βαθμούς Κελσίου, πιθανότητα βροχής 0 τοις εκατό/);
 assert.match(spoken,/Κυριακή 15 Νοεμβρίου 2026: Νεφελώδης/);
 assert.doesNotMatch(spoken,/Open-Meteo|ΕΜΥ|Προειδοποιήσεις: ο πάροχος/,'the source line and the long notice stay on screen');
 assert.match(spoken,/ γραμμένη στη συνομιλία\.$/);
});

test('news answer is spoken by section with the outlets named, and no addresses',()=>{
 const spoken=speakable(NEWS);
 assert.doesNotMatch(spoken,NOT_SPEAKABLE);
 assert.equal(spoken,'Ειδήσεις, Γεωπολιτική και διεθνείς σχέσεις, Ελλάδα και διεθνή. Γεγονότα που διασταυρώθηκαν από περισσότερα μέσα. Ουκρανία και Ρωσία σε ειρηνευτικές συνομιλίες στο Αμπού Ντάμπι, σύμφωνα με Euronews.com, Kathimerini, Skai.gr. Ισχυρισμοί και δηλώσεις. Ζελένσκι: Οι ΗΠΑ πρότειναν ανταλλαγή, σύμφωνα με Naftemporiki. Οι πηγές είναι γραμμένες στη συνομιλία.');
});

test('long answers are cut at about half a minute and say where the rest is',()=>{
 const many=Array.from({length:40},(_,i)=>`[S${i+1}] Δοκιμαστικός τίτλος αριθμός ${i+1} για έλεγχο ορίου — 14/11/2026 — Reuters, Kathimerini`).join('\n');
 const spoken=speakable('[News & Geopolitics Agent]\nΕιδήσεις — Κύριες ειδήσεις\n\nΑΝΑΦΟΡΕΣ ΧΩΡΙΣ ΔΙΑΣΤΑΥΡΩΣΗ (x):\n'+many+'\nReuters: https://news.google.com/rss/articles/x');
 assert.ok(spoken.length<MAX_SPOKEN_CHARACTERS+90,String(spoken.length));
 assert.match(spoken,/Η πλήρης απάντηση με τις πηγές είναι γραμμένη στη συνομιλία\.$/);
 assert.doesNotMatch(spoken,/αριθμός 40/);
});

test('every unit, date and wind direction is converted; other text is unchanged',()=>{
 assert.equal(spokenGreek('Σάβ 14/11/2026: 18,4°C · 12,2 km/h από ΝΔ · 4,2 mm · 61%'),'Σάββατο 14 Νοεμβρίου 2026: 18,4 βαθμούς Κελσίου, 12,2 χιλιόμετρα την ώρα από νοτιοδυτικά, 4,2 χιλιοστά, 61 τοις εκατό');
 for(const [abbreviation,word] of Object.entries({Β:'βόρεια',ΒΑ:'βορειοανατολικά',Α:'ανατολικά',ΝΑ:'νοτιοανατολικά',Ν:'νότια',ΝΔ:'νοτιοδυτικά',Δ:'δυτικά',ΒΔ:'βορειοδυτικά'}))
  assert.equal(spokenGreek('άνεμος από '+abbreviation),'άνεμος από '+word);
 assert.equal(spokenGreek('Μια απλή πρόταση χωρίς αριθμούς'),'Μια απλή πρόταση χωρίς αριθμούς');
 assert.equal(spokenGreek('Η ΕΜΥ εκδίδει δελτία'),'Η ΕΜΥ εκδίδει δελτία','capital words that are not wind directions are kept');
});

test('a provider failure is spoken without its error code and without mentioning sources',()=>{
 const failure='[Weather Agent]\nΤο Open-Meteo δεν απάντησε αυτή τη στιγμή (WEATHER_HTTP_429). Δεν έχω πραγματικές μετρήσεις για «αθήνα» και δεν θα επινοήσω. Δοκίμασε ξανά σε λίγο.';
 assert.equal(speakable(failure),'Το Open-Meteo δεν απάντησε αυτή τη στιγμή. Δεν έχω πραγματικές μετρήσεις για «αθήνα» και δεν θα επινοήσω. Δοκίμασε ξανά σε λίγο.');
 const noNews='[News & Geopolitics Agent]\nΚαμία πηγή ειδήσεων δεν απάντησε αυτή τη στιγμή. Δεν έχω πραγματικά δεδομένα και δεν θα επινοήσω ειδήσεις.';
 assert.doesNotMatch(speakable(noNews),/πηγές είναι γραμμένες/);
});

test('answers that are not from an agent are spoken exactly as written',()=>{
 for(const text of ['Γεια σου.','Η θερμοκρασία είναι 18°C σήμερα.','[Weather Agent] χωρίς αλλαγή γραμμής'])assert.equal(speakable(text),text);
});
