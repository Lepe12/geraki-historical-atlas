#!/usr/bin/env python3
"""Controlled VERIFIED -> human publication approval -> Airtable Atlas bridge.

This tool never publishes DISCOVERY/REVIEW material. It requires:
1. a candidate explicitly marked verified by the final verification gate;
2. a matching final verification record with decision VERIFY and verified=true;
3. a separate APPROVE_FOR_PUBLICATION record hash-bound to that verification;
4. explicit Atlas field mapping supplied by the approver.

No geocoding or coordinate inference occurs here.
"""
from __future__ import annotations
import argparse, datetime, hashlib, json, os, pathlib, tempfile, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config" / "atlas_publication.json"
ALLOWED_EVENT_TYPES = {"Raid","Capture","Naval Action","Corsair Activity","Piracy","Other"}
ALLOWED_SOURCE_TYPES = {"Primary","Secondary","Map / Chart","Archival","Other"}
ALLOWED_PLACE_TYPES = {"City","Port","Fortress","Village","Island","Bay","Anchorage","Other"}
ALLOWED_COORD_STATUS = {"Unverified","Approximate","Verified"}

def canonical_digest(obj):
    raw=json.dumps(obj,ensure_ascii=False,sort_keys=True,separators=(",",":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()

def read_json(path):
    return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))

def require_text(value,name):
    if not isinstance(value,str) or not value.strip():
        raise ValueError("MISSING_"+name.upper())
    return value.strip()

def iso_timestamp(value,name):
    value=require_text(value,name)
    try:
        dt=datetime.datetime.fromisoformat(value.replace("Z","+00:00"))
    except ValueError as exc:
        raise ValueError("INVALID_"+name.upper()) from exc
    if dt.tzinfo is None:
        raise ValueError("INVALID_"+name.upper())
    return value

def load_context(root,run_id,lane,candidate_id):
    base=pathlib.Path(root)/run_id/lane
    cand_path=base/"structured_output"/"candidate_events.json"
    ver_path=base/"verification"/"final_verifications.json"
    if not cand_path.is_file():
        raise ValueError("CANDIDATE_FILE_NOT_FOUND")
    if not ver_path.is_file():
        raise ValueError("FINAL_VERIFICATIONS_NOT_FOUND")
    cdata=read_json(cand_path); vdata=read_json(ver_path)
    candidate=next((x for x in cdata.get("events",[]) if str(x.get("candidate_id"))==candidate_id),None)
    verification=next((x for x in vdata.get("items",[]) if str(x.get("candidate_id"))==candidate_id),None)
    if candidate is None: raise ValueError("CANDIDATE_NOT_FOUND")
    if verification is None: raise ValueError("FINAL_VERIFICATION_NOT_FOUND")
    if candidate.get("verified") is not True:
        raise ValueError("CANDIDATE_NOT_VERIFIED")
    if verification.get("verified") is not True or verification.get("decision")!="VERIFY":
        raise ValueError("FINAL_VERIFICATION_GATE_NOT_PASSED")
    if str(verification.get("lane") or lane)!=lane:
        raise ValueError("LANE_MISMATCH")
    return candidate,verification

