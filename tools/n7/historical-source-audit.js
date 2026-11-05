'use strict';
// N7_HISTORICAL_SOURCE_AUDIT_V1
// Works on actually downloaded source text. Never treats a bibliography reference
// as an article we have read. Flags date contradictions for human verification.
function toText(x){return String(x||'').replace(/\s+/g,' ').trim();}
function extractBibliography(article){
 const text=String(article||'');
 const match=/(?:^|\n|\s)(?:Πηγές|Βιβλιογραφία|References|Bibliography)\s*:/iu.exec(text);
 if(!match)return [];
 const tail=text.slice(match.index+match[0].length,match.index+match[0].length+7500);
 const chunks=tail.split(/\n\s*(?:[•*\-–]\s*|\d+[.)]\s*)|\n(?=[Α-ΩΆΈΉΊΌΎΏ][^\n]{15,})/u)
   .map(x=>toText(x)).filter(Boolean);
 return chunks.slice(0,12).map(x=>x.slice(0,500));
}
function chronologicalWarnings(article,independentReignChecked){
 const text=String(article||'');
 const warnings=[];
 // One check is deliberately conditional on a second independently retrieved source.
 const has1608=/\b1608\b/u.test(text);
 const hasMurad=/(?:Μουράτ\s*Γ|Μουράδ\s*Γ|Murad\s*III)/iu.test(text);
 if(has1608&&hasMurad){
  warnings.push({
    description:independentReignChecked
      ? 'ΙΣΤΟΡΙΚΗ ΑΝΤΙΦΑΣΗ: Το κείμενο συνδέει το 1608 με τον Μουράτ Γ΄. Ανεξάρτητη εγκυκλοπαιδική πηγή χρονολογεί τη βασιλεία του το 1574–1595. Το 1608 βασίλευε ο Αχμέτ Α΄ (1603–1617). Να διερευνηθεί το αρχικό τεκμήριο· μην αλλάζεις αυθαίρετα τον ισχυρισμό.'
      : 'ΠΡΟΣ ΔΙΑΣΤΑΥΡΩΣΗ: Το κείμενο συνδέει το 1608 με τον Μουράτ Γ΄. Πρέπει να ελεγχθεί η χρονολόγηση και το όνομα σε ανεξάρτητη πηγή πριν από συμπέρασμα.',
    verifiedByIndependentRetrievedSource:!!independentReignChecked
  });
 }
 return warnings;
}
function attachHistoricalAudit(result,{independentReignChecked=false}={}){
 if(!result?.searched||result.kind!=='historical'||!Array.isArray(result.items))return result;
 const article=result.items.find(x=>x.articleRead && /(?:^|\.)piratecartography\.com$/iu.test(new URL(x.url).hostname));
 if(!article)return result;
 const bibliography=extractBibliography(article.articleText);
 const warnings=chronologicalWarnings(article.articleText,independentReignChecked);
 result.historicalAudit={
   subject:'Πέτρος Λάντζας',
   articleUrl:article.url,
   readCharacters:article.articleText.length,
   bibliography,
   warnings,
   independentReignChecked:!!independentReignChecked,
   fullArticleGuaranteed:false // network excerpts are bounded; never claim full-file access
 };
 return result;
}
function historicalAuditContext(research){
 const a=research?.historicalAudit;
 if(!a)return '';
 const lines=[
  'N7 HISTORICAL SOURCE AUDIT: actual publisher article text extracted ('+a.readCharacters+' characters).',
  'No unsupported claims that PDF scans or academic monographs have been read.',
  'Bibliography entries found INSIDE the article; these are references to locate, NOT independently consulted publications:',
  ...(a.bibliography.length?a.bibliography.map((x,i)=>'B'+(i+1)+' [MENTIONED, NOT READ]: '+x):['No machine-readable bibliography detected.']),
  'Chronological crosschecks (retain source wording; flag contradiction):',
  ...(a.warnings.length?a.warnings.map((x,i)=>'C'+(i+1)+': '+x.description):['No automated contradiction detected. This does not mean the text is error-free.']),
  'For each fact say whether from directly retrieved article, independent source, or only bibliography. Never cite an unread study as having been verified.',
  'Birth year 1530 versus c.1533 is an unresolved discrepancy unless independent evidence resolves it.',
  'When text is truncated or source inaccessible, explicitly disclose that limitation.'
 ];
 return '\n\n'+lines.join('\n');
}
module.exports={extractBibliography,chronologicalWarnings,attachHistoricalAudit,historicalAuditContext};
