#!/usr/bin/env python3
"""Official Bayerische Staatsbibliothek Alma SRU 1.2 catalogue connector."""
import urllib.parse,urllib.request,xml.etree.ElementTree as ET

BSB_SRU="https://bsb.alma.exlibrisgroup.com/view/sru/49BVB_BSB"
def search_bsb(query,maximum=20):
 params={"version":"1.2","operation":"searchRetrieve","query":f'all_for_ui="{query}"',"maximumRecords":str(min(maximum,50)),"recordSchema":"marcxml"}
 url=BSB_SRU+"?"+urllib.parse.urlencode(params)
 req=urllib.request.Request(url,headers={"User-Agent":"PCT-Historical-Research/2.4","Accept":"application/xml"})
 with urllib.request.urlopen(req,timeout=45) as r: root=ET.fromstring(r.read())
 diagnostics=root.findall(".//{http://www.loc.gov/zing/srw/}diagnostic")
 if diagnostics: raise RuntimeError("SRU_DIAGNOSTIC: "+" ".join(" ".join(d.itertext())[:300] for d in diagnostics))
 out=[]
 for rec in root.findall(".//{http://www.loc.gov/zing/srw/}record"):
  marc=rec.find(".//{http://www.loc.gov/MARC21/slim}record")
  if marc is None: continue
  def vals(tag):
   return [" ".join("".join(sf.itertext()).strip() for sf in field.findall("{http://www.loc.gov/MARC21/slim}subfield")) for field in marc.findall("{http://www.loc.gov/MARC21/slim}datafield") if field.get("tag")==tag]
  ids=[el.text for el in marc.findall("{http://www.loc.gov/MARC21/slim}controlfield") if el.get("tag") in ("001","003") and el.text]
  out.append({"repository":"BSB","title":vals("245"),"creator":vals("100")+vals("700"),"date":vals("260")+vals("264"),"identifier":ids,"source_api":BSB_SRU,"verification_status":"CATALOGUE_LEAD_ONLY"})
 return out
