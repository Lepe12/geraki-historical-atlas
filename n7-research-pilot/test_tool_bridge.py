import json
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path

from source_index import ingest
from tool_bridge import make_handler

class N7ToolBridgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = str(Path(self.temp.name) / "library.sqlite")
        sample = Path(self.temp.name) / "historical.txt"
        sample.write_text("Κέρκυρα και πειρατεία\fΗ Τήνος και τα πλοία.", encoding="utf-8")
        ingest(self.db, sample)
        self.token = "test_token_" + "x" * 30
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(self.db, self.token))
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=3)
        self.temp.cleanup()

    def request(self, path, body=None, auth=None):
        conn = HTTPConnection("127.0.0.1", self.httpd.server_port, timeout=3)
        headers = {"Content-Type": "application/json"}
        if auth is not None:
            headers["Authorization"] = "Bearer " + auth
        method = "GET" if body is None else "POST"
        conn.request(method, path, body=None if body is None else json.dumps(body), headers=headers)
        response = conn.getresponse()
        data = json.loads(response.read())
        status = response.status
        conn.close()
        return status, data

    def test_requires_token(self):
        status, _ = self.request("/v1/tools/research.search_sources", {"query": "Τήνος"})
        self.assertEqual(status, 401)

    def test_search_returns_source_and_segment(self):
        status, body = self.request("/v1/tools/research.search_sources", {"query": "Τήνος"}, self.token)
        self.assertEqual(status, 200)
        self.assertEqual(len(body["results"]), 1)
        self.assertEqual(body["results"][0]["page"], 2)
        self.assertEqual(body["results"][0]["verification"], "UNVERIFIED_TEXT")

    def test_refuses_invalid_limit(self):
        status, _ = self.request("/v1/tools/research.search_sources", {"query": "Τήνος", "limit": 999}, self.token)
        self.assertEqual(status, 400)

    def test_manifest_protected(self):
        status, _ = self.request("/v1/tools")
        self.assertEqual(status, 401)
        status, body = self.request("/v1/tools", auth=self.token)
        self.assertEqual(status, 200)
        self.assertEqual(body["tools"][0]["name"], "research.search_sources")

if __name__ == "__main__":
    unittest.main()
