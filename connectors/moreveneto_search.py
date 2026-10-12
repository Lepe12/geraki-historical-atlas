"""Minimal public moreveneto GraphQL autocomplete connector."""
import argparse,json
from urllib.request import Request,urlopen
ENDPOINT="https://aw-unifi-graphql.netseven.it/"
QUERY="""{ autoComplete(input: "__INPUT__", itemsPagination: {offset: 0, limit: __LIMIT__}) {
 totalCount
 results {
  ... on EntityCountData { count entity { id label typeOfEntity } }
  ... on ItemListing { item { id label document_type } }
 }
}}"""
def esc(s): return s.replace("\\","\\\\").replace('"','\\"')
def search(term,limit=10):
 q=QUERY.replace("__INPUT__",esc(term)).replace("__LIMIT__",str(int(limit)))
 req=Request(ENDPOINT,data=json.dumps({"query":q}).encode(),headers={"Content-Type":"application/json","User-Agent":"GERAKI-Research/1.0"},method="POST")
 with urlopen(req,timeout=30) as r: data=json.load(r)
 if data.get("errors"): raise RuntimeError(data["errors"])
 result=data.get("data",{}).get("autoComplete")
 if result is None: raise RuntimeError("Missing autoComplete response")
 return {"status":"EXECUTED","source":"Archivio di Stato di Venezia / moreveneto","scope":"public_graphql_autocomplete","query":term,"totalCount":result.get("totalCount",0),"results":result.get("results",[]),"warning":"Catalogue discovery only; not verification of an original archival document."}
if __name__=="__main__":
 p=argparse.ArgumentParser();p.add_argument("query");p.add_argument("--limit",type=int,default=10);a=p.parse_args()
 print(json.dumps(search(a.query,a.limit),ensure_ascii=False,indent=2))
