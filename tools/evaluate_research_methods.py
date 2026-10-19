"""Compare retrieval methods on labelled cases; never calls this historical proof.

Labels must remain separate from query generation. Independent evaluation is
reported only when a dataset records its external reviewer and freeze commit.
"""
import argparse
import json
from pathlib import Path
from research_focus import fold
from research_relevance import assess, identity


def metrics(expected, actual):
    tp=sum(e and a for e,a in zip(expected,actual))
    fp=sum(not e and a for e,a in zip(expected,actual))
    fn=sum(e and not a for e,a in zip(expected,actual))
    tn=sum(not e and not a for e,a in zip(expected,actual))
    return {'true_positive':tp,'false_positive':fp,'false_negative':fn,'true_negative':tn,
            'precision':tp/(tp+fp) if tp+fp else None,'recall':tp/(tp+fn) if tp+fn else None}


def evaluate(dataset):
    expected=[];baseline=[];production=[];details=[]
    for case in dataset['cases']:
        req=case['request'];row=case['record'];ident=identity(req,req)
        expected.append(case['expected_auto_acquire'])
        text=fold(' '.join(str(row.get(k) or '') for k in ('title','description','context_excerpt')))
        baseline.append(any(fold(n) in text for n in [req['target'],*req.get('aliases',[])]))
        a=assess(row,ident);production.append(a['status']=='PRIORITY')
        details.append({'id':case['id'],'expected':expected[-1],'baseline':baseline[-1],
                        'production':production[-1],'reason':a['reasons']})
    provenance=dataset.get('evaluation_provenance') or {}
    independent=bool(provenance.get('independent_reviewer') and provenance.get('frozen_dataset_commit')
                     and provenance.get('not_used_for_development') is True)
    return {'schema':'nabou-method-comparison-v1','dataset':dataset.get('id'),
            'evaluation_type':'INDEPENDENT_LABELLED_EVALUATION' if independent else 'DEVELOPMENT_REGRESSION_ONLY',
            'evaluation_provenance':provenance,'baseline':metrics(expected,baseline),'production':metrics(expected,production),
            'cases':details,'historical_claim_accuracy':'NOT_MEASURED_BY_RETRIEVAL_LABELS',
            'exhaustive_recall':'NOT_ESTABLISHED','independent_validation_ready':independent,
            'rule':'Acquisition triage labels measure which documents deserve an attempt, not historical truth.'}


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--dataset',required=True);p.add_argument('--output',required=True)
    a=p.parse_args();report=evaluate(json.loads(Path(a.dataset).read_text()))
    Path(a.output).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:report[k] for k in ('evaluation_type','baseline','production','independent_validation_ready')}))
