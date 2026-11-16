#!/usr/bin/env python3
"""Local-only preview server for the built /n7-eve export.

Serves the static export and forwards, read-through, the same-origin paths the page uses on the N7
server: /api/* and /n7-apex-voice/* to bot.piratecartography.com, and /pct-api/live/* to pct-live
(build with N7_EVE_PCT_API=/pct-api/live). Binds to 127.0.0.1 only. Nothing is deployed.
"""
import argparse, http.server, pathlib, urllib.error, urllib.request

BOT = "https://bot.piratecartography.com"
PCT = "https://pct-live.piratecartography.com"


class Handler(http.server.SimpleHTTPRequestHandler):
    def _proxy(self, upstream):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None
        headers = {k: v for k, v in self.headers.items() if k.lower() in ("content-type", "accept", "cookie")}
        headers["Origin"] = BOT
        req = urllib.request.Request(upstream + self.path, data=body, method=self.command, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                status, data, rh = r.status, r.read(), r.headers
        except urllib.error.HTTPError as e:
            status, data, rh = e.code, e.read(), e.headers
        except Exception as e:  # upstream unreachable
            status, data, rh = 502, ('{"error":"upstream: %s"}' % type(e).__name__).encode(), {"Content-Type": "application/json"}
        self.send_response(status)
        self.send_header("Content-Type", rh.get("Content-Type", "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _route(self):
        if self.path.startswith("/api/") or self.path.startswith("/n7-apex-voice/"):
            return self._proxy(BOT)
        if self.path.startswith("/pct-api/live/"):
            return self._proxy(PCT)
        if self.command == "GET":
            return super().do_GET()
        self.send_error(405)

    do_GET = _route
    do_POST = _route


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True, help="directory that contains the n7-eve/ export folder")
    ap.add_argument("--port", type=int, default=4180)
    a = ap.parse_args()
    root = str(pathlib.Path(a.root).resolve())
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", a.port), lambda *x, **k: Handler(*x, directory=root, **k))
    print(f"N7 EVE preview: http://127.0.0.1:{a.port}/n7-eve/", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
