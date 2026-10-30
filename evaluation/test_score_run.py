"""Unit tests for evaluation/score_run.py (offline, no network)."""
import copy
import gzip
import hashlib
import json
import pathlib
import sys
import unittest

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import score_run as s  # noqa: E402

URL = "https://example.org/source.pdf"
EV_TEXT = "a través de Pedro Lantzas, agente griego al servicio de los españoles en este reino"


def claim(cid, statement, quote=EV_TEXT, url=URL, ev="e-1", kind="source_statement", actors=None):
    return {"claim_id": cid, "statement": statement, "quote": quote, "evidence_id": ev, "kind": kind,
            "actors": actors or [], "places": [], "dates": [],
            "source_occurrences": [{"url": url, "title": "T"}] if url else []}


def snapshot(claims, status="MODEL_ANSWER_PENDING_HUMAN_REVIEW", sections=None, unknowns=None,
             evidence_text=EV_TEXT, discoveries=None, contradictions=None):
    return {
        "run_id": "t1",
        "mission": {"target": "Πέτρος Λάντζας"},
        "discoveries": discoveries if discoveries is not None else [{"url": URL, "title": "T"}],
        "contradictions": {"records": contradictions or []},
        "research_answer": {
            "status": status,
            "claims": claims,
            "answer_sections": [{"text": t} for t in (sections or [])],
            "unknowns": unknowns or [],
            "evidence": [{"evidence_id": "e-1", "text": evidence_text, "occurrences": [{"url": URL, "title": "T"}]}],
        },
    }


ITEM = {
    "id": "T-ID", "type": "identity_resolution",
    "entity": {"aliases": ["Pedro Lantzas", "Πέτρος Λάντζας"]},
    "expected_claims": [
        {"id": "agent", "match": [["lantzas", "λαντζα"], ["agente griego", "spanish"]], "sources": ["FL"]},
        {"id": "parga", "match": [["lantzas"], ["parga"]], "sources": ["FL"]},
    ],
    "same_entity": [["Pedro Lantzas", "Πέτρος Λάντζας"]],
    "unresolved_pairs": [{"a": ["lantzas"], "b": ["pietro lanza"]}],
    "namesake_markers": [{"id": "scalea", "match": [["scalea"]]}],
    "forbidden_claims": [{"id": "milos", "match": [["lantzas", "lanza"], ["milo"]]}],
    "pass_criteria": {"min_must_find_recall": 0.5, "max_namesake_errors": 0, "max_forbidden": 0,
                      "max_hallucinated_citations": 0, "unresolved_pairs_must_not_be_asserted": True},
}
SOURCES = {"FL": {"detect": ["example.org/source"]}}


def score(snap, item=ITEM):
    return s.score_item(s.normalise_run(snap), item, SOURCES)


class Normalisation(unittest.TestCase):
    def test_accents_case_final_sigma(self):
        self.assertEqual(s.norm("ΛΆΝΤΖΑΣ  Πέτρος"), "λαντζασ πετροσ")
        self.assertTrue(s.matches(s.norm("Ο Πέτρος Λάντζας"), [["λαντζασ"], ["ΠΕΤΡΟΣ"]]))
        self.assertFalse(s.matches(s.norm("Ο Πέτρος"), [["λαντζα"], ["πετρο"]]))
        self.assertFalse(s.matches("anything", []))

    def test_hyphenated_line_break_joined(self):
        self.assertIn("encarcelamiento", s.norm("encarcela-\nmiento"))


