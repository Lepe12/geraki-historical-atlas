"""Read-only held-out bibliography recall; query logs never count as findings."""
import argparse,hashlib,json,re,unicodedata
from pathlib import Path

def fold(text):
    return ''.join(c for c in unicodedata.normalize('NFKD',str(text)).casefold() if not unicodedata.combining(c)).replace('ς','σ')

def matches(text,reference):
    text=fold(text)
    for terms in reference['signatures']:
        hits=[list(re.finditer(re.escape(fold(term)),text)) for term in terms]
        if any(not h for h in hits):continue
        for start in hits[0]:
            lo=max(0,start.start()-600);hi=start.end()+600
            if all(any(lo<=m.start()<=hi for m in group) for group in hits[1:]):return True
    return False

def load(path):
    return json.loads(path.read_text())

def audit(root,references):
    root=Path(root);rows=[]
    inventory=[];texts=[];acquisitions=[]
    for p in sorted(root.glob('*/research_discovery/all_findings.json')):
        for row in load(p).get('findings',[]):
            # Search expressions, provider requests and queued titles are excluded.
            text=' '.join(str(row.get(k) or '') for k in ['title','description','subject','context_excerpt','snippet'])
            inventory.append((str(p),text,row.get('url')))
    for p in sorted(root.glob('*/library_acquisition/*.txt')):
        texts.append((p,p.read_text(errors='replace')))
    for p in sorted(root.glob('*/library_acquisition/acquisition_report.json')):
        acquisitions.extend((p.parent.parent,row) for row in load(p).get('results',[]))
    for reference in references:
        mentions=[];acquired=[]
        for path,text,url in inventory:
            if matches(text,reference):mentions.append({'path':path,'url':url,'basis':'RETRIEVED_SOURCE_METADATA'})
        for path,text in texts:
            if matches(text,reference):mentions.append({'path':str(path),'basis':'REFERENCE_IN_ACQUIRED_TEXT','sha256':hashlib.sha256(text.encode()).hexdigest()})
        for base,row in acquisitions:
            if not matches(row.get('title') or '',reference):continue
            # A title inside someone else's bibliography is never acquisition
            # of the cited work. Require matching acquisition metadata + a file.
            material_type=(row.get('web_acquisition') or {}).get('source_type')
            if material_type not in ('PDF_TEXT','EPUB_TEXT','OCR_TEXT') and row.get('status')!='OCR_ACQUIRED':continue
            for file in row.get('files') or []:
                p=base/file
                if p.resolve().is_relative_to(base.resolve()) and p.suffix=='.txt' and p.is_file() and p.stat().st_size:
                    acquired.append({'path':str(p),'url':row.get('url'),'title':row.get('title'),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'identity':'METADATA_MATCH_REQUIRES_BIBLIOGRAPHIC_REVIEW'})
        rows.append({'id':reference['id'],'title':reference['title'],'mentioned':bool(mentions),'work_text_acquired':bool(acquired),'mentions':mentions,'acquisitions':acquired})
    return {'schema':'pct-reference-recall-audit-v1','run_id':root.name,'references':rows,
            'mentioned_count':sum(r['mentioned'] for r in rows),'acquired_work_count':sum(r['work_text_acquired'] for r in rows),
            'reference_count':len(rows),'limitations':['PARTIAL_HELD_OUT_BIBLIOGRAPHY_NOT_EXHAUSTIVE_GOLD_STANDARD','OCR_CAN_HIDE_REFERENCES','ACQUIRED_METADATA_MATCH_IS_NOT_ORIGINAL_INSPECTION','LANDING_PAGE_TEXT_DOES_NOT_COUNT_AS_WORK_TEXT','MENTIONS_ARE_NOT_INDEPENDENT_CORROBORATION']}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',required=True);p.add_argument('--references',required=True);p.add_argument('--output',required=True);a=p.parse_args()
    out=audit(a.root,load(Path(a.references))['references']);Path(a.output).write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:out[k] for k in ['run_id','mentioned_count','acquired_work_count','reference_count']}))
