"""No network, no fictional research claims: synthetic map geometry only."""
import io
import json
import unittest

from tools.historical_map_intelligence import (
    convert_labels, make_whg_queries, reconcile, SCHEMA,
)


def fixture():
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature",
         "geometry": {"type": "Polygon", "coordinates": [[
             [24.2,36.7],[24.3,36.7],[24.3,36.8],[24.2,36.7]]]},
         "properties": {"text": "MILO", "postocr_label": "Milo",
                        "score": 0.91, "osm_id": "sample-id"}},
        {"type": "Feature", "geometry": None, "properties": {"text": ""}}
    ]}


def converted():
    return convert_labels(
        fixture(), source_id="synthetic-test-map", source_url="https://example.org/map",
        rights="synthetic-test-only", map_title="Synthetic Map Fixture",
        start_year=1650, end_year=1700, crs="EPSG:4326")


class HistoricalMapIntelligenceTests(unittest.TestCase):
    def test_import_preserves_exact_footprint_and_provenance(self):
        result = converted()
        self.assertEqual(result["schema"], SCHEMA)
        self.assertEqual(len(result["features"]), 1)
        feature = result["features"][0]
        self.assertEqual(feature["geometry"], fixture()["features"][0]["geometry"])
        prop = feature["properties"]
        self.assertEqual(prop["raw_ocr_label"], "MILO")
        self.assertEqual(prop["label"], "Milo")
        self.assertEqual(prop["geometry_role"], "MAP_TEXT_FOOTPRINT_NOT_ATTESTED_PLACE_GEOMETRY")
        self.assertFalse(prop["historical_claim_verified"])
        self.assertFalse(prop["original_source_inspected"])
        self.assertEqual(result["metadata"]["skipped"][0]["reason"], "NO_LABEL")

    def test_fail_closed_without_crs(self):
        with self.assertRaisesRegex(ValueError, "EPSG:4326"):
            convert_labels(fixture(), source_id="a", source_url="https://example.org",
                           rights="x", map_title="Synthetic", crs=None)

    def test_reject_pixel_coordinates_even_if_crs_declared(self):
        bad = fixture()
        bad["features"][0]["geometry"]["coordinates"][0][1] = [3000, 2000]
        with self.assertRaisesRegex(ValueError, "Invalid geographic"):
            convert_labels(bad, source_id="a", source_url="https://example.org",
                           rights="x", map_title="Synthetic", crs="EPSG:4326")

    def test_reject_bad_years_and_missing_rights(self):
        with self.assertRaises(ValueError):
            convert_labels(fixture(), source_id="a", source_url="https://example.org",
                           rights="", map_title="Synthetic", crs="EPSG:4326")
        with self.assertRaises(ValueError):
            convert_labels(fixture(), source_id="a", source_url="https://example.org",
                           rights="x", map_title="Synthetic", crs="EPSG:4326",
                           start_year=1700, end_year=1650)

    def test_whg_query_has_scope_but_no_unverified_container(self):
        queries, ids = make_whg_queries(converted(), namespaces="whg,gn")
        self.assertEqual(queries["q0"], {"query": "Milo", "mode": "fuzzy",
                                         "namespaces": "whg,gn"})
        self.assertEqual(len(ids), 1)

    def test_whg_requires_token(self):
        with self.assertRaisesRegex(ValueError, "WHG_API_TOKEN_REQUIRED"):
            reconcile(converted(), token="")

    def test_whg_candidates_not_historical_fact_and_provenance_retained(self):
        seen = {}
        def opener(request, timeout):
            self.assertEqual(timeout, 30)
            self.assertEqual(request.get_header("Authorization"), "Bearer secret-test-value")
            self.assertNotIn("secret-test-value", request.full_url)
            sent = json.loads(request.data)
            self.assertEqual(sent["queries"]["q0"]["query"], "Milo")
            seen["called"] = True
            response = {"q0": {"result": [
                {"id": "place:whg:123", "name": "Milo", "score": 100,
                 "confidence": 100, "namespace": "whg", "repr_point": [24.4, 36.7],
                 "match": True}]},
                "attribution": {"sources": {"whg": {"licence": "synthetic-test-licence"}}}}
            return io.BytesIO(json.dumps(response).encode())
        result = reconcile(converted(), token="secret-test-value", opener=opener)
        self.assertTrue(seen["called"])
        self.assertEqual(result["historically_verified"], 0)
        self.assertEqual(result["operator_approved"], 0)
        self.assertEqual(result["source_attributions"][0]["sources"]["whg"]["licence"],
                         "synthetic-test-licence")
        cand = result["candidates"][0]
        self.assertEqual(cand["candidate_status"], "SUGGESTED")
        self.assertEqual(cand["name_confidence_absolute"], 100)
        self.assertEqual(cand["score_relative"], 100)
        self.assertFalse(cand["historically_verified"])
        self.assertNotIn("secret-test-value", json.dumps(result))

    def test_bad_whg_repr_point_stays_unlocated(self):
        def opener(*args, **kwargs):
            return io.BytesIO(json.dumps({
                "q0": {"result": [{"id": "place:gn:1", "repr_point": [999, 999]}]}
            }).encode())
        result = reconcile(converted(), token="mock", opener=opener)
        self.assertIsNone(result["candidates"][0]["repr_point"])


if __name__ == "__main__":
    unittest.main()