class ClaimsAndCitations(unittest.TestCase):
    def test_valid_claim_counts_for_recall_and_precision(self):
        r = score(snapshot([claim("c1", "Pedro Lantzas was a Greek agent of the Spanish")]))
        self.assertEqual(r["metrics"]["must_find_recall"], 0.5)
        self.assertEqual(r["metrics"]["cited_claim_precision"], 1.0)
        self.assertEqual(r["metrics"]["hallucinated_citations"], 0)
        self.assertTrue(r["passed"], r["failures"])
        self.assertEqual(r["gold_sources_discovered"], {"FL": True})

    def test_url_not_in_run_is_hallucinated(self):
        r = score(snapshot([claim("c1", "Pedro Lantzas agent", url="https://invented.example/x")]))
        self.assertEqual(r["metrics"]["hallucinated_citations"], 1)
        self.assertEqual(r["metrics"]["must_find_recall"], 0.0)
        self.assertIn("hallucinated citation", r["failures"])

    def test_evidence_id_not_in_run_is_hallucinated(self):
        r = score(snapshot([claim("c1", "Pedro Lantzas agent", ev="e-missing")]))
        self.assertEqual(r["metrics"]["hallucinated_citations"], 1)

    def test_quote_not_in_evidence_is_not_valid(self):
        r = score(snapshot([claim("c1", "Pedro Lantzas agente griego", quote="Lantzas conquered Parga in 1573")]))
        self.assertEqual(r["metrics"]["quotes_not_in_evidence"], 1)
        self.assertEqual(r["metrics"]["claims_valid_citation"], 0)
        self.assertEqual(r["metrics"]["must_find_recall"], 0.0)

    def test_uncited_claim(self):
        r = score(snapshot([claim("c1", "Pedro Lantzas agent", url=None, ev=None)]))
        self.assertEqual(r["metrics"]["uncited_claims"], 1)
        self.assertEqual(r["metrics"]["claims_valid_citation"], 0)

    def test_irrelevant_claim_lowers_precision(self):
        r = score(snapshot([claim("c1", "Pedro Lantzas agent of the Spanish"), claim("c2", "Milo is an island", quote="")]))
        self.assertEqual(r["metrics"]["cited_claim_precision"], 0.5)

    def test_excerpts_count_for_evidence_recall_only(self):
        r = score(snapshot([claim("x1", "Απόσπασμα", kind="acquired_excerpt")], status="SOURCE_DOSSIER_AVAILABLE"))
        self.assertEqual(r["metrics"]["claims_total"], 0)
        self.assertEqual(r["metrics"]["excerpts_total"], 1)
        self.assertEqual(r["metrics"]["must_find_recall"], 0.0)
        self.assertEqual(r["metrics"]["must_find_recall_incl_excerpts"], 0.5)


class Identity(unittest.TestCase):
    def test_namesake_is_merge_error(self):
        r = score(snapshot([claim("c1", "Pedro Lantzas agente griego"), claim("c2", "Pietro Lanza Di Scalea", quote="")]))
        self.assertEqual(r["metrics"]["identity_merge_errors"], 1)
        self.assertIn("namesake merged into target", r["failures"])

    def test_unresolved_pair_asserted_vs_hedged(self):
        bad = score(snapshot([claim("c1", "Pedro Lantzas, also known as Pietro Lanza, agente griego")]))
        self.assertIn("unresolved identity asserted as fact", bad["failures"])
        ok = score(snapshot([claim("c1", "Pedro Lantzas agente griego; possibly the same as Pietro Lanza")]))
        self.assertEqual(ok["unresolved_identity_asserted"], [])

    def test_separate_sections_are_not_an_identity_assertion(self):
        r = score(snapshot([claim("c1", "Pedro Lantzas agente griego")],
                           sections=["Pedro Lantzas was an agent.", "Pietro Lanza was a corsair in 1608."],
                           unknowns=["Whether Pedro Lantzas and Pietro Lanza are the same person is unresolved."]))
        self.assertEqual(r["unresolved_identity_asserted"], [])
        self.assertEqual(r["unresolved_identity_flagged_in_unknowns"], ["lantzas~pietro lanza"])
        self.assertTrue(r["passed"], r["failures"])

    def test_split_error_when_known_aliases_left_unresolved(self):
        r = score(snapshot([claim("c1", "Pedro Lantzas agente griego")],
                           unknowns=["It is unclear whether Pedro Lantzas and Πέτρος Λάντζας are the same person."]))
        self.assertEqual(r["metrics"]["identity_split_errors"], 1)


class NegativeAndContradiction(unittest.TestCase):
    NEG = {"id": "T-NG", "type": "negative_trap", "entity": {"aliases": ["Lantzas"]}, "expected_claims": [],
           "forbidden_claims": [{"id": "milos", "match": [["lantzas"], ["milo"]]}], "expect_insufficient": True,
           "pass_criteria": {"max_forbidden": 0, "honest_insufficiency": True}}

    def test_honest_insufficient_passes(self):
        r = score(snapshot([], status="INSUFFICIENT_ACQUIRED_EVIDENCE"), self.NEG)
        self.assertEqual(r["honesty_label"], "HONEST_INSUFFICIENT")
        self.assertTrue(r["passed"])

    def test_false_premise_claim_fails(self):
        r = score(snapshot([claim("c1", "Lantzas ruled Milo from 1660")]), self.NEG)
        self.assertEqual(r["honesty_label"], "OVERCLAIM_ON_UNSUPPORTED_PREMISE")
        self.assertFalse(r["passed"])

    def test_false_premise_in_uncited_section_fails(self):
        r = score(snapshot([], sections=["Lantzas ruled Milo for ten years."]), self.NEG)
        self.assertEqual(r["metrics"]["forbidden_claims"], 1)

    def test_positive_item_empty_answer_is_honest_when_status_non_assertive(self):
        r = score(snapshot([], status="EXTRACTION_FAILED_OR_UNSUPPORTED"))
        self.assertEqual(r["honesty_label"], "HONEST_EMPTY")
        self.assertFalse(r["passed"])  # still fails recall

    CT = {"id": "T-CT", "type": "contradiction", "entity": {"aliases": ["Creveliers"]}, "expected_claims": [],
          "contradiction": {"side_a": {"match": [["crevel"], ["1678"]], "sources": ["FL"]},
                            "side_b": {"match": [["crevel"], ["1679"]], "sources": ["FL"]}},
          "pass_criteria": {"contradiction_both_sides": True}}

    def test_contradiction_both_sides(self):
        ev = "Creveliers died 1678 / Creveliers died 1679"
        snap = snapshot([claim("a", "Creveliers died in October 1678", quote="Creveliers died 1678"),
                         claim("b", "Creveliers died September 1679", quote="Creveliers died 1679")], evidence_text=ev)
        r = score(snap, self.CT)
        self.assertEqual(r["contradiction"]["result"], "BOTH_SIDES")
        self.assertTrue(r["passed"], r["failures"])

    def test_contradiction_one_side_fails(self):
        snap = snapshot([claim("a", "Creveliers died in 1678", quote="")])
        r = score(snap, self.CT)
        self.assertEqual(r["contradiction"]["result"], "ONE_SIDE")
        self.assertFalse(r["passed"])

    def test_contradiction_from_records(self):
        snap = snapshot([], contradictions=[{"text": "Creveliers 1678 vs Creveliers 1679"}])
        self.assertTrue(score(snap, self.CT)["contradiction"]["both_sides"])


