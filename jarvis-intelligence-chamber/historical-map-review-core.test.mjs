import test from "node:test";
import assert from "node:assert/strict";
import {validateOcr,newReview,applyReading,addGcp,csvForQgisGcps,reviewStats} from "./historical-map-review-core.mjs";
const sha="a".repeat(64);
const fixture=()=>({
  schema:"nabou-unlocated-historical-map-ocr-v1",
  source:{id:"synthetic",image_sha256:sha,title:"TEST ONLY"},
  georeferencing_status:"NOT_GEOREFERENCED",historically_verified:0,
  labels:[{id:"raw_label_00001",text_raw:"MIIO",pixel_bbox:[12,22,27,8],
    ocr_confidence:.55,geolocation:null,historically_verified:false}]
});
test("reject mismatched source image hash and fake historical verification",()=>{
  assert.throws(()=>newReview(fixture(),"b".repeat(64)),/SHA-256/);
  let d=fixture();d.labels[0].historically_verified=true;
  assert.throws(()=>validateOcr(d),/μη έγκυρη/i);
});
test("human correction only certifies a reading, not a geographic identity",()=>{
  let review=newReview(fixture(),sha);
  assert.equal(review.historically_verified,0);
  assert.throws(()=>applyReading(review,"raw_label_00001",{decision:"READING_ACCEPTED",reading:"Milo",reviewer:""}),/ελεγκτή/);
  const r=applyReading(review,"raw_label_00001",{decision:"READING_ACCEPTED",reading:"Milo",reviewer:"Human Historian"});
  assert.equal(r.final_reading,"Milo");
  assert.equal(r.decision,"READING_ACCEPTED");
  assert.equal(r.geolocation,null);
  assert.equal(review.map_georeferenced,false);
  assert.equal(reviewStats(review).readings_accepted,1);
});
test("GCP requires independent citation and remains proposed",()=>{
  const review=newReview(fixture(),sha);
  assert.throws(()=>addGcp(review,{pixel_x:50,pixel_y:30,longitude:26,latitude:38,
    placename:"island",reference_url:"",reviewer:"human"}),/πηγής/);
  const x=addGcp(review,{pixel_x:50,pixel_y:30,longitude:26,latitude:38,
    placename:"island",reference_url:"https://example.org/authority",reviewer:"human"});
  assert.equal(x.state,"GCP_PROPOSED_NOT_VERIFIED");
  assert.equal(review.historically_verified,0);
  assert.equal(review.map_georeferenced,false);
  assert.match(csvForQgisGcps(review),/longitude_epsg4326/);
  assert.match(csvForQgisGcps(review),/https:\/\/example.org\/authority/);
  assert.throws(()=>addGcp(review,{pixel_x:-10,pixel_y:50,longitude:26,latitude:38,
    placename:"island",reference_url:"https://example.org",reviewer:"human"}),/συντεταγμένες/);
});
test("duplicate IDs disallowed and OCR must be nonlocated",()=>{
  const doc=fixture();doc.labels.push({...doc.labels[0]});
  assert.throws(()=>validateOcr(doc),/επιγραφή/);
  const another=fixture();another.labels[0].geolocation=[24,36];
  assert.throws(()=>validateOcr(another),/επιγραφή/);
});
