#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib
from pathlib import Path
from naboux_memory import load,save,ingest_document

def extract(path:Path):
    ext=path.suffix.lower()
    if ext==".pdf":
        from pypdf import PdfReader
        reader=PdfReader(str(path))
        return [(i+1,page.extract_text() or "") for i,page in enumerate(reader.pages)]
    text=path.read_text(encoding="utf-8")
    return [(1,text)]

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--subject",required=True)
    p.add_argument("--document",required=True)
    p.add_argument("--memory",default="data/naboux_memory.json")
    a=p.parse_args()
    doc=Path(a.document)
    if not doc.is_file(): raise SystemExit("DOCUMENT_NOT_FOUND")
    sha=hashlib.sha256(doc.read_bytes()).hexdigest()
    mem=load(a.memory)
    doc_id,chunks=ingest_document(mem,a.subject,str(doc),extract(doc),sha)
    save(mem,a.memory)
    print(f"NABOU_MEMORY_INGESTED document_id={doc_id} chunks={chunks} verified=false")

if __name__=="__main__": main()
