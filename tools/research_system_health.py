#!/usr/bin/env python3
"""Aggregate durable health reports for the ten-lane PCT research system."""
import argparse,json,pathlib,datetime
p=argparse.ArgumentParser();p.add_argument("--run-id",required=True);a=p.parse_args()
lanes=["travellers","spanish_simancas","venetian","french","british","dutch","german","italian_states","ottoman","north_african"]
root=pathlib.Path("evidence/runs")/a.run_id
rows=[];missing=[];fingerprints=[];fingerprint_missing=[]
for lane in lanes:
    f=root/lane/"system_health"/"lane_health.json"
    if not f.exists():missing.append(lane);continue
    try:rows.append(json.loads(f.read_text(encoding="utf-8")))
    except Exception:missing.append(lane)
operational=[r["lane"] for r in rows if str(r.get("status","")).startswith("OPERATIONAL")]
blocked_only=[r["lane"] for r in rows if r.get("status")=="NO_EXECUTED_REPOSITORY"]\njobs={x.get("research_job_id") for x in fingerprints if x.get("research_job_id")}; hashes={x.get("request_sha256") for x in fingerprints if x.get("request_sha256")}; files={x.get("request_file") for x in fingerprints if x.get("request_file")}\nfingerprint_ok=len(fingerprints)==10 and not fingerprint_missing and len(jobs)==1 and len(hashes)==1 and len(files)==1
report={
 "schema":"pct-system-health-v1","run_id":a.run_id,
 "generated_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
 "expected_lanes":lanes,"lane_reports":rows,"missing_lane_reports":missing,
 "operational_lanes":operational,"no_executed_repository_lanes":blocked_only,
 "all_ten_pipeline_reports_present":len(rows)==10 and not missing,
 "all_ten_operational":len(operational)==10 and not missing,\n "request_fingerprint_ok":fingerprint_ok,"request_fingerprints":fingerprints,"request_fingerprint_missing":fingerprint_missing,
 "verification_gate":"System health validates execution paths only; it does not verify historical claims."
}
root.mkdir(parents=True,exist_ok=True)
(root/"SYSTEM_HEALTH.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print("SYSTEM HEALTH",a.run_id,"reports",len(rows),"operational",len(operational),"missing",",".join(missing) or "-")
