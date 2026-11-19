#!/usr/bin/env python3
"""Read-only source tracing for owner-selected public CC0 Niki voice. No credentials or deployment."""
import html
import json
import re
import urllib.request
import urllib.error
from urllib.parse import urljoin

URL="https://ditto.audio/voices/pocket-el-niki"
def get(url):
    try:
        req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (N7-voice-verifier; read-only)","Accept":"text/html,application/json,*/*"})
        with urllib.request.urlopen(req,timeout=25) as r:
            return r.status,r.geturl(),r.read(3_000_000).decode("utf-8","replace")
    except urllib.error.HTTPError as e:return e.code,url,e.read(3000).decode("utf-8","replace")
    except Exception as e:return 0,url,type(e).__name__+": "+str(e)[:100]
def main():
    for url in [URL,"https://ditto.audio/v1/models/pocket-el-niki","https://ditto.audio/v1/models/pocket-el-niki/download","https://ditto.audio/v1/audio/voices/pocket-el-niki"]:
        status,real,page=get(url)
        print("N7_VOICE_SOURCE_HTTP",json.dumps({"url":url,"status":status,"bytes":len(page)},ensure_ascii=False),flush=True)
        if status != 200:continue

        if url.endswith("/download") and status==200:
            try:
                data=json.loads(page)
                if isinstance(data,dict):
                    safe={k:v for k,v in data.items() if k not in ("files","url","downloadUrl")}
                    if isinstance(data.get("files"),list):
                        safe["files"]=[{k:v for k,v in f.items() if not any(z in k.lower() for z in ("url","token","secret"))} for f in data["files"]]
                    print("N7_VOICE_DOWNLOAD_MANIFEST",json.dumps(safe,ensure_ascii=False)[:2500],flush=True)
            except Exception: pass
        if url==URL:
            for term in ["pocket-el-niki","Niki","CC0-1.0","reference","voiceSamples","audio"]:
                at=page.lower().find(term.lower())
                if at>=0:print("N7_VOICE_SOURCE_CONTEXT",json.dumps({"term":term,"context":html.unescape(page[max(0,at-170):at+370])[:550]},ensure_ascii=False),flush=True)
            candidates=set()
            for match in re.findall(r'(?:(?:https?:)?\\/\\/|/)[^<>\\"\s]{1,260}?(?:\\.wav|\\.mp3|\\.flac|\\.ogg)(?:[?][^<>\\"\s]{0,80})?',page,re.I):
                candidates.add(html.unescape(match).replace('\\u0026','&'))
            for match in re.findall(r'(?:https?://|/)[^<>\\"\s]{0,300}(?:niki|pocket-el)[^<>\\"\s]{0,180}',page,re.I):
                candidates.add(html.unescape(match))
            print("N7_VOICE_PUBLIC_ASSET_CANDIDATES",json.dumps(sorted(candidates)[:30],ensure_ascii=False),flush=True)
            scripts=re.findall(r'<script[^>]+src=["\']([^"\']+)["\']',page)
            print("N7_VOICE_SCRIPT_COUNT",len(scripts))
            for s in scripts[:8]:print("N7_VOICE_SCRIPT",urljoin(URL,s).split("?")[0])
        else:
            try:
                data=json.loads(page)
                if isinstance(data,dict):
                    def safe(v):
                        if isinstance(v,dict):return {k:safe(x) for k,x in v.items() if not any(word in k.lower() for word in ("token","secret","password","email"))}
                        if isinstance(v,list):return [safe(x) for x in v[:4]]
                        return str(v)[:180]
                    print("N7_VOICE_PUBLIC_API_FIELDS",json.dumps(safe(data),ensure_ascii=False)[:2800],flush=True)
            except json.JSONDecodeError:print("N7_VOICE_API_NON_JSON",page[:140])
if __name__=="__main__":main()
