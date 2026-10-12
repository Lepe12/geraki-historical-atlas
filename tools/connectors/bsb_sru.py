#!/usr/bin/env python3
"""BSB SRU connector: catalogue discovery only; digital-object/IIIF chase follows separately."""
import urllib.parse,urllib.request,xml.etree.ElementTree as ET
def search_bsb(query,maximum=20):
 params={"version":"1.1","operation":"searchRetrieve","query":f'dc.anywhere="{query}"',"maximumRecords":str(maximum),"recordSchema":"dc"}
 url="https://gateway-bayern.de/sru?"+urllib.parse.urlencode(params)
 req=urllib.request.Request(url,headers={"User-Agent":"PCT-Historical-Research/2.3"})
 with urllib.request.urlopen(req,timeout=45) as r: root=ET.fromstring(r.read())
 ns={"srw":"http://www.loc.gov/zing/srw/","dc":"http://purl.org/dc/elements/1.1/"}
 out=[]
 for rec in root.findall(".//srw:record",ns):
  d=rec.find(".//srw:recordData",ns)
  if d is None: continue
  def vals(tag): return [x.text for x in d.findall(".//dc:"+tag,ns) if x.text]
  out.append({"repository":"BSB/Bavarian Union Catalogue","title":vals("title"),"creator":vals("creator"),"date":vals("date"),"identifier":vals("identifier"),"type":vals("type")})
 return out
