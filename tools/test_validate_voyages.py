import copy
import json
import unittest
from pathlib import Path

from tools import validate_voyages as vv

ROOT = Path(__file__).resolve().parent.parent

# Synthetic fixture for the validator only: not a historical claim.
GAZ = {"places": [{"id": "gz:QA"}, {"id": "gz:QB"}]}
LEG = {
    "seq": 1,
    "from": {"gazetteer_id": "gz:QA", "name_in_source": "Alpha"},
    "to": {"gazetteer_id": "gz:QB", "name_in_source": "Beta"},
    "date_in_source": "1600",
    "certainty": "STATED",
    "review_status": "PENDING_REVIEW",
    "run_id": "1",
    "claim_ids": ["c-1"],
    "citation": {"title": "T", "page": "1", "url": "https://example.org", "quote": "sailed from Alpha to Beta in 1600"},
    "geometry": "SCHEMATIC",
    "waypoints": [],
}


def doc(leg):
    return {"schema": "nabou-voyages-v1", "voyages": [{"voyage_id": "v", "status": "DRAFT", "legs": [leg]}]}


class ValidateVoyagesTest(unittest.TestCase):
    def test_repo_file_is_valid(self):
        data = json.loads((ROOT / "data/voyages/voyages.v1.json").read_text(encoding="utf-8"))
        gaz = json.loads((ROOT / "data/gazetteer/mediterranean_gazetteer.v1.json").read_text(encoding="utf-8"))
        self.assertEqual(vv.validate(data, gaz), [])

    def test_good_leg_passes(self):
        self.assertEqual(vv.validate(doc(LEG), GAZ), [])

    def test_leg_without_citation_is_rejected(self):
        leg = copy.deepcopy(LEG)
        del leg["citation"]
        self.assertTrue(any("citation" in e for e in vv.validate(doc(leg), GAZ)))

    def test_leg_without_quote_is_rejected(self):
        leg = copy.deepcopy(LEG)
        leg["citation"]["quote"] = ""
        self.assertTrue(vv.validate(doc(leg), GAZ))

    def test_unknown_or_missing_gazetteer_id_is_rejected(self):
        leg = copy.deepcopy(LEG)
        leg["to"]["gazetteer_id"] = "gz:QZ"
        self.assertTrue(any("not in the gazetteer" in e for e in vv.validate(doc(leg), GAZ)))
        del leg["to"]["gazetteer_id"]
        self.assertTrue(any("missing gazetteer_id" in e for e in vv.validate(doc(leg), GAZ)))

    def test_own_coordinates_are_rejected(self):
        leg = copy.deepcopy(LEG)
        leg["from"]["lat"] = 36.7
        self.assertTrue(any("coordinates" in e for e in vv.validate(doc(leg), GAZ)))

    def test_date_not_in_quote_is_rejected(self):
        leg = copy.deepcopy(LEG)
        leg["date_in_source"] = "1680"
        self.assertTrue(any("does not appear" in e for e in vv.validate(doc(leg), GAZ)))

    def test_waypoints_must_be_cartographic_aids(self):
        leg = copy.deepcopy(LEG)
        leg["waypoints"] = [{"lat": 1, "lon": 2}]
        self.assertTrue(any("cartographic_aid" in e for e in vv.validate(doc(leg), GAZ)))

    def test_bad_certainty_and_review_status_are_rejected(self):
        leg = copy.deepcopy(LEG)
        leg["certainty"] = "LIKELY"
        leg["review_status"] = "approved"
        errors = vv.validate(doc(leg), GAZ)
        self.assertTrue(any("certainty" in e for e in errors))
        self.assertTrue(any("review_status" in e for e in errors))


if __name__ == "__main__":
    unittest.main()
