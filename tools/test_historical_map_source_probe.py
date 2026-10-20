import io
import json
import unittest
from urllib.error import HTTPError, URLError
from tools.historical_map_source_probe import probe, CANDIDATE_MANIFEST


class DummyResponse:
    def __init__(self, body):self.body=body
    def __enter__(self):return self
    def __exit__(self,*args):return False
    def read(self,limit):return self.body[:limit]


class HistoricalMapSourceProbeTests(unittest.TestCase):
    def test_real_metadata_url_not_invented_labels(self):
        def fetch(req,timeout):
            self.assertEqual(req.full_url,CANDIDATE_MANIFEST)
            self.assertEqual(timeout,20)
            return DummyResponse(json.dumps({
                "@id":CANDIDATE_MANIFEST,
                "sequences":[{"canvases":[{"@id":"synthetic:1"}]}]
            }).encode())
        output=probe(fetch)
        self.assertTrue(output["manifest_verified"])
        self.assertEqual(output["canvas_count"],1)
        self.assertEqual(output["images_downloaded"],0)
        self.assertEqual(output["historical_map_labels_extracted"],0)

    def test_library_blockage_is_reported_not_silently_successful(self):
        def blocked(req,timeout):
            raise HTTPError(req.full_url,403,"Forbidden",{},None)
        result=probe(blocked)
        self.assertEqual(result["http_status"],403)
        self.assertFalse(result["manifest_verified"])
        self.assertEqual(result["status"],"UPSTREAM_HTTP_BLOCKED_OR_UNAVAILABLE")

    def test_unavailable_network_does_not_create_map(self):
        def unavailable(req,timeout):
            raise URLError("No route")
        result=probe(unavailable)
        self.assertEqual(result["status"],"NETWORK_ACCESS_BLOCKED")
        self.assertEqual(result["images_downloaded"],0)


if __name__=="__main__":
    unittest.main()
