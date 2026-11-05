#!/usr/bin/env python3
"""Loopback-only, token-protected search tool adapter for the N7 research pilot.

No ingestion endpoint and no claim of historical verification.
"""
import argparse
import hmac
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from source_index import search

MAX_REQUEST_BYTES = 8192

def make_handler(db_path, token):
    if not token:
        raise ValueError("N7_LIBRARY_TOKEN is required")
    class Handler(BaseHTTPRequestHandler):
        def respond(self, status, payload):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def authenticated(self):
            supplied = self.headers.get("Authorization", "")
            expected = "Bearer " + token
            if not hmac.compare_digest(supplied.encode("utf-8"), expected.encode("utf-8")):
                self.respond(401, {"error": "unauthorized"})
                return False
            return True

        def do_GET(self):
            if self.path == "/health":
                self.respond(200, {"status": "ok", "component": "n7-source-library-pilot"})
                return
            if not self.authenticated():
                return
            if self.path == "/v1/tools":
                self.respond(200, {"tools": [{"name":"research.search_sources",
                    "description":"Search locally indexed UTF-8 texts. Hits are UNVERIFIED_TEXT.",
                    "arguments":{"query":"string", "limit":"integer 1..20"}}]})
            else:
                self.respond(404, {"error": "not_found"})

        def do_POST(self):
            if not self.authenticated():
                return
            if self.path != "/v1/tools/research.search_sources":
                self.respond(404, {"error": "not_found"})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length < 1 or length > MAX_REQUEST_BYTES:
                    self.respond(413, {"error": "invalid_request_size"})
                    return
                data = json.loads(self.rfile.read(length))
                if not isinstance(data, dict):
                    raise ValueError("JSON object expected")
                query = data.get("query")
                limit = data.get("limit", 10)
                if not isinstance(query, str) or not 1 <= len(query.strip()) <= 200:
                    raise ValueError("query must be a nonempty string of at most 200 characters")
                if type(limit) is not int or not 1 <= limit <= 20:
                    raise ValueError("limit must be an integer between 1 and 20")
                # Quote all FTS5 user input as a literal phrase; no arbitrary FTS operators.
                phrase = '"' + query.strip().replace('"', '""') + '"'
                matches = search(db_path, phrase, limit)
                self.respond(200, {"results": matches, "verification":"UNVERIFIED_TEXT"})
            except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
                self.respond(400, {"error": "invalid_request"})
            except Exception:
                self.respond(500, {"error": "search_failed"})

        def log_message(self, fmt, *args):
            # Avoid logging users' sensitive queries.
            pass
    return Handler

def main():
    p = argparse.ArgumentParser(description="N7 local source-search tool API")
    p.add_argument("--db", default="n7_sources.sqlite3")
    p.add_argument("--port", type=int, default=8767)
    args = p.parse_args()
    token = os.getenv("N7_LIBRARY_TOKEN")
    if not token or len(token) < 24:
        p.error("set a random N7_LIBRARY_TOKEN of at least 24 characters")
    # Bind loopback only. Do not publish directly to the Internet.
    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(args.db, token))
    print("N7 research pilot API listening on 127.0.0.1:%s" % server.server_port, flush=True)
    server.serve_forever()

if __name__ == "__main__":
    main()
