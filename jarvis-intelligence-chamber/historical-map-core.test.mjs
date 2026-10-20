import test from "node:test";
import assert from "node:assert/strict";
import {validateEvidenceCollection,validateCandidates,anchor,visibleFeatures} from "./historical-map-core.mjs";

const fixture = () => ({
  type:"FeatureCollection",schema:"nabou-historical-map-features-v1",
  metadata:{source_id:"synthetic",rights:"synthetic-fixture",crs:"EPSG:4326"},
  features:[{
    type:"Feature",id:"maplabel_test",
    geometry:{type:"Polygon",coordinates:[[[24,37],[24.2,37],[24.2,37.2],[24,37]]]},
    properties:{label:"Milo",raw_ocr_label:"MILO",source_id:"synthetic",
      geometry_role:"MAP_TEXT_FOOTPRINT_NOT_ATTESTED_PLACE_GEOMETRY",
      historical_claim_verified:false,start_year:1650,end_year:1700}
  }]
});
test("accept source-constrained synthetic label with exact geographic footprint",()=>{
  const data=validateEvidenceCollection(fixture());
  assert.equal(data.features.length,1);
  const xy=anchor(data.features[0].geometry);
  assert.ok(xy[0]>24 && xy[0]<24.2);
});
test("year filter is not a historical verification shortcut",()=>{
  const doc=fixture();
  assert.equal(visibleFeatures(doc,1670).length,1);
  assert.equal(visibleFeatures(doc,1750).length,0);
  assert.equal(visibleFeatures(doc,1670,{filter:"TERMIA"}).length,0);
});
test("reject source-less place points",()=>{
  const doc=fixture();delete doc.metadata.rights;
  assert.throws(()=>validateEvidenceCollection(doc),/provenance/);
});
test("reject pixel space even if falsely labelled WGS84",()=>{
  const doc=fixture();
  doc.features[0].geometry.coordinates[0][1][0]=1300;
  assert.throws(()=>validateEvidenceCollection(doc),/longitude/);
});
test("reject fabricated verified map labels",()=>{
  const doc=fixture();doc.features[0].properties.historical_claim_verified=true;
  assert.throws(()=>validateEvidenceCollection(doc),/Unverified/);
});
test("WHG match score 100 is still candidate, not a fact",()=>{
  const normalized=validateCandidates({schema:"nabou-historical-map-candidates-v1",
    historically_verified:0,operator_approved:0,candidates:[{
      map_feature_id:"maplabel_test",candidate_place_id:"place:whg:example",
      candidate_status:"SUGGESTED",historically_verified:false,
      score_relative:100,name_confidence_absolute:100
    }]});
  assert.equal(normalized.candidates[0].historically_verified,false);
});
test("reject attempts to label matching suggestions as verified",()=>{
  assert.throws(()=>validateCandidates({schema:"nabou-historical-map-candidates-v1",
    historically_verified:1,operator_approved:0,candidates:[]}),/Invalid/);
});
