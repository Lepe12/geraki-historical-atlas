#!/usr/bin/env python3
"""Map event OCR hits to Internet Archive leaf/page metadata and download exact scan images."""
import json,pathlib,re,urllib.request,urllib.parse,xml.etree.ElementTree as ET,datetime
hitsf=pathlib.Path("event_first_hits/event_hits.json"); acqf=pathlib.Path("library_acquisition/acquisition_report.json")
if not hitsf.exists() or not acqf.exists(): raise SystemExit("missing event hits/acquisition report")
hits=json.loads(hitsf.read_text(encoding="utf-8")).get("hits",[])
acq=json.loads(acqf.read_text(encoding="utf-8")).get("results",[])
out=pathlib.Path("exact_page_acquisition");out.mkdir(exist_ok=True)
byfile={r.get("identifier"):r for r in acq}
def fetch(url,limit=None):
 with urllib.request.urlopen(url,timeout=60) as f:return f.read() if limit is None else f.read(limit)
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
for h in hits:
 fn=h.get("file",""); ident=next((k for k in byfile if k and fn.startswith(k+"_")),None)
 if not ident:continue
 files=ia_files(ident); djvu=pick(files,"_djvu.txt"); scan=pick(files,"_scandata.xml")
 if not djvu or not scan: report.append({"hit":h,"identifier":ident,"status":"NO_PAGE_METADATA"});continue
 text=fetch("https://archive.org/download/%s/%s"%(urllib.parse.quote(ident),urllib.parse.quote(djvu))).decode("utf-8","ignore")
 pages=text.split("\f")
 needle=re.sub(r"\s+"," ",str(h.get("context",""))).strip()
 # use central distinctive 120-char fragment, then fallback matched place near event
 frag=needle[max(0,len(needle)//2-80):min(len(needle),len(needle)//2+80)]
 toks=[t for t in re.findall(r"[A-Za-zÀ-ÿ]{4,}",frag) if len(t)>4][:8]
 scores=[]
 for i,p in enumerate(pages):
  q=p.lower(); scores.append((sum(1 for t in toks if t.lower() in q),i))
 scores.sort(reverse=True);score,pi=scores[0] if scores else (0,0)
 sd=page_map_from_scandata(fetch("https://archive.org/download/%s/%s"%(urllib.parse.quote(ident),urllib.parse.quote(scan))))
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
 report.append({"identifier":ident,"source_file":fn,"hit_line":h.get("line"),"place_match":h.get("place_match"),"event_terms":h.get("event_terms"),"ocr_page_index":pi,"leaf":leaf,"printed_page":meta.get("printed_page"),"mapping_score":score,"image_url":imgurl,"image_file":str(dest) if dest.exists() else None,"status":status})
(pathlib.Path(out)/"exact_page_report.json").write_text(json.dumps({"generated_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"protocol":"PCT-EXACT-PAGE-AUTO-v1","results":report,"gate":"Mapped/downloaded page remains NEEDS_ORIGINAL_INSPECTION; do not auto-verify."},ensure_ascii=False,indent=2),encoding="utf-8")
print("exact-page mappings",len(report),"images",sum(1 for x in report if x["status"]=="PAGE_IMAGE_ACQUIRED"))
