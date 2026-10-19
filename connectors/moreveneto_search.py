"""Execute the shared audited catalogue connector; never historical verification."""
import argparse,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'tools'))
from connectors.repository_connectors import audited_dispatch
REPOSITORY = 'Archivio di Stato di Venezia / Moreveneto'

def search(term,**kwargs):
    status,records,detail=audited_dispatch(REPOSITORY,term,'specialist')
    return {'status':status,'repository':REPOSITORY,'query':term,'records':records,
            'diagnostic':json.loads(detail),'evidence_level':'CATALOGUE_METADATA_ONLY','verified':False}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('query');parser.add_argument('--limit',type=int,default=20);parser.add_argument('--max-pages',type=int,default=1)
    args=parser.parse_args();print(json.dumps(search(args.query),ensure_ascii=False,indent=2))
