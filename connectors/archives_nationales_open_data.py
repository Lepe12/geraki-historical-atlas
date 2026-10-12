"""Archives nationales open-data finding-aid search; not full catalogue coverage."""
import argparse
import csv
import io
import json
import unicodedata
from urllib.request import Request, urlopen

DATASET_API = "https://www.data.gouv.fr/api/1/datasets/liste-des-inventaires-des-archives-nationales-publies-en-ligne/"
FIELDS = ("fran_ir", "titre", "cotes", "intitulé", "dates", "producteur", "documents_numérisés", "url_slv", "fichier_xml")

def fetch(url, timeout=30):
    with urlopen(Request(url, headers={"User-Agent": "GERAKI-Historical-Atlas/1.0"}), timeout=timeout) as response:
        return response.read()

def normalize(value):
    value = unicodedata.normalize("NFKD", str(value or ""))
    return "".join(c for c in value if not unicodedata.combining(c)).casefold()

def search_csv(csv_text, query, limit=20):
    sample = csv_text.lstrip("\ufeff")
    try:
        dialect = csv.Sniffer().sniff(sample[:8192], delimiters=",;\t")
        delimiter = dialect.delimiter
    except csv.Error:
        delimiter = ","
    reader = csv.DictReader(io.StringIO(sample), delimiter=delimiter)
    if not reader.fieldnames or "fran_ir" not in reader.fieldnames:
        raise ValueError("Unexpected inventory CSV schema: " + str(reader.fieldnames))
    terms = [normalize(term) for term in query.split() if term.strip()]
    matches = []
    for row in reader:
        haystack = normalize(" ".join(str(row.get(k, "") or "") for k in FIELDS))
        if all(term in haystack for term in terms):
            matches.append({k: row.get(k, "") for k in FIELDS})
            if len(matches) >= limit:
                break
    return matches

def search(query, limit=20):
    if not query.strip():
        raise ValueError("Search query must not be empty")
    if not 1 <= limit <= 100:
        raise ValueError("limit must be between 1 and 100")
    metadata = json.loads(fetch(DATASET_API))
    resources = [r for r in metadata.get("resources", []) if str(r.get("format", "")).lower() == "csv" and r.get("url")]
    if not resources:
        raise RuntimeError("No official CSV resource returned by data.gouv.fr")
    url = resources[0]["url"]
    records = search_csv(fetch(url, timeout=90).decode("utf-8-sig"), query, limit)
    return {"source": "Archives nationales (France) — published inventory list",
            "scope": "open_data_finding_aids_only", "status": "EXECUTED",
            "dataset": DATASET_API, "resource": url, "query": query,
            "hits": len(records), "records": records,
            "warning": "Finding-aid matches are not verified primary documents; no full catalogue coverage is implied."}

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("query")
    parser.add_argument("--limit", type=int, default=20)
    args = parser.parse_args()
    print(json.dumps(search(args.query, args.limit), ensure_ascii=False, indent=2))
