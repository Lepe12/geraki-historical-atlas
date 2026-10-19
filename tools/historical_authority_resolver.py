"""Explainable contextual candidates. Similarity never establishes identity."""
from difflib import SequenceMatcher
import hashlib
import json
import math
import unicodedata
try:from tools.historical_attestations import MatchCandidate, freeze_candidate_set
except ModuleNotFoundError:from historical_attestations import MatchCandidate, freeze_candidate_set

VERSION='nabou-contextual-authority-v1'
WEIGHTS={'lexical':.35,'chronology':.2,'language':.05,'geography':.15,
         'people':.08,'ships':.05,'institutions':.06,'relationships':.06}


def normalized(value):
    return ' '.join(''.join(c for c in unicodedata.normalize('NFKD',value.casefold()) if not unicodedata.combining(c)).replace('ς','σ').split())


def coordinates(value):
    if not isinstance(value,dict):return None
    lon,lat=value.get('longitude'),value.get('latitude')
    if any(type(x) not in (int,float) or not math.isfinite(x) for x in (lon,lat)) or not -180<=lon<=180 or not -90<=lat<=90:
        raise ValueError('Invalid sourced WGS84 coordinate')
    return lon,lat


def distance_m(first,second):
    lon1,lat1=map(math.radians,first);lon2,lat2=map(math.radians,second)
    value=math.sin((lat2-lat1)/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 6371008.8*2*math.asin(min(1,math.sqrt(value)))


def compare(mention,authority):
    components={k:None for k in WEIGHTS};conflicts=[]
    left=[normalized(x) for x in mention.get('names',[]) if x.strip()]
    right=[normalized(x) for x in authority.get('names',[]) if x.strip()]
    components['lexical']=max((SequenceMatcher(None,a,b).ratio() for a in left for b in right),default=0)
    if mention.get('entity_type')!=authority.get('entity_type'):conflicts.append('ENTITY_TYPE_CONFLICT')
    a,b=mention.get('historical_interval'),authority.get('historical_interval')
    if a and b and all(type(x) is int for x in [a.get('start'),a.get('end'),b.get('start'),b.get('end')]):
        if a['start']>a['end'] or b['start']>b['end']:raise ValueError('Invalid historical interval')
        overlap=min(a['end'],b['end'])-max(a['start'],b['start'])+1
        components['chronology']=1.0 if overlap>0 else 0.0
        if overlap<=0:conflicts.append('DISJOINT_HISTORICAL_INTERVALS')
    for field,component in [('languages','language'),('people','people'),('ships','ships'),('institutions','institutions'),('relationships','relationships')]:
        a,b=set(mention.get(field,[])),set(authority.get(field,[]))
        if a and b:components[component]=len(a&b)/len(a|b)
    a,b=mention.get('location'),authority.get('location')
    if a and b:
        first,second=coordinates(a),coordinates(b)
        radius=max(1000,(a.get('uncertainty_radius_m') or 0)+(b.get('uncertainty_radius_m') or 0))
        components['geography']=math.exp(-distance_m(first,second)/radius)
    if not authority.get('citation_ids'):conflicts.append('UNSOURCED_AUTHORITY')
    observed=sum(WEIGHTS[k] for k,v in components.items() if v is not None)
    # Missing context contributes no positive evidence. This is a ranking score,
    # not a probability of historical identity, and exact names alone score .35.
    score=sum(WEIGHTS[k]*v for k,v in components.items() if v is not None)
    if conflicts:score=min(score,.2)
    return {'subject_id':mention['id'],'object_id':authority['id'],'score':round(score,5),
            'algorithm':VERSION,'components':components,'observed_weight':round(observed,5),
            'missing_context':[k for k,v in components.items() if v is None],
            'conflicts':conflicts,'status':'CONTEXT_CONFLICT' if conflicts else 'CANDIDATE_REQUIRES_REVIEW',
            'citation_ids':authority.get('citation_ids',[]),'automatic_merge':False,'historically_verified':False}


def resolve(mentions,authorities,run_id):
    rows=[compare(m,a) for m in mentions for a in authorities]
    rows.sort(key=lambda r:(r['subject_id'],-r['score'],r['object_id']))
    fingerprints={'mentions_sha256':hashlib.sha256(json.dumps(mentions,sort_keys=True,ensure_ascii=False).encode()).hexdigest(),
                  'authorities_sha256':hashlib.sha256(json.dumps(authorities,sort_keys=True,ensure_ascii=False).encode()).hexdigest(),
                  'weights':WEIGHTS,'automatic_merge':False}
    snapshot=freeze_candidate_set([MatchCandidate(r['subject_id'],r['object_id'],r['score'],VERSION) for r in rows],run_id,fingerprints)
    for candidate,row in zip(snapshot['candidates'],rows):candidate['explanation']=row
    return snapshot
