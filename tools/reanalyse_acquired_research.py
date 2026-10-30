"""Real model reanalysis of immutable acquired sources, separately from discovery."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
from semantic_research_answer import execute, read, render
from research_geographic_findings import build as geographic
from research_validation_report import build as validate


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--run-id',required=True)
    parser.add_argument('--resume-reviewed-claims',action='store_true')
    # Opt-in parallel reading (semantic_shards > 1); default = one job, unchanged.
    mode=parser.add_mutually_exclusive_group()
    mode.add_argument('--prepare-only',action='store_true',help='derive the shared inputs once for every shard')
    mode.add_argument('--shard',help='I/N: read only this round-robin slice of unread batches (0-based)')
    mode.add_argument('--merge-shards',type=int,help='N: replay all shard extractions and write the one answer')
    mode.add_argument('--replay-shards-from',help='Replay an existing analysis shard set; no new extraction')
    args=parser.parse_args()
    job=os.environ['GITHUB_RUN_ID']
    if not re.fullmatch(r'\d+',args.run_id) or not re.fullmatch(r'\d+',job):
        raise ValueError('NUMERIC_RUN_IDS_REQUIRED')
    parent=Path('evidence/runs')/args.run_id
    dest=parent/('semantic_reanalysis_'+job)
    if args.shard or args.merge_shards:
        if args.resume_reviewed_claims:raise ValueError('SHARDS_DO_NOT_SUPPORT_RESUME')
        if not (dest/'derived_sources').is_dir():raise ValueError('SHARD_INPUTS_NOT_PREPARED')
        if args.shard:return run_shard(args,job,parent,dest)
        try:
            run(args,job,parent,dest)
        finally:
            if (dest/'derived_sources').is_dir():
                from derived_source_store import compact
                print(json.dumps({'derived_source_store':compact(parent,dest)}))
        return
    dest.mkdir(exist_ok=False)
    if args.prepare_only:
        if args.resume_reviewed_claims:raise ValueError('SHARDS_DO_NOT_SUPPORT_RESUME')
        request=read(sorted(parent.glob('*/run_manifest/manifest.json'))[0])['normalized_request']
        from prepare_acquired_analysis import prepare
        prepare(parent,dest/'derived_sources',request)
        print(json.dumps({'shard_inputs_prepared':str(dest)}))
        return
    try:
        run(args,job,parent,dest)
    finally:
        # Store derived inputs once by SHA-256 instead of a new ~95 MB copy per
        # pass; also on failure, so a failed pass is published compactly too.
        if (dest/'derived_sources').is_dir():
            from derived_source_store import compact
            print(json.dumps({'derived_source_store':compact(parent,dest)}))


def question_of(request):
    question=request['target']+(' ('+request['date_range']+')' if request.get('date_range') else '')
    if request.get('purpose'):question+='\nResearch scope: '+request['purpose']
    return question


def shard_summary(answer,index,count):
    funnel=answer.get('research_funnel') or {}
    report=answer.get('semantic_shard') or {}
    return {'index':index,'count':count,'status':answer.get('status'),
            'assigned_batches':report.get('assigned_batches',0),'selected_batches':report.get('selected_batches',0),
            'selected_excerpts':report.get('selected_excerpts',0),
            'examined_excerpts':(funnel.get('examined') or {}).get('excerpts',0),
            'extracted_claims':len(answer.get('claims') or []),
            'model_calls':len(answer.get('calls') or []),
            'new_model_calls':sum(not c.get('replayed') for c in answer.get('calls') or []),
            'claim_reviews':len(answer.get('claim_reviews') or [])}


def run_shard(args,job,parent,dest):
    match=re.fullmatch(r'(\d+)/(\d+)',args.shard or '')
    if not match:raise ValueError('INVALID_SHARD')
    index,count=int(match.group(1)),int(match.group(2))
    request=read(sorted(parent.glob('*/run_manifest/manifest.json'))[0])['normalized_request']
    os.environ['PCT_SEMANTIC_SHARD']='%d/%d'%(index,count)
    out=dest/'shards'/('shard_%d'%index)
    out.mkdir(parents=True,exist_ok=True)
    # Same derived inputs and queue as the merge pass; extraction batches and
    # model responses are saved in research_continuation/ for the merge replay.
    answer=execute(dest/'derived_sources',question_of(request),output_root=out,provenance_root=parent)
    summary=shard_summary(answer,index,count)
    (out/'shard_summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(summary,ensure_ascii=False))


def merge_summary(dest,count):
    shards=[]
    for index in range(count):
        path=dest/'shards'/('shard_%d'%index)/'shard_summary.json'
        try:shards.append(json.loads(path.read_text()))
        except (OSError,ValueError):shards.append({'index':index,'count':count,'status':'SHARD_OUTPUT_MISSING'})
    keys=('selected_batches','selected_excerpts','examined_excerpts','extracted_claims','model_calls','new_model_calls','claim_reviews')
    return {'policy':'round-robin-by-rank-v1','count':count,'shards':shards,
            'total':{k:sum(s.get(k,0) for s in shards) for k in keys},
            'missing_shards':[s['index'] for s in shards if s.get('status')=='SHARD_OUTPUT_MISSING'],
            'role':'PARALLEL_READING_METRICS_NOT_HISTORICAL_VERIFICATION'}


def run(args,job,parent,dest):
    manifests=sorted(parent.glob('*/run_manifest/manifest.json'))
    request=read(manifests[0])['normalized_request']
    question=request['target']+(' ('+request['date_range']+')' if request.get('date_range') else '')
    receipt={'parent_run_id':args.run_id,'analysis_run_id':job,
             'execution_type':'REAL_MODEL_REANALYSIS_OF_ACQUIRED_SOURCES_NOT_NEW_DISCOVERY',
             'software_revision':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
             'original_lane_outputs_modified':False}
    if args.resume_reviewed_claims:receipt['execution_type']='RESUME_REPLAYED_EXTRACTION_WITH_NEW_CLAIM_REVIEWS_SYNTHESIS_AND_FINAL_REVIEW_NOT_NEW_DISCOVERY'
    (dest/'execution_receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    from prepare_acquired_analysis import prepare
    prepared=parent if args.resume_reviewed_claims else dest/'derived_sources'
    replay_from=getattr(args,'replay_shards_from',None)
    merge=bool(getattr(args,'merge_shards',None) or replay_from)
    if replay_from and args.resume_reviewed_claims:raise ValueError('SHARDS_DO_NOT_SUPPORT_RESUME')
    if replay_from:
        prepare(parent,prepared,request)
        from research_continuation import Continuation
        from semantic_research_answer import routing_summary
        from research_shard_replay import recover
        queue=Continuation(parent/'research_continuation',question_of(request),
                           Path(__file__).with_name('semantic_research_answer.py').read_bytes(),routing_summary())
        recovery=recover(parent,replay_from,queue)
        (dest/'shard_replay_recovery.json').write_text(json.dumps(recovery,ensure_ascii=False,indent=2)+'\n')
        args.merge_shards=recovery['shard_count']
        receipt['replayed_analysis_id']=replay_from
        receipt['new_extraction_calls_allowed']=False
    if merge:
        receipt['execution_type']='SHARDED_REAL_MODEL_REANALYSIS_MERGE_NOT_NEW_DISCOVERY'
        receipt['semantic_shards']=args.merge_shards
        os.environ['PCT_SEMANTIC_MERGE']='1';os.environ.pop('PCT_SEMANTIC_SHARD',None)
    elif not args.resume_reviewed_claims:prepare(parent,prepared,request)
    (dest/'execution_receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    if request.get('purpose'):question+='\nResearch scope: '+request['purpose']
    answer=execute(prepared,question,output_root=dest,provenance_root=parent,
                   resume_reviewed_from=parent/'research_answer/answer.json' if args.resume_reviewed_claims else None)
    answer['execution_receipt']=receipt
    if merge:
        summary_root=parent/('semantic_reanalysis_'+replay_from) if replay_from else dest
        answer['semantic_shards']=merge_summary(summary_root,args.merge_shards)
        if replay_from:
            answer['semantic_shards']['replayed_analysis_id']=replay_from
            answer['shard_replay_recovery']=recovery
    # Per-round coverage metrics and the clean stop decision travel with the
    # published answer; the handoff guard reads the same ledger.
    from continuation_rounds import record, round_number
    answer['continuation_rounds']=record(parent,answer,round_number(parent,dest.name),str(dest.relative_to(parent)))
    out=dest/'research_answer';out.mkdir(exist_ok=True)
    for filename,value in [('answer.json',answer),('geographic_findings.json',geographic(answer))]:
        (out/filename).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
    (out/'answer.md').write_text(render(answer))
    from persistent_evidence_bundle import write as write_bundle
    write_bundle(out/'historical_evidence_bundle.json',answer)
    report=validate(parent,analysis_root=dest)
    (out/'validation_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    from research_continuation import atomic
    atomic(parent/'research_continuation/latest.json',{
        'analysis_path':str(dest.relative_to(parent)),
        'answer_sha256':hashlib.sha256((out/'answer.json').read_bytes()).hexdigest(),
        'validation_sha256':hashlib.sha256((out/'validation_report.json').read_bytes()).hexdigest()})
    print(json.dumps({'status':report['status'],'counts':report['counts'],'blockers':report['blockers']}))
    if report['status']=='INCOMPLETE':raise SystemExit(1)


if __name__=='__main__':main()