class EvalSetIntegrity(unittest.TestCase):
    def setUp(self):
        self.ev = s.load_eval()

    def test_items_and_types(self):
        items = self.ev["items"]
        self.assertTrue(10 <= len(items) <= 15)
        ids = [i["id"] for i in items]
        self.assertEqual(len(ids), len(set(ids)))
        types = {i["type"] for i in items}
        self.assertEqual(types, {"identity_resolution", "fact_with_citation", "contradiction", "negative_trap", "synthesis"})
        self.assertIn("Ερεύνησε τη δραστηριότητα πειρατών στη Μήλο μεταξύ 1660 και 1680", [i["query_el"] for i in items])

    def test_every_item_is_complete_and_sourced(self):
        srcs = self.ev["sources"]
        for i in self.ev["items"]:
            for key in ("id", "type", "query_el", "query_en", "entity", "expected_claims", "forbidden_claims", "pass_criteria"):
                self.assertIn(key, i, (i["id"], key))
            for c in i["expected_claims"] + i.get("optional_claims", []):
                self.assertTrue(c.get("sources"), (i["id"], c["id"]))
                self.assertTrue(c.get("match"), (i["id"], c["id"]))
                for sid in c["sources"]:
                    self.assertIn(sid, srcs, (i["id"], sid))
            if i["type"] == "contradiction":
                for side in ("side_a", "side_b"):
                    self.assertTrue(i["contradiction"][side]["sources"])
                    for sid in i["contradiction"][side]["sources"]:
                        self.assertIn(sid, srcs)
            if i["type"] == "negative_trap":
                self.assertTrue(i.get("expect_insufficient"))
                self.assertTrue(i["forbidden_claims"])
        for sid, src in srcs.items():
            self.assertTrue(src.get("citation") and src.get("url") and src.get("kind"), sid)

    def test_cli_runs_on_bare_answer(self):
        import tempfile
        snap = snapshot([claim("c1", "Pedro Lantzas agente griego")])
        with tempfile.TemporaryDirectory() as d:
            p = pathlib.Path(d) / "answer.json"
            p.write_text(json.dumps(snap["research_answer"]), encoding="utf-8")
            out = pathlib.Path(d) / "r.json"
            rc = s.main(["--run", str(p), "--item", "ID-01-lantzas-aliases", "--out", str(out)])
            self.assertEqual(rc, 0)
            rep = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(rep["reports"][0]["item_id"], "ID-01-lantzas-aliases")


V2_PENDING = HERE / "research_eval_set.v2.pending.json"


