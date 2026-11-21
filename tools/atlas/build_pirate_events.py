#!/usr/bin/env python3
"""Build jarvis-intelligence-chamber/data/pirate-events.json from a WordPress export of
piratecartography.com (M. Gourgourini): the entries of each harbour page's section «Πειρατές και κουρσάροι
που έδρασαν στο νησί» («Name - text»). Years are only those written in the text; an entry without a year
stays undated. Only published text of the site is kept. Usage: build_pirate_events.py export.xml"""
import html, json, pathlib, re, sys, datetime, xml.etree.ElementTree as ET
NS = {"wp": "http://wordpress.org/export/1.2/", "content": "http://purl.org/rss/1.0/modules/content/"}
OUT = pathlib.Path(__file__).resolve().parents[2] / "jarvis-intelligence-chamber/data/pirate-events.json"
URL = "https://www.piratecartography.com/?destination-item="
# One spelling per person across the harbour pages.
PERSON = [(r"Τεμερτικούτ|Temeticourt|Themericourt", "Αδελφοί Themericourt"), (r"Χα[ϊι]ρεντίν|Χαρεϊντίν", "Χαϊρεντίν Μπαρμπαρόσα"),
          (r"Ουλούτζ Αλ", "Ουλούτζ Αλής"), (r"Μοροζίνι", "Φραντσέσκο Μοροζίνι")]

def text(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html.unescape(html.unescape(s or "")))).strip()

def main(path):
    events = []
    for it in ET.parse(path).getroot().find("channel").findall("item"):
        if it.findtext("wp:post_type", namespaces=NS) != "destination-item" or "Νήσος" not in (it.findtext("title") or ""):
            continue
        area, slug = it.findtext("title").replace("Νήσος ", "").strip(), it.findtext("wp:post_name", namespaces=NS) or ""
        status = it.findtext("wp:status", namespaces=NS)
        src = it.findtext("content:encoded", namespaces=NS) or ""
        cur = None
        for m in re.finditer(r'\[(\w+)((?:[^\]"]|"[^"]*")*)\]', src):
            attrs = dict(re.findall(r'(\w+)="([^"]*)"', m.group(2) or ""))
            if attrs.get("title"):
                cur = text(attrs["title"]).upper()
            if not cur or "ΕΔΡΑΣΑΝ" not in cur or not attrs.get("text"):
                continue
            t = text(attrs["text"])
            mm = re.match(r"^(.{2,60}?)\s+[-–]\s+(.*)$", t)
            if not mm:
                continue
            who, body = mm.group(1).strip(), mm.group(2).strip()
            person = next((n for pat, n in PERSON if re.search(pat, who)), who)
            years = sorted({int(y) for y in re.findall(r"\b(1[4-7]\d\d)\b", body)})
            events.append({"id": f"ev{len(events) + 1:03d}", "area": area, "who": who, "person": person, "years": years, "text": body,
                           "source": URL + slug if slug and status == "publish" else None,
                           "published": status == "publish"})
    data = {"title": "Πειρατές και κουρσάροι στα ορμητήρια (piratecartography.com)", "author": "Μαρία Γουργουρίνη",
            "note": "Κείμενα των σελίδων «Πειρατικά Λιμάνια»· τα έτη είναι όσα γράφει το κείμενο.",
            "generatedAt": datetime.date.today().isoformat(), "count": len(events), "events": events}
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(OUT, len(events), "events,", sum(bool(e["years"]) for e in events), "dated")

if __name__ == "__main__":
    main(sys.argv[1])
