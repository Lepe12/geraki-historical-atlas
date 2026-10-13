"""Restricted browser discovery probe for SIAS Italian State Archives."""
from __future__ import annotations
import argparse, asyncio, json, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path: sys.path.insert(0,str(ROOT))
from tools.browser.archive_session import ArchiveBrowserRegistry

URL="https://sias-archivi.cultura.gov.it"

async def search(term:str):
    registry=ArchiveBrowserRegistry(Path("evidence/browser_sessions"),headless=True)
    session=registry.get("sias")
    try:
        await session.go_to(URL)
        await asyncio.sleep(4)
        typed=await session.smart_type("cerca",term)
        if not typed: typed=await session.smart_type("search",term)
        if typed:
            await session.press("Enter")
            await asyncio.sleep(4)
        body=await session.body_text(16000)
        shot=await session.screenshot("sias-search")
        out={
          "status":"EXECUTED" if typed else "BROWSER_OPENED_SEARCH_INPUT_NOT_FOUND",
          "source":"SIAS / Italian State Archives",
          "query":term,
          "term_visible":term.lower() in body.lower(),
          "body_excerpt":body[:7000],
          "screenshot":shot,
          "audit_log":str(session.audit_path),
          "warning":"Catalogue/browser discovery only; this does not verify an archival document."
        }
        print(json.dumps(out,ensure_ascii=False,indent=2))
        return out
    finally:
        await registry.close_all()

if __name__=="__main__":
    p=argparse.ArgumentParser(); p.add_argument("query"); a=p.parse_args()
    asyncio.run(search(a.query))
