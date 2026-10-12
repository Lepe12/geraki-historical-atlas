"""Browser-backed search smoke test for the official moreveneto SPA."""
import argparse, asyncio, json
from playwright.async_api import async_playwright

URL="https://asve.arianna4.cloud/"

async def run(term):
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True)
        page=await browser.new_page()
        responses=[]
        page.on("response",lambda r: responses.append({"url":r.url,"status":r.status}) if ("graphql" in r.url.lower() or "netseven" in r.url.lower()) else None)
        await page.goto(URL,wait_until="domcontentloaded",timeout=60000)
        await page.wait_for_timeout(4000)
        inputs=page.locator("input")
        n=await inputs.count()
        if not n: raise RuntimeError("No search input rendered by official SPA")
        chosen=None
        for i in range(n):
            el=inputs.nth(i)
            try:
                ph=(await el.get_attribute("placeholder") or "").lower()
                if "cerca" in ph or "ricerca" in ph:
                    chosen=el; break
            except: pass
        chosen=chosen or inputs.first
        await chosen.fill(term)
        await page.wait_for_timeout(2500)
        body=(await page.locator("body").inner_text())[:12000]
        gql=[x for x in responses if "graphql" in x["url"].lower() or "netseven" in x["url"].lower()]
        out={"status":"EXECUTED","source":"Archivio di Stato di Venezia / moreveneto","query":term,"graphql_responses":gql[-10:],"term_visible":term.lower() in body.lower(),"body_excerpt":body[:3000],"warning":"Browser catalogue discovery only; not verification of an original archival document."}
        print(json.dumps(out,ensure_ascii=False,indent=2))
        if not gql: raise RuntimeError("Official SPA made no observable GraphQL request")
        if not any(x["status"]==200 for x in gql): raise RuntimeError("No successful GraphQL response observed")
        await browser.close()

if __name__=="__main__":
    ap=argparse.ArgumentParser();ap.add_argument("query");a=ap.parse_args()
    asyncio.run(run(a.query))
