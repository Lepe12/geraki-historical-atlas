#!/usr/bin/env python3
"""Official Bayerische Staatsbibliothek Alma SRU 1.2 catalogue connector."""
import urllib.parse,urllib.request,urllib.error,xml.etree.ElementTree as ET,time

BSB_SRU="https://bsb.alma.exlibrisgroup.com/view/sru/49BVB_BSB"
def search_bsb(query,maximum=20):
 params={"version":"1.2","operation":"searchRetrieve","query":f'all_for_ui="{query}"',"maximumRecords":str(min(maximum,50)),"recordSchema":"marcxml"}
 url=BSB_SRU+"?"+urllib.parse.urlencode(params)
 req=urllib.request.Request(url,headers={"User-Agent":"PCT-Historical-Research/2.4","Accept":"application/xml"})
 last=None
 for attempt in range(1,4):
  try:
   print(f"BSB SRU attempt {attempt}/3 query={query!r}",flush=True)
   with urllib.request.urlopen(req,timeout=12) as r:
    payload=r.read()
   print(f"BSB SRU HTTP success bytes={len(payload)}",flush=True)
   root=ET.fromstring(payload)
   break
  except Exception as e:
   last=e
   print(f"BSB SRU attempt {attempt} failed: {type(e).__name__}: {e}",flush=True)
   if attempt<3: time.sleep(attempt*2)
 else:
  raise RuntimeError(f"BSB_SRU_FAILED_AFTER_RETRIES: {type(last).__name__}: {last}")
 diagnostics=root.findall(".//{http://www.loc.gov/zing/srw/}diagnostic")
 if diagnostics: raise RuntimeError("SRU_DIAGNOSTIC: "+" ".join(" ".join(d.itertext())[:300] for d in diagnostics))
 out=[]
 for rec in root.findall(".//{http://www.loc.gov/zing/srw/}record"):
  marc=rec.find(".//{http://www.loc.gov/MARC21/slim}record")
  if marc is None: continue
  def vals(tag):
   return [" ".join("".join(sf.itertext()).strip() for sf in field.findall("{http://www.loc.gov/MARC21/slim}subfield")) for field in marc.findall("{http://www.loc.gov/MARC21/slim}datafield") if field.get("tag")==tag]
  ids=[el.text for el in marc.findall("{http://www.loc.gov/MARC21/slim}controlfield") if el.get("tag") in ("001","003") and el.text]
  links=[]
  for field in marc.findall("{http://www.loc.gov/MARC21/slim}datafield"):
   if field.get("tag")=="856":
    links += [sf.text for sf in field.findall("{http://www.loc.gov/MARC21/slim}subfield") if sf.get("code")=="u" and sf.text]
  import re
  bsbids=list(dict.fromkeys(v for link in links for v in re.findall(r"bsb[0-9]{7,}",link,re.I)))
  manifests=["https://api.digitale-sammlungen.de/iiif/presentation/v2/"+v+"/manifest" for v in bsbids]
  out.append({"repository":"BSB","title":vals("245"),"creator":vals("100")+vals("700"),"date":vals("260")+vals("264"),"identifier":ids,"digital_links":links,"bsb_digital_ids":bsbids,"iiif_manifest_candidates":manifests,"source_api":BSB_SRU,"verification_status":"CATALOGUE_LEAD_ONLY"})
 return out
