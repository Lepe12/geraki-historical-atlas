/** Pure validation and source-bound audit helpers for real map OCR review. */
export const SCHEMA="nabou-unlocated-historical-map-ocr-v1";
export const REVIEW_SCHEMA="nabou-manual-map-review-v1";
export function validateOcr(input){
  if(input?.schema!==SCHEMA || input.georeferencing_status!=="NOT_GEOREFERENCED" ||
     input.historically_verified!==0 || !Array.isArray(input.labels) ||
     input.labels.length>5000 || typeof input.source?.image_sha256!=="string" ||
     !/^[a-f0-9]{64}$/i.test(input.source.image_sha256)) throw Error("Μη έγκυρο OCR ή προέλευση");
  const ids=new Set();
  for(const item of input.labels){
    if(!item || typeof item.id!=="string" || ids.has(item.id) ||
       typeof item.text_raw!=="string" || item.text_raw.length>140 ||
       !Array.isArray(item.pixel_bbox) || item.pixel_bbox.length!==4 ||
       item.pixel_bbox.some((x,i)=>!Number.isInteger(x)||(i<2?x<0:x<1)) ||
       item.geolocation!==null || item.historically_verified!==false ||
       typeof item.ocr_confidence!=="number" ||
       item.ocr_confidence<0 || item.ocr_confidence>1) throw Error("Μη έγκυρη ή ανεπαρκώς ελεγχόμενη επιγραφή OCR");
    ids.add(item.id);
  }
  return input;
}
export async function fileHash(file){
  const bytes=await file.arrayBuffer();
  const sha=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(sha)].map(n=>n.toString(16).padStart(2,"0")).join("");
}
export function newReview(ocr,hash){
  validateOcr(ocr);
  if(!hash || ocr.source.image_sha256.toLowerCase()!==hash.toLowerCase())throw Error("Το αρχείο εικόνας δεν ταιριάζει με το OCR SHA-256");
  return {schema:REVIEW_SCHEMA,source:{...ocr.source},image_sha256:hash,
    review_status:"IN_PROGRESS_NOT_VERIFIED",labels:ocr.labels.map(x=>({
      label_id:x.id,ocr_text:x.text_raw,final_reading:null,decision:"UNREVIEWED",
      reviewer:null,reviewed_at:null,pixel_bbox:[...x.pixel_bbox],
      ocr_confidence:x.ocr_confidence,
      historically_verified:false,geolocation:null
    })),gcps:[],historically_verified:0,
    map_georeferenced:false,operator_place_identities_verified:0};
}
export function applyReading(review,labelId,{decision,reading="",reviewer=""}){
  if(!["UNREVIEWED","READING_ACCEPTED","READING_REJECTED"].includes(decision))
    throw Error("Invalid review decision");
  if(decision!=="UNREVIEWED"&&(!reviewer.trim() || reviewer.length>120))
    throw Error("Απαιτείται όνομα ελεγκτή");
  const item=review.labels.find(x=>x.label_id===labelId);
  if(!item)throw Error("OCR item not found");
  const value=reading.trim();
  if(decision==="READING_ACCEPTED" && (!value || value.length>150))
    throw Error("Απαιτείται διορθωμένη ανάγνωση");
  item.decision=decision;item.final_reading=decision==="READING_ACCEPTED"?value:null;
  item.reviewer=decision==="UNREVIEWED"?null:reviewer.trim();
  item.reviewed_at=decision==="UNREVIEWED"?null:new Date().toISOString();
  item.historically_verified=false;
  return item;
}
export function addGcp(review,gcp){
  const {pixel_x,pixel_y,longitude,latitude,placename,reference_url,reviewer}=gcp;
  if(![pixel_x,pixel_y,longitude,latitude].every(x=>typeof x==="number"&&Number.isFinite(x)) ||
     pixel_x<0 || pixel_y<0 || longitude < -180 || longitude > 180 ||
     latitude < -90 || latitude > 90)throw Error("Άκυρες συντεταγμένες σημείου ελέγχου");
  if(!placename?.trim() || !reviewer?.trim())throw Error("Απαιτείται ταυτότητα σημείου και ερευνητή");
  let parsed;
  try{parsed=new URL(reference_url);}catch{throw Error("Απαιτείται αξιόπιστη URL πηγής");}
  if(parsed.protocol!=="https:")throw Error("Η πηγή πρέπει να έχει HTTPS URL");
  const next={id:"gcp_"+String(review.gcps.length+1).padStart(4,"0"),
    pixel_x:Math.round(pixel_x*10)/10,pixel_y:Math.round(pixel_y*10)/10,
    longitude,latitude,placename:placename.trim(),reference_url:parsed.href,
    reviewer:reviewer.trim(),state:"GCP_PROPOSED_NOT_VERIFIED"};
  review.gcps.push(next);review.map_georeferenced=false;
  return next;
}
export function csvForQgisGcps(review){
  // Pixel map-to-earth coordinates in a tool-independent CSV; no GIS verified status.
  const quote=value=>'"'+String(value??"").replaceAll('"','""')+'"';
  return [
    ["map_pixel_x","map_pixel_y","longitude_epsg4326","latitude_epsg4326","place_name","reference_url","status"].map(quote).join(","),
    ...review.gcps.map(x=>[x.pixel_x,x.pixel_y,x.longitude,x.latitude,
      x.placename,x.reference_url,x.state].map(quote).join(","))
  ].join("\r\n")+"\r\n";
}
export function reviewStats(review){
  const approved=review.labels.filter(x=>x.decision==="READING_ACCEPTED").length;
  return {total:review.labels.length,readings_accepted:approved,
    readings_rejected:review.labels.filter(x=>x.decision==="READING_REJECTED").length,
    unreviewed:review.labels.length-approved-review.labels.filter(x=>x.decision==="READING_REJECTED").length,
    candidate_gcps:review.gcps.length,geographic_places_verified:0};
}