def validate_atlas_mapping(approval):
    event=approval.get("atlas_event")
    sources=approval.get("atlas_sources")
    place=approval.get("atlas_place")
    if not isinstance(event,dict): raise ValueError("ATLAS_EVENT_REQUIRED")
    if not isinstance(sources,list) or not sources: raise ValueError("ATLAS_SOURCES_REQUIRED")

    event_type=require_text(event.get("event_type"),"event_type")
    if event_type not in ALLOWED_EVENT_TYPES: raise ValueError("INVALID_EVENT_TYPE")
    for k in ("event","date_range","location_text","summary"):
        require_text(event.get(k),k)

    clean_sources=[]
    for idx,src in enumerate(sources):
        if not isinstance(src,dict): raise ValueError("INVALID_SOURCE_"+str(idx))
        st=require_text(src.get("source_type"),"source_type")
        if st not in ALLOWED_SOURCE_TYPES: raise ValueError("INVALID_SOURCE_TYPE")
        clean_sources.append({
            "Source Title": require_text(src.get("source_title"),"source_title"),
            "Author / Creator": str(src.get("author_creator") or "").strip(),
            "Year": str(src.get("year") or "").strip(),
            "Source Type": st,
            "Citation": require_text(src.get("citation"),"citation"),
            "URL / Archive Ref": require_text(src.get("url_archive_ref"),"url_archive_ref"),
            "Evidence Notes": require_text(src.get("evidence_notes"),"evidence_notes"),
            "Verification Status": "Checked",
        })

    clean_place=None
    if place is not None:
        if not isinstance(place,dict): raise ValueError("INVALID_ATLAS_PLACE")
        pt=require_text(place.get("place_type"),"place_type")
        if pt not in ALLOWED_PLACE_TYPES: raise ValueError("INVALID_PLACE_TYPE")
        lat=place.get("latitude"); lon=place.get("longitude")
        if (lat is None) != (lon is None): raise ValueError("COORDINATES_REQUIRE_LAT_AND_LON")
        cs=place.get("coordinate_status")
        if lat is not None:
            if not isinstance(lat,(int,float)) or not isinstance(lon,(int,float)):
                raise ValueError("COORDINATES_MUST_BE_NUMERIC")
            if not (-90<=float(lat)<=90 and -180<=float(lon)<=180):
                raise ValueError("COORDINATES_OUT_OF_RANGE")
            if cs not in {"Approximate","Verified"}:
                raise ValueError("EXPLICIT_COORDINATE_STATUS_REQUIRED")
        elif cs not in (None,"","Unverified"):
            raise ValueError("COORDINATE_STATUS_WITHOUT_COORDINATES")
        clean_place={
            "Place Name": require_text(place.get("place_name"),"place_name"),
            "Modern Name": str(place.get("modern_name") or "").strip(),
            "Historical Name": str(place.get("historical_name") or "").strip(),
            "Place Type": pt,
            "Research Notes": require_text(place.get("research_notes"),"research_notes"),
            "Research Status": "Verified",
        }
        if lat is not None:
            clean_place["Latitude"]=float(lat)
            clean_place["Longitude"]=float(lon)
            clean_place["Coordinate Status"]=cs
        else:
            clean_place["Coordinate Status"]="Unverified"
    clean_event={
        "Event":require_text(event.get("event"),"event"),
        "Date / Range":require_text(event.get("date_range"),"date_range"),
        "Actors":str(event.get("actors") or "").strip(),
        "Location Text":require_text(event.get("location_text"),"location_text"),
        "Event Type":event_type,
        "Summary":require_text(event.get("summary"),"summary"),
        "Verification Status":"Verified",
        "Uncertainty / Conflicts":str(event.get("uncertainty_conflicts") or "").strip(),
    }
    return clean_event,clean_sources,clean_place

def build_bundle(root,approval_path):
    approval=read_json(approval_path)
    if approval.get("schema")!="pct-atlas-publication-approval-v1":
        raise ValueError("INVALID_APPROVAL_SCHEMA")
    if approval.get("decision")!="APPROVE_FOR_PUBLICATION":
        raise ValueError("PUBLICATION_NOT_APPROVED")
    approver=require_text(approval.get("approver"),"approver")
    approved_utc=iso_timestamp(approval.get("approved_utc"),"approved_utc")
    run_id=require_text(str(approval.get("run_id") or ""),"run_id")
    lane=require_text(approval.get("lane"),"lane")
    candidate_id=require_text(approval.get("candidate_id"),"candidate_id")
    candidate,verification=load_context(root,run_id,lane,candidate_id)
    expected=canonical_digest(verification)
    if approval.get("verification_sha256")!=expected:
        raise ValueError("VERIFICATION_BINDING_MISMATCH")
    event,sources,place=validate_atlas_mapping(approval)
    pub_key=hashlib.sha256((run_id+"|"+lane+"|"+candidate_id+"|"+expected).encode()).hexdigest()
    provenance=f"publication_key={pub_key}; run={run_id}; lane={lane}; candidate={candidate_id}; verifier={verification.get('verifier')}; approver={approver}; approved_utc={approved_utc}"
    event["Evidence Count"]=len(sources)
    if event["Uncertainty / Conflicts"]:
        event["Uncertainty / Conflicts"] += "\n"+provenance
    else:
        event["Uncertainty / Conflicts"]=provenance
    for i,src in enumerate(sources):
        src["Evidence Notes"]=(src["Evidence Notes"]+"\n"+provenance+"; source_index="+str(i)).strip()
        src["Publication Key"]=pub_key+":source:"+str(i)
        src["Research Run ID"]=run_id
        src["Publication Approved UTC"]=approved_utc
    if place is not None:
        place["Research Notes"]=(place["Research Notes"]+"\n"+provenance).strip()
        place["Publication Key"]=pub_key+":place"
        place["Research Run ID"]=run_id
        place["Publication Approved UTC"]=approved_utc
    event["Publication Key"]=pub_key+":event"
    event["Research Run ID"]=run_id
    event["Publication Approved UTC"]=approved_utc
    return {
      "schema":"pct-atlas-publication-bundle-v1",
      "publication_key":pub_key,
      "run_id":run_id,
      "lane":lane,
      "candidate_id":candidate_id,
      "verification_sha256":expected,
      "verification":{
        "verifier":verification.get("verifier"),
        "verified_utc":verification.get("verified_utc"),
        "claim_text":verification.get("claim_text"),
        "claim_scope":verification.get("claim_scope"),
      },
      "approval":{"approver":approver,"approved_utc":approved_utc,"decision":"APPROVE_FOR_PUBLICATION"},
      "event":event,
      "sources":sources,
      "place":place,
      "policy":{"raw_discovery_published":False,"automatic_geocoding":False,"coordinate_replacement":False}
    }

