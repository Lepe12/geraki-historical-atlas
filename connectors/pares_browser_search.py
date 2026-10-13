"""Browser fallback for PARES catalogue discovery using restricted JARVIS archive sessions."""
from __future__ import annotations
import argparse, asyncio, json, sys, urllib.parse
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path: sys.path.insert(0,str(ROOT))
from tools.browser.archive_session import ArchiveBrowserRegistry

BASE="https://pares.cultura.gob.es/ParesBusquedas20/catalogo/find?"

async def search(term:str):
    registry=ArchiveBrowserRegistry(Path("evidence/browser_sessions"),headless=True)
    session=registry.get("pares-simancas")
    try:
        url=BASE+urllib.parse.urlencode({"texto":term})
        await session.go_to(url)
        await asyncio.sleep(4)
        body=await session.body_text(16000)
        shot=await session.screenshot("pares-search")
        simancas="Archivo General de Simancas" in body
        out={
          "status":"EXECUTED",
          "source":"PARES",
          "query":term,
          "simancas_visible":simancas,
          "body_excerpt":body[:7000],
          "screenshot":shot,
          "audit_log":str(session.audit_path),
          "warning":"Browser catalogue discovery only; record descriptions and originals require separate verification."
        }
        print(json.dumps(out,ensure_ascii=False,indent=2))
        return out
    finally:
        await registry.close_all()

if __name__=="__main__":
    p=argparse.ArgumentParser(); p.add_argument("query"); a=p.parse_args()
    asyncio.run(search(a.query))
