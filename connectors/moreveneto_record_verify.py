"""Verify official moreveneto archival record pages; NOT a catalogue search API."""
import argparse
import json
import re
from html import unescape
from html.parser import HTMLParser
from urllib.parse import urlparse
from urllib.request import Request, urlopen

HOST = "asve.arianna4.cloud"
RECORD = re.compile(r"^/patrimonio/([0-9a-f]{8}-[0-9a-f-]{27,})/[^/?#]+/?$")

class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip = 0
    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip += 1
    def handle_endtag(self, tag):
        if tag in ("script", "style") and self.skip:
            self.skip -= 1
        if tag in ("p", "h1", "h2", "h3", "div", "li"):
            self.parts.append(" ")
    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)

def verify_record(url):
    parsed = urlparse(url)
    match = RECORD.fullmatch(parsed.path)
    if parsed.scheme != "https" or parsed.netloc != HOST or not match:
        raise ValueError("Expected an official moreveneto /patrimonio/<uuid>/<slug> URL")
    with urlopen(Request(url, headers={"User-Agent": "GERAKI-Research/1.0"}), timeout=30) as response:
        html = response.read().decode("utf-8", errors="replace")
    parser = TextExtractor()
    parser.feed(html)
    text = unescape(" ".join(" ".join(parser.parts).split()))
    if "Archivio di Stato di Venezia" not in text:
        raise ValueError("Official archival custodian not present on record page")
    if "Estremo remoto" not in text and "Estremo recente" not in text:
        raise ValueError("No archival date metadata in rendered page; not verified")
    return {"status": "RECORD_VERIFIED", "source": "Archivio di Stato di Venezia / moreveneto",
            "scope": "known_record_url_only", "record_uuid": match.group(1),
            "record_url": url, "date_metadata_present": True,
            "custodian_confirmed": True,
            "warning": "This verifies one known catalogue description, not keyword search or an original document."}

if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("record_url")
    a = p.parse_args()
    print(json.dumps(verify_record(a.record_url), ensure_ascii=False, indent=2))
