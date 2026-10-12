#!/usr/bin/env python3
"""Map event OCR hits to Internet Archive leaf/page metadata and download exact scan images."""
import json,pathlib,re,urllib.request,urllib.parse,xml.etree.ElementTree as ET,datetime
from functools import lru_cache
hitsf=pathlib.Path("event_first_hits/event_hits.json"); acqf=pathlib.Path("library_acquisition/acquisition_report.json")
if not hitsf.exists() or not acqf.exists(): raise SystemExit("missing event hits/acquisition report")
all_hits=json.loads(hitsf.read_text(encoding="utf-8")).get("hits",[])
# Process the complete durable hit set. Checkpoint after every candidate so interrupted runs retain progress.\nhits=all_hits
acq=json.loads(acqf.read_text(encoding="utf-8")).get("results",[])
out=pathlib.Path("exact_page_acquisition");out.mkdir(exist_ok=True)
byfile={r.get("identifier"):r for r in acq if r.get("identifier") and (r.get("acquisition_route")=="INTERNET_ARCHIVE" or str(r.get("discovery_repository") or r.get("repository") or "").lower().startswith("internet archive"))}
@lru_cache(maxsize=24)
def fetch(url,limit=None):
 with urllib.request.urlopen(url,timeout=12) as f:return f.read() if limit is None else f.read(limit)
@lru_cache(maxsize=16)
def ia_files(ident):
 return json.loads(fetch("https://archive.org/metadata/"+urllib.parse.quote(ident)).decode("utf-8")).get("files",[])
def pick(files,suffix):
 for x in files:
  n=str(x.get("name",""))
  if n.lower().endswith(suffix):return n
def page_map_from_scandata(data):
 root=ET.fromstring(data); arr=[]
 for i,p in enumerate(root.findall(".//pageData/page")):
  leaf=p.get("leafNum") or str(i); pd=p.find("pageNumber"); pn=(pd.text.strip() if pd is not None and pd.text else None)
  arr.append({"leaf":int(leaf),"printed_page":pn})
 return arr
# OCR line is approximate. DjVu text commonly separates pages with form-feed; map hit context to page by unique context snippet.
report=[]
def checkpoint():
 (out/"exact_page_report.json").write_text(json.dumps({
  "generated_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
  "protocol":"PCT-EXACT-PAGE-AUTO-v3","results":report,
  "total_event_hits":len(all_hits),"selected_page_hits":len(hits),
  "processed_page_hits":len(report),"completed":len(report)>=len(hits),
  "deferred_page_hits":max(0,len(all_hits)-len(hits)),
  "gate":"Mapped/downloaded page remains NEEDS_ORIGINAL_INSPECTION; do not auto-verify."
 },ensure_ascii=False,indent=2),encoding="utf-8")
checkpoint()
for h in hits:
 fn=h.get("file",""); ident=next((k for k in byfile if k and fn.startswith(k+"_")),None)
 if not ident:\n  report.append({"hit":h,"identifier":None,"status":"NO_ACQUIRED_SOURCE_MAPPING","verification_status":"NEEDS_EVIDENCE"});checkpoint();continue
 try:
  files=ia_files(ident)
 except Exception as e:
  report.append({"hit":h,"identifier":ident,"status":"METADATA_FETCH_ERROR:"+str(e)});checkpoint();continue
 djvu=pick(files,"_djvu.txt"); scan=pick(files,"_scandata.xml")
 if not djvu or not scan: report.append({"hit":h,"identifier":ident,"status":"NO_PAGE_METADATA"});checkpoint();continue
 try:
  text=fetch("https://archive.org/download/%s/%s"%(urllib.parse.quote(ident),urllib.parse.quote(djvu))).decode("utf-8","ignore")
 except Exception as e:
  report.append({"hit":h,"identifier":ident,"status":"OCR_FETCH_ERROR:"+str(e)});checkpoint();continue
 pages=text.split("\f")
 needle=re.sub(r"\s+"," ",str(h.get("context",""))).strip()
 # use central distinctive 120-char fragment, then fallback matched place near event
 frag=needle[max(0,len(needle)//2-80):min(len(needle),len(needle)//2+80)]
 toks=[t for t in re.findall(r"[A-Za-zÀ-ÿ]{4,}",frag) if len(t)>4][:8]
 scores=[]
 for i,p in enumerate(pages):
  q=p.lower(); scores.append((sum(1 for t in toks if t.lower() in q),i))
 scores.sort(key=lambda x:(x[0],-x[1]),reverse=True);score,pi=scores[0] if scores else (0,0)
 # Never guess a page from a zero/weak lexical match. This prevents false leaf/page mappings.
 if score < 2:
  report.append({"hit":h,"identifier":ident,"status":"PAGINATION_UNRESOLVED_LOW_CONTEXT_SCORE","mapping_score":score,"verification_status":"NEEDS_EVIDENCE"});checkpoint();continue
 try:
  sd=page_map_from_scandata(fetch("https://archive.org/download/%s/%s"%(urllib.parse.quote(ident),urllib.parse.quote(scan))))
 except Exception as e:
  report.append({"hit":h,"identifier":ident,"status":"SCANDATA_FETCH_ERROR:"+str(e)});checkpoint();continue
 meta=sd[pi] if pi<len(sd) else {"leaf":pi,"printed_page":None};leaf=meta["leaf"]
 # IA BookReaderPreview image endpoint, leaf-specific
 imgurl=f"https://archive.org/download/{urllib.parse.quote(ident)}/page/n{leaf}/mode/1up?view=theater"
 dest=out/f"{ident}_leaf_{leaf}.jpg"
 status="MAPPED"
 try:
  data=fetch(imgurl)
  if data[:2]==b"\xff\xd8" or data[:8]==b"\x89PNG\r\n\x1a\n":dest.write_bytes(data);status="PAGE_IMAGE_ACQUIRED"
  else: status="IMAGE_ENDPOINT_UNAVAILABLE"
 except Exception as e: status="IMAGE_DOWNLOAD_ERROR:"+str(e)
 report.append({"identifier":ident,"discovery_repository":"Internet Archive","discovery_lane":byfile.get(ident,{}).get("discovery_lane"),"source_file":fn,"hit_line":h.get("line"),"place_match":h.get("place_match"),"event_terms":h.get("event_terms"),"ocr_page_index":pi,"leaf":leaf,"printed_page":meta.get("printed_page"),"mapping_score":score,"image_url":imgurl,"image_file":str(dest) if dest.exists() else None,"status":status,"verification_status":"NEEDS_ORIGINAL_INSPECTION"});checkpoint()
checkpoint()
print("exact-page mappings",len(report),"images",sum(1 for x in report if x["status"]=="PAGE_IMAGE_ACQUIRED"))