class Airtable:
    def __init__(self,token,config):
        self.token=token
        self.base=config["airtable"]["base_id"]
        self.tables=config["airtable"]["tables"]
        self.headers={"Authorization":"Bearer "+token,"Content-Type":"application/json"}
    def req(self,method,url,payload=None):
        data=json.dumps(payload,ensure_ascii=False).encode("utf-8") if payload is not None else None
        req=urllib.request.Request(url,data=data,method=method,headers=self.headers)
        with urllib.request.urlopen(req,timeout=60) as r:
            return json.load(r)
    def find_by_key(self,table,key):
        formula="{Publication Key}='"+key.replace("'","\\'")+"'"
        q=urllib.parse.urlencode({"maxRecords":"1","filterByFormula":formula})
        url=f"https://api.airtable.com/v0/{self.base}/{table}?{q}"
        rows=self.req("GET",url).get("records",[])
        return rows[0] if rows else None
    def upsert(self,table,fields):
        key=fields["Publication Key"]
        existing=self.find_by_key(table,key)
        if existing:
            url=f"https://api.airtable.com/v0/{self.base}/{table}/{existing['id']}"
            out=self.req("PATCH",url,{"fields":fields,"typecast":True})
            return out["id"],"UPDATED"
        url=f"https://api.airtable.com/v0/{self.base}/{table}"
        out=self.req("POST",url,{"records":[{"fields":fields}],"typecast":True})
        return out["records"][0]["id"],"CREATED"

def publish(bundle,token,config):
    if bundle.get("schema")!="pct-atlas-publication-bundle-v1":
        raise ValueError("INVALID_BUNDLE_SCHEMA")
    if bundle.get("approval",{}).get("decision")!="APPROVE_FOR_PUBLICATION":
        raise ValueError("PUBLICATION_NOT_APPROVED")
    if bundle.get("policy",{}).get("raw_discovery_published") is not False:
        raise ValueError("DISCOVERY_PUBLICATION_FORBIDDEN")
    api=Airtable(token,config)
    source_ids=[]; actions=[]
    for src in bundle["sources"]:
        rid,act=api.upsert(api.tables["sources"],src)
        source_ids.append(rid); actions.append({"table":"SOURCES","record_id":rid,"action":act})
    place_ids=[]
    if bundle.get("place") is not None:
        rid,act=api.upsert(api.tables["places"],bundle["place"])
        place_ids.append(rid); actions.append({"table":"PLACES","record_id":rid,"action":act})
    event=dict(bundle["event"])
    event["Sources"]=source_ids
    if place_ids:event["Linked Places"]=place_ids
    rid,act=api.upsert(api.tables["events"],event)
    actions.append({"table":"EVENTS","record_id":rid,"action":act})
    return {"schema":"pct-atlas-publication-result-v1","publication_key":bundle["publication_key"],"status":"PUBLISHED","actions":actions}

