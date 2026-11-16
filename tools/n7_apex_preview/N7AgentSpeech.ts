// N7_SPECIALIST_AGENTS_V1: the spoken version of an answer from the News & Geopolitics or Weather agent.
// The text on screen is never changed. For speech, figures, units and dates are said as Greek words,
// addresses and citation marks are left out, and the answer is cut at about half a minute of speech.
// Pure functions with no dependencies, so they are tested on their own (test_agent_speech.mjs).
const MONTHS=["Ιανουαρίου","Φεβρουαρίου","Μαρτίου","Απριλίου","Μαΐου","Ιουνίου","Ιουλίου","Αυγούστου","Σεπτεμβρίου","Οκτωβρίου","Νοεμβρίου","Δεκεμβρίου"];
const DAYS:Record<string,string>={"Δευ":"Δευτέρα","Τρί":"Τρίτη","Τετ":"Τετάρτη","Πέμ":"Πέμπτη","Παρ":"Παρασκευή","Σάβ":"Σάββατο","Κυρ":"Κυριακή"};
const WIND:Record<string,string>={"Β":"βόρεια","ΒΑ":"βορειοανατολικά","Α":"ανατολικά","ΝΑ":"νοτιοανατολικά","Ν":"νότια","ΝΔ":"νοτιοδυτικά","Δ":"δυτικά","ΒΔ":"βορειοδυτικά"};
const SECTION:Record<string,string>={
  "ΓΕΓΟΝΟΤΑ ΜΕ ΔΙΑΣΤΑΥΡΩΣΗ":"Γεγονότα που διασταυρώθηκαν από περισσότερα μέσα.",
  "ΑΝΑΦΟΡΕΣ ΧΩΡΙΣ ΔΙΑΣΤΑΥΡΩΣΗ":"Αναφορές που δεν έχουν διασταυρωθεί.",
  "ΙΣΧΥΡΙΣΜΟΙ, ΔΗΛΩΣΕΙΣ":"Ισχυρισμοί και δηλώσεις.",
  "ΑΝΑΛΥΣΕΙΣ ΚΑΙ ΣΧΟΛΙΑ":"Αναλύσεις και σχόλια, δηλαδή γνώμες."
};
export const MAX_SPOKEN_CHARACTERS=700;
export function spokenGreek(line:string):string{
  return line
    .replace(/^[•·\-]\s*/,"")
    // JavaScript's \b does not see Greek letters, so the boundary is written with a Unicode lookbehind.
    .replace(/(?<![\p{L}])(Δευ|Τρί|Τετ|Πέμ|Παρ|Σάβ|Κυρ)\s+(?=\d)/gu,(_,d:string)=>DAYS[d]+" ")
    .replace(/\b(\d{1,2})\/(\d{2})\/(\d{4})\b/g,(_,d:string,m:string,y:string)=>String(Number(d))+" "+(MONTHS[Number(m)-1]||"")+" "+y)
    .replace(/,?\s*ώρα [A-Za-z]+\/[A-Za-z_]+/g,"")
    .replace(/από (ΒΑ|ΒΔ|ΝΑ|ΝΔ|Β|Α|Ν|Δ)(?![\p{L}])/gu,(_,w:string)=>"από "+WIND[w])
    .replace(/(\d)\s?°C/g,"$1 βαθμούς Κελσίου").replace(/(\d)\s?km\/h/g,"$1 χιλιόμετρα την ώρα")
    .replace(/(\d)\s?mm\b/g,"$1 χιλιοστά").replace(/(\d)\s?%/g,"$1 τοις εκατό")
    // Error codes such as (WEATHER_HTTP_429) are written on screen, never read aloud.
    .replace(/\s*\([A-Z][A-Z0-9_]{5,}\)/g,"")
    .replace(/\s*[·•]\s*/g,", ").replace(/\s—\s/g,", ").replace(/https?:\/\/\S+/g,"").replace(/\[S\d{1,2}\]\s?/g,"").replace(/\s{2,}/g," ").trim();
}
// Text that does not start with an agent label is returned exactly as it is.
export function speakable(text:string):string{
  const agent=text.match(/^\[(Weather|News & Geopolitics) Agent\]\n/);
  if(!agent)return text;
  const lines=text.slice(agent[0].length).split("\n").map(l=>l.trim()).filter(Boolean);
  const out:string[]=[];
  for(const line of lines){
    if(/^(?:[^:\n]{1,90}: )?https:\/\/\S+$/.test(line)||/^(?:Πηγή|Σημείωση):/.test(line)||/^Ενημέρωση:/.test(line))continue;
    const header=Object.keys(SECTION).find(k=>line.startsWith(k));
    if(header){out.push(SECTION[header]);continue;}
    const headline=line.match(/^\[S\d+\]\s+(.+?)\s+—\s+\d{2}\/\d{2}\/\d{4}\s+—\s+(.+)$/);
    out.push(headline?headline[1]+", σύμφωνα με "+headline[2]:line);
  }
  let spoken="",cut=false;
  for(const raw of out){
    const line=spokenGreek(raw);if(!line)continue;
    if(spoken.length+line.length>MAX_SPOKEN_CHARACTERS){cut=true;break;}
    spoken+=(spoken?" ":"")+(/[.;!:]$/.test(line)?line:line+".");
  }
  // The closing note only mentions sources when the answer actually has some.
  const sources=/https:\/\//.test(text);
  if(cut)return spoken+(sources?" Η πλήρης απάντηση με τις πηγές είναι γραμμένη στη συνομιλία.":" Η πλήρης απάντηση είναι γραμμένη στη συνομιλία.");
  return spoken+(sources?" Οι πηγές είναι γραμμένες στη συνομιλία.":"");
}
