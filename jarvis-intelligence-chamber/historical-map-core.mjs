/** Evidence-safe map data helpers. No coordinates are inferred from names. */
export const SCHEMA = "nabou-historical-map-features-v1";
const ALLOWED = new Set(["Point", "Polygon", "MultiPolygon"]);
function validCoord(point) {
  return Array.isArray(point) && point.length >= 2 &&
    point.slice(0,2).every(x=>typeof x==="number" && Number.isFinite(x)) &&
    point[0]>=-180 && point[0]<=180 && point[1]>=-90 && point[1]<=90;
}
export function positions(geometry) {
  if (!geometry || !ALLOWED.has(geometry.type)) throw Error("Unsupported geographic geometry");
  const c=geometry.coordinates;
  let pts;
  if (geometry.type==="Point") pts=[c];
  else if (geometry.type==="Polygon") pts=(c||[]).flat();
  else pts=(c||[]).flat(2);
  if(!Array.isArray(pts)||!pts.length||!pts.every(validCoord)) throw Error("Invalid WGS84 longitude/latitude");
  return pts;
}
export function validateEvidenceCollection(data) {
  if(!data || data.type!=="FeatureCollection" || data.schema!==SCHEMA) throw Error("Expected NABOU normalized historical-map GeoJSON");
  if(!data.metadata || data.metadata.crs!=="EPSG:4326" || !data.metadata.source_id || !data.metadata.rights) throw Error("Missing map provenance / EPSG:4326 / rights");
  if(!Array.isArray(data.features) || data.features.length>20000) throw Error("Unsupported feature count");
  for(const f of data.features) {
    if(!f || f.type!=="Feature" || !f.id || !f.properties || typeof f.properties.label!=="string" ||
       f.properties.label.length>300 || !f.properties.source_id ||
       f.properties.geometry_role!=="MAP_TEXT_FOOTPRINT_NOT_ATTESTED_PLACE_GEOMETRY" ||
       f.properties.historical_claim_verified!==false) throw Error("Unverified map label contract invalid");
    positions(f.geometry);
  }
  return data;
}
export function validateCandidates(data) {
  if(!data || data.schema!=="nabou-historical-map-candidates-v1" ||
     !Array.isArray(data.candidates) || data.candidates.length>50000 ||
     data.historically_verified!==0 || data.operator_approved!==0) throw Error("Invalid unverified WHG candidate set");
  for(const c of data.candidates) {
    if(!c.map_feature_id || !c.candidate_place_id || c.candidate_status!=="SUGGESTED" || c.historically_verified!==false) throw Error("Candidate must be an unapproved suggestion");
    if(c.repr_point != null && !validCoord(c.repr_point)) throw Error("Invalid candidate coordinates");
  }
  return data;
}
export function anchor(geometry) {
  // Label footprint anchor only. This MUST NOT be interpreted as a settlement position.
  const ps=positions(geometry);
  return [ps.reduce((s,p)=>s+p[0],0)/ps.length,ps.reduce((s,p)=>s+p[1],0)/ps.length];
}
export function visibleFeatures(collection,year,{includeUndated=true,filter=""}={}) {
  const term=String(filter).trim().toLocaleLowerCase();
  return collection.features.filter(f=>{
    const p=f.properties,from=p.start_year,to=p.end_year;
    const timed=from!=null||to!=null;
    if(!timed && !includeUndated) return false;
    if(from!=null && year<from || to!=null && year>to) return false;
    return !term || [p.label,p.raw_ocr_label,p.map_title].some(x=>String(x||"").toLocaleLowerCase().includes(term));
  });
}