def self_test():
    with tempfile.TemporaryDirectory() as td:
        root=pathlib.Path(td)/"evidence"/"runs"
        base=root/"123"/"testlane"
        (base/"structured_output").mkdir(parents=True)
        (base/"verification").mkdir(parents=True)
        candidate={"candidate_id":"C1","lane":"testlane","verified":True}
        verification={"candidate_id":"C1","lane":"testlane","decision":"VERIFY","verified":True,"verifier":"Reviewer V","verified_utc":"2026-10-14T09:00:00+00:00","claim_text":"Claim","claim_scope":"Narrow"}
        (base/"structured_output"/"candidate_events.json").write_text(json.dumps({"events":[candidate]}),encoding="utf-8")
        (base/"verification"/"final_verifications.json").write_text(json.dumps({"items":[verification]}),encoding="utf-8")
        approval={
          "schema":"pct-atlas-publication-approval-v1","decision":"APPROVE_FOR_PUBLICATION","approver":"Publisher A",
          "approved_utc":"2026-10-14T09:10:00+00:00","run_id":"123","lane":"testlane","candidate_id":"C1",
          "verification_sha256":canonical_digest(verification),
          "atlas_event":{"event":"Test event","date_range":"1671","actors":"Actor","location_text":"Test place","event_type":"Piracy","summary":"Verified summary","uncertainty_conflicts":"None recorded"},
          "atlas_sources":[{"source_title":"Primary source","author_creator":"Author","year":"1671","source_type":"Primary","citation":"Archive X, fol. 1r","url_archive_ref":"https://example.invalid/source","evidence_notes":"Original inspected."}],
          "atlas_place":{"place_name":"Test place","modern_name":"","historical_name":"Test place","place_type":"Port","research_notes":"Explicitly approved mapping.","coordinate_status":"Unverified"}
        }
        ap=pathlib.Path(td)/"approval.json";ap.write_text(json.dumps(approval),encoding="utf-8")
        bundle=build_bundle(root,ap)
        assert bundle["event"]["Verification Status"]=="Verified"
        assert bundle["sources"][0]["Verification Status"]=="Checked"
        assert bundle["place"]["Coordinate Status"]=="Unverified"
        assert bundle["policy"]["raw_discovery_published"] is False
        bad=json.loads(json.dumps(approval));bad["atlas_place"]["latitude"]=37.0
        bp=pathlib.Path(td)/"bad.json";bp.write_text(json.dumps(bad),encoding="utf-8")
        try:
            build_bundle(root,bp)
            raise AssertionError("one-sided coordinates were accepted")
        except ValueError as e:
            assert str(e)=="COORDINATES_REQUIRE_LAT_AND_LON"
        print("ATLAS_PUBLICATION_BRIDGE_SELF_TEST_PASS",bundle["publication_key"])

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--mode",choices=["prepare","publish","self-test"],required=True)
    ap.add_argument("--root",default=str(ROOT/"evidence"/"runs"))
    ap.add_argument("--approval")
    ap.add_argument("--bundle")
    ap.add_argument("--output")
    args=ap.parse_args()
    if args.mode=="self-test":
        return self_test()
    config=read_json(CONFIG_PATH)
    if args.mode=="prepare":
        if not args.approval: raise SystemExit("--approval required")
        bundle=build_bundle(args.root,args.approval)
        out=pathlib.Path(args.output or (ROOT/"publication"/"approved"/(bundle["publication_key"]+".json")))
        out.parent.mkdir(parents=True,exist_ok=True)
        out.write_text(json.dumps(bundle,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        print(json.dumps({"status":"APPROVED_BUNDLE_READY","path":str(out),"publication_key":bundle["publication_key"]},ensure_ascii=False))
        return
    if not args.bundle: raise SystemExit("--bundle required")
    token=os.environ.get("AIRTABLE_TOKEN","").strip()
    if not token: raise SystemExit("Missing AIRTABLE_TOKEN")
    bundle=read_json(args.bundle)
    result=publish(bundle,token,config)
    out=pathlib.Path(args.output or (ROOT/"publication"/"audit"/(bundle["publication_key"]+".json")))
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(result,ensure_ascii=False))

if __name__=="__main__":
    main()
