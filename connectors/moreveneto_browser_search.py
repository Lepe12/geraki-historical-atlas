"""Browser-backed search of official Moreveneto using restricted JARVIS archive sessions."""
from __future__ import annotations
import argparse, asyncio, json, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path: sys.path.insert(0,str(ROOT))
from tools.browser.archive_session import ArchiveBrowserRegistry

URL="https://asve.arianna4.cloud/"

async def search(term:str):
    registry=ArchiveBrowserRegistry(workspace=Path("evidence/browser_sessions"),headless=True)
    session=registry.get("moreveneto")
    responses=[]
    try:
        await session.start()
        session._page.on("response",lambda r: responses.append({"url":r.url,"status":r.status}) if ("graphql" in r.url.lower() or "netseven" in r.url.lower()) else None)
        await session.go_to(URL)
        await asyncio.sleep(4)
        typed=await session.smart_type("cerca",term)
        if not typed:
            typed=await session.smart_type("search",term)
        if typed:
            await session.press("Enter")
        await asyncio.sleep(4)
        body=await session.body_text(12000)
        shot=await session.screenshot("search-result")
        gql=[x for x in responses if "graphql" in x["url"].lower() or "netseven" in x["url"].lower()]
        out={
          "status":"EXECUTED" if any(x["status"]==200 for x in gql) else "BROWSER_EXECUTED_NO_API_CONFIRMATION",
          "source":"Archivio di Stato di Venezia / moreveneto",
          "query":term,
          "graphql_responses":gql[-10:],
          "term_visible":term.lower() in body.lower(),
          "body_excerpt":body[:5000],
          "screenshot":shot,
          "audit_log":str(session.audit_path),
          "warning":"Catalogue/browser discovery only; original archival documents are not verified by this step."
        }
        print(json.dumps(out,ensure_ascii=False,indent=2))
        return out
    finally:
        await registry.close_all()

if __name__=="__main__":
    p=argparse.ArgumentParser(); p.add_argument("query"); a=p.parse_args()
    result=asyncio.run(search(a.query))
    if result["status"]=="BROWSER_EXECUTED_NO_API_CONFIRMATION":
        raise SystemExit(2)
