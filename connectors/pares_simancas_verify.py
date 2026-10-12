"""Verify PARES descriptions attributed to Archivo General de Simancas.

Catalogue metadata verification only; not original-document inspection.
"""
import argparse,json,re,urllib.request
from html import unescape

BASE="https://pares.cultura.gob.es/ParesBusquedas20/catalogo/description/"
def verify(record_id):
    if not re.fullmatch(r"[0-9]{1,12}",str(record_id)): raise ValueError("Invalid PARES record id")
    url=BASE+str(record_id)+"/imprimir"
    req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (compatible; GERAKI-Research/1.0)"})
    with urllib.request.urlopen(req,timeout=25) as res:
        raw=res.read(2500000).decode("utf-8","replace")
    text=unescape(re.sub(r"<[^>]+>"," ",re.sub(r"<(script|style)\\b[^>]*>.*?</\\1>"," ",raw,flags=re.I|re.S)))
    text=re.sub(r"\\s+"," ",text)
    archive="Archivo General de Simancas" in text
    code=re.search(r"ES\\.47161\\.AGS(?:/[^\\s<]+)?",text)
    sign=re.search(r"Signatura\\s*:\\s*([^:]{3,110}?)(?=Fecha Creaci[oó]n|Nivel de Descripci[oó]n|C[oó]digo de Referencia|$)",text,re.I)
    result={"record_id":str(record_id),"url":BASE+str(record_id),"archive":"Archivo General de Simancas" if archive else None,"reference_code":code.group(0) if code else None,"signatura":sign.group(1).strip() if sign else None,"status":"RECORD_VERIFIED" if archive and code and sign else "NOT_VERIFIED","scope":"PARES archival catalogue description only; original document not inspected"}
    return result
if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("record_id");a=p.parse_args()
    result=verify(a.record_id);print(json.dumps(result,ensure_ascii=False,indent=2))
    if result["status"]!="RECORD_VERIFIED":raise SystemExit(1)
