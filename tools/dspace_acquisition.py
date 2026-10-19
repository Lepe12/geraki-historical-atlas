"""Follow public DSpace 7 HAL links to ORIGINAL files; never use credentials."""
import json
import urllib.request
from urllib.parse import urlsplit
from web_acquisition import public_url,Redirects

def json_get(url):
    url=public_url(url)
    req=urllib.request.Request(url,headers={'User-Agent':'NABOU-Historical-Research/4.0','Accept':'application/hal+json,application/json'})
    with urllib.request.build_opener(Redirects()).open(req,timeout=20) as response:
        return json.loads(response.read(4_000_000))

def documents(item_url,getter=json_get):
    item=getter(item_url)
    bundles_url=(item.get('_links',{}).get('bundles') or {}).get('href')
    if not bundles_url:return []
    host=urlsplit(item_url).hostname
    def same_origin(url):
        if urlsplit(url).hostname!=host:raise ValueError('DSPACE_CROSS_HOST_CONTENT_LINK')
        return public_url(url,resolve=False)
    bundles=getter(same_origin(bundles_url));out=[]
    for bundle in bundles.get('_embedded',{}).get('bundles',[]):
        if bundle.get('name')!='ORIGINAL':continue
        link=(bundle.get('_links',{}).get('bitstreams') or {}).get('href')
        if not link:continue
        streams=getter(same_origin(link))
        for stream in streams.get('_embedded',{}).get('bitstreams',[]):
            content=(stream.get('_links',{}).get('content') or {}).get('href')
            if content and str(stream.get('name','')).lower().endswith(('.pdf','.txt')):
                out.append({'url':same_origin(content),'name':stream.get('name'),'item_url':item_url})
    return out[:2]
