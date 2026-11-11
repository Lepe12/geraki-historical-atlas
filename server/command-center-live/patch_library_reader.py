#!/usr/bin/env python3
"""Additive one-library routes for the live gateway app.js.

tools/library/deploy_n7_mission_gateway.py is pinned by n7-distribution.json
and cannot be edited in this repository. This wrapper extends that patcher so
preflight and production install keep the library routes instead of writing
an app.js without them.
"""
from __future__ import annotations
import importlib.util
import pathlib


def add_exact(src: bytes, before: bytes, addition: bytes) -> bytes:
    if src.count(before) != 1:
        raise RuntimeError("GATEWAY_LIVE_ANCHOR_CHANGED")
    return src.replace(before, addition + before)


def replace_exact(src: bytes, old: bytes, new: bytes) -> bytes:
    if src.count(old) != 1:
        raise RuntimeError("GATEWAY_LIVE_ANCHOR_CHANGED")
    return src.replace(old, new)


def _patch_library_reader_core(live: bytes, canonical: bytes) -> bytes:
    marker = b'const {createLibraryReader}=require("./library-reader");'
    if marker in live:
        if live.count(marker) != 1:
            raise RuntimeError("DUPLICATE_LIBRARY_READER")
        if b"if(await handleLibrary(req,res,p))return;" not in live:
            raise RuntimeError("GATEWAY_LIBRARY_READER_INCOMPLETE")
        return live
    if canonical.count(marker) != 1:
        raise RuntimeError("CANONICAL_LIBRARY_READER_MISSING")
    oauth = b'const {createN7OAuth}=require("./n7-oauth");\n'
    live = replace_exact(live, oauth, oauth + marker + b"\n")
    start = b"// One NABOU library: published sources + books added as PDF"
    stop = b"const server=http.createServer(async(req,res)=>{"
    if start not in canonical or canonical.count(stop) != 1:
        raise RuntimeError("CANONICAL_LIBRARY_HANDLER_MISSING")
    fragment = canonical.split(start, 1)[1].split(stop, 1)[0]
    live = add_exact(live, stop, start + fragment)
    old = (
        b'if(req.method==="OPTIONS"){res.writeHead(204,{"access-control-allow-origin":'
        b'res.nabouCorsOrigin||"https://lepe12.github.io","access-control-allow-credentials":"true",'
        b'"access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":'
        b'"authorization,content-type,x-file-name,x-nabou-agent-room"});return res.end();}'
    )
    new = (
        b'if(req.method==="OPTIONS"){res.writeHead(204,{"access-control-allow-origin":'
        b'res.nabouCorsOrigin||"https://lepe12.github.io","access-control-allow-credentials":"true",'
        b'"access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":'
        b'"authorization,content-type,x-file-name,x-nabou-agent-room,x-book-title,x-book-author,x-book-year"});'
        b"return res.end();}"
    )
    live = replace_exact(live, old, new)
    old = b"    if(await handleN7Library(req,res,p,u))return;\n"
    new = b"    if(await handleN7Library(req,res,p,u))return;\n    if(await handleLibrary(req,res,p))return;\n"
    return replace_exact(live, old, new)


SITE_CHAT_REQUIRE = (
    b'\n// Public site chat (\xc2\xab\xce\xa1\xcf\x8e\xcf\x84\xce\xb1 \xcf\x84\xce\xbf\xce\xbd \xce\x9a\xce\xb1\xcf\x80\xce\xb5\xcf\x84\xce\xac\xce\xbd\xce\xb9\xce\xbf\xc2\xbb). Optional: if its files are missing, the rest of the service still starts.\n'
    b'let siteChat=null;try{siteChat=require("./site-chat").createSiteChat();}catch(error){console.error("site-chat disabled:",error.message);}'
)
SITE_CHAT_ROUTE = b"    if(siteChat&&await siteChat.handle(req,res,p,{json,readBody}))return;\n"
OAUTH_ROUTE = b"    if(await oauth.handle(req,res,p))return;\n"
ORIGINS_OLD = b'const ALLOWED_BROWSER_ORIGINS=new Set(["https://lepe12.github.io","https://pct-live.piratecartography.com","https://bot.piratecartography.com"]);'
ORIGINS_NEW = b'const ALLOWED_BROWSER_ORIGINS=new Set(["https://lepe12.github.io","https://pct-live.piratecartography.com","https://bot.piratecartography.com","https://www.piratecartography.com","https://piratecartography.com"]);'


def patch_site_chat(live: bytes, canonical: bytes) -> bytes:
    """Additive, idempotent: public piratecartography.com site chat routes (/site/*) and its CORS origins."""
    if b'require("./site-chat")' not in canonical:
        return live
    for part in (SITE_CHAT_REQUIRE, SITE_CHAT_ROUTE, ORIGINS_NEW):
        if canonical.count(part) != 1:
            raise RuntimeError("CANONICAL_SITE_CHAT_MISSING")
    if b'require("./site-chat")' in live:
        if SITE_CHAT_ROUTE not in live or ORIGINS_NEW not in live:
            raise RuntimeError("GATEWAY_SITE_CHAT_INCOMPLETE")
        return live
    reader = b'const {createLibraryReader}=require("./library-reader");'
    live = replace_exact(live, reader, reader + SITE_CHAT_REQUIRE)
    live = replace_exact(live, ORIGINS_OLD, ORIGINS_NEW)
    return add_exact(live, OAUTH_ROUTE, SITE_CHAT_ROUTE)


def patch_library_reader(live: bytes, canonical: bytes) -> bytes:
    return patch_site_chat(_patch_library_reader_core(live, canonical), canonical)


def wrap_mission_patched(original_patched):
    def patched(local: dict[str, bytes], live: dict[str, bytes]) -> dict[str, bytes]:
        result = dict(original_patched(local, live))
        result["app.js"] = patch_library_reader(result["app.js"], local["app.js"])
        return result

    return patched


def load_mission():
    target = pathlib.Path(__file__).resolve().parents[2] / "tools/library/deploy_n7_mission_gateway.py"
    spec = importlib.util.spec_from_file_location("deploy_n7_mission_gateway", target)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


if __name__ == "__main__":
    mission = load_mission()
    mission.patched = wrap_mission_patched(mission.patched)
    mission.deploy()