class V2HistorianReview(unittest.TestCase):
    """Historian review of the v2 draft (2026-10-28): statuses, provenance and the two corrections."""

    def setUp(self):
        self.ev = s.load_eval(V2_PENDING)
        self.items = {i["id"]: i for i in self.ev["items"]}

    def test_every_item_has_review_record(self):
        allowed = set(self.ev["review"]["statuses"])
        counts = {}
        for n, i in enumerate(self.ev["items"], 1):
            self.assertIn(i["review_status"], allowed, i["id"])
            hr = i["human_review"]
            self.assertEqual(hr["sheet_no"], n)
            self.assertTrue(hr["reviewer"] and hr["review_date"] and hr["verdict"], i["id"])
            if i["review_status"] == "USER_CORRECTED":
                self.assertTrue(hr.get("correction"), i["id"])
            if i["review_status"] == "NEEDS_HISTORIAN":
                self.assertIs(i.get("scorable"), False, i["id"])
            else:
                self.assertNotEqual(i.get("scorable"), False, i["id"])
            counts[i["review_status"]] = counts.get(i["review_status"], 0) + 1
        self.assertEqual(counts, self.ev["review"]["counts"])

    def test_sources_resolve(self):
        srcs = self.ev["sources"]
        for i in self.ev["items"]:
            for c in i["expected_claims"]:
                for sid in c["sources"]:
                    self.assertIn(sid, srcs, (i["id"], sid))
            for side in ("side_a", "side_b"):
                for sid in (i.get("contradiction") or {}).get(side, {}).get("sources", []):
                    self.assertIn(sid, srcs, (i["id"], sid))

    def test_kapsis_dates_saulger_only(self):
        it = self.items["CT-03-kapsis-dates"]
        self.assertNotIn("contradiction", it)
        self.assertNotIn("George Kapsis", it["entity"]["aliases"])
        used = {sid for c in it["expected_claims"] for sid in c["sources"]}
        self.assertEqual(used, {"SAULGER1698"})
        cited = {sid for i in self.ev["items"] for c in i["expected_claims"] for sid in c["sources"]}
        cited |= {sid for i in self.ev["items"] for sd in ("side_a", "side_b")
                  for sid in (i.get("contradiction") or {}).get(sd, {}).get("sources", [])}
        self.assertNotIn("GREEKA", cited)
        self.assertNotIn("CT-03-kapsis-dates", self.items["SY-02-kapsis-kingdom"]["pass_criteria"]["contradictions_expected"])

    def test_armeni_correction(self):
        it = self.items["SY-02-kapsis-kingdom"]
        ids = {c["id"] for c in it["expected_claims"]}
        self.assertIn("armeni-daughter-married", ids)
        self.assertNotIn("armeni-secured", ids)
        married = [c for c in it["expected_claims"] if c["id"] == "armeni-daughter-married"][0]
        self.assertTrue(s.matches(s.norm("Ο Καψής παντρεύτηκε την κόρη του Αρμένη"), married["match"]))
        forb = [f for f in it["forbidden_claims"] if f["id"] == "armeni-neutralised"][0]
        self.assertTrue(s.matches(s.norm("Capsi neutralised the notable Armeni"), forb["match"]))
        self.assertFalse(s.matches(s.norm("Ο Καψής παντρεύτηκε την κόρη του Αρμένη"), forb["match"]))


class RealRunRegression(unittest.TestCase):
    """Pins the published baselines when the run snapshots are present in the checkout."""

    def _frozen_snapshot(self, run_id):
        """Frozen copy of the exact snapshot a baseline was scored on (sha256-pinned), or None."""
        snaps = HERE / "baselines" / "snapshots"
        manifest = snaps / "MANIFEST.json"
        if not manifest.exists():
            return None
        entry = json.loads(manifest.read_text(encoding="utf-8"))["snapshots"].get(run_id)
        if not entry:
            return None
        raw = gzip.decompress((snaps / entry["file"]).read_bytes())
        self.assertEqual(hashlib.sha256(raw).hexdigest(), entry["sha256"], f"frozen snapshot {run_id} changed")
        return json.loads(raw.decode("utf-8"))

    def test_baselines_reproduce(self):
        base = HERE / "baselines"
        checked = 0
        for f in sorted(base.glob("*.json")):
            rep = json.loads(f.read_text(encoding="utf-8"))
            frozen = self._frozen_snapshot(rep["run_id"])
            if frozen is not None:
                run = s.normalise_run(frozen, run_ref=rep["run_id"])
            else:
                snap = s.RUNS_DIR / f"{rep['run_id']}.json"
                if not snap.exists():
                    continue
                run = s.load_run(str(snap))
            ev = s.load_eval()
            items = {i["id"]: i for i in ev["items"]}
            for r in rep["reports"]:
                now = s.score_item(run, items[r["item_id"]], ev["sources"])
                self.assertEqual(now["metrics"], r["metrics"], (f.name, r["item_id"]))
                self.assertEqual(now["passed"], r["passed"], (f.name, r["item_id"]))
                checked += 1
        if not checked:
            self.skipTest("run snapshots not in checkout")

    def test_every_baseline_has_frozen_snapshot(self):
        """The live snapshot can be republished (e1fbd46d2 overwrote 39304929906); baselines must not depend on it."""
        for f in sorted((HERE / "baselines").glob("*.json")):
            rid = json.loads(f.read_text(encoding="utf-8"))["run_id"]
            self.assertIsNotNone(self._frozen_snapshot(rid), f.name)


if __name__ == "__main__":
    unittest.main()
