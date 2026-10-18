// Search source content, never the request/query or internal ranking metadata.
export function normalizeSearch(value){
 return String(value??'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('el').replace(/ς/g,'σ');
}
const fields=['title','description','subject','context_excerpt','acquired_text_excerpt','source_excerpt','text','snippet','quote','original_quote','claim','statement','source_says','creator','author','repository','discovery_repository','identifier','archival_reference','url','publication_year','printed_page','pdf_page','page_label','detail','note','phase','status'];
function sourceText(record){
 const values=fields.map(key=>record?.[key]).filter(value=>value!=null);
 for(const source of record?.source_occurrences||[])values.push(sourceText(source));
 return values.flat(Infinity).filter(value=>typeof value==='string'||typeof value==='number').join(' ');
}
export function matchesSource(record,query){
 const words=normalizeSearch(query).trim().split(/\s+/).filter(Boolean);
 const text=normalizeSearch(sourceText(record));
 return words.every(word=>text.includes(word));
}
