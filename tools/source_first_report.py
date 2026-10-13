#!/usr/bin/env python3
"""Produce an evidence-first fallback report without model synthesis."""
from __future__ import annotations
import argparse, json
from pathlib import Path

def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--matrix",required=True)
    ap.add_argument("--output",required=True)
    a=ap.parse_args()
    data=read(a.matrix)
    lines=[
        "# Source-first research report",
        "",
        "This report preserves evidence without model-assisted historical synthesis.",
        ""
    ]
    for claim in data.get("claims",[]):
        lines += [
            "## " + str(claim.get("claim_id")),
            "Status: **" + str(claim.get("machine_recommendation","UNRESOLVED")) + "**",
            "",
            "### Preserved claim/evidence text",
            str(claim.get("claim_text") or "_No controlled claim text recorded._"),
            "",
            "### Supporting evidence"
        ]
        if claim.get("supporting_evidence"):
            for e in claim["supporting_evidence"]:
                lines.append("- %s | source `%s` | locator `%s` | original inspected: `%s`" % (
                    e.get("evidence_kind"), e.get("source_key"), e.get("locator_status"), e.get("original_inspected")
                ))
        else:
            lines.append("- None recorded.")
        lines += ["", "### Contradicting evidence"]
        if claim.get("contradicting_evidence"):
            for e in claim["contradicting_evidence"]:
                lines.append("- " + str(e))
        else:
            lines.append("- None recorded; contradiction search may still be pending.")
        lines += ["", "### Uncertainties"]
        unknowns=claim.get("uncertainties",[]) or ["NONE_RECORDED"]
        for u in unknowns:
            lines.append("- " + str(u))
        lines += ["", "### What could falsify this claim"]
        for f in claim.get("falsification_targets",[]):
            lines.append("- " + str(f))
        lines.append("")
    Path(a.output).parent.mkdir(parents=True,exist_ok=True)
    Path(a.output).write_text("\n".join(lines)+"\n",encoding="utf-8")
    print("SOURCE FIRST REPORT",a.output)

if __name__=="__main__":
    main()
