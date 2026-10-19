"""Evidence-linked JSON-LD and historical GIS exports, without renderer changes.

Uses a local vocabulary plus Schema.org/PROV. No PLATO conformance or SPARQL
service is implied; every historical relationship requires a citation.
"""
import hashlib
import json
import math
from urllib.parse import quote
try:from tools.historical_authority_resolver import coordinates
except ModuleNotFoundError:from historical_authority_resolver import coordinates

TYPES={'Person','Place','Ship','Institution','Event','Source','Citation','Attestation','Relation'}
CONTEXT={'nabou':'https://piratecartography.com/ns/research#','schema':'https://schema.org/',
         'prov':'http://www.w3.org/ns/prov#','@vocab':'https://piratecartography.com/ns/research#'}


def uri(identifier):return 'urn:nabou:'+quote(str(identifier),safe='')


def export_jsonld(entities,relations):
    nodes={};graph=[]
    for entity in entities:
        if entity['entity_type'] not in TYPES:raise ValueError('Unsupported entity type')
        if entity['id'] in nodes:raise ValueError('Duplicate entity identity')
        nodes[entity['id']]=entity
        node={'@id':uri(entity['id']),'@type':entity['entity_type'],'schema:name':entity['label'],
              'properties':entity.get('properties',{}),'historically_verified':False}
        if entity['entity_type'] in ('Person','Place','Event'):node['@type']='schema:'+entity['entity_type']
        if entity['entity_type']=='Institution':node['@type']='schema:Organization'
        graph.append(node)
    for relation in relations:
        if relation['subject_id'] not in nodes or relation['object_id'] not in nodes:raise ValueError('Missing relation endpoint')
        citations=relation.get('citation_ids',[])
        if not citations or any(c not in nodes or nodes[c]['entity_type']!='Citation' or not nodes[c].get('properties',{}).get('exact_excerpt') for c in citations):
            raise ValueError('Historical relation requires exact source citations')
        if relation.get('assertion_class') not in ('SOURCE_STATEMENT','INTERPRETATION','HYPOTHESIS'):raise ValueError('Missing assertion class')
        graph.append({'@id':uri(relation['id']),'@type':'Relation',
                      'subject':{'@id':uri(relation['subject_id'])},'predicate':relation['predicate'],
                      'object':{'@id':uri(relation['object_id'])},
                      'prov:wasDerivedFrom':[{'@id':uri(c)} for c in citations],
                      'assertion_class':relation['assertion_class'],'verification_status':'UNVERIFIED'})
    return {'@context':CONTEXT,'@graph':graph}


def bundle_graph(bundle):
    entities=[];relations=[];seen=set()
    def node(identifier,kind,label,properties):
        if identifier not in seen:
            entities.append({'id':identifier,'entity_type':kind,'label':label,'properties':properties});seen.add(identifier)
    for source in bundle['sources']:node(source['id'],'Source',source['title'],source)
    for att in bundle['attestations']:
        node(att['id'],'Attestation',att['value'],{'status':att['status'],'historically_verified':False})
        for citation in att['citations']:
            cid='cite_'+hashlib.sha256(json.dumps(citation,sort_keys=True,ensure_ascii=False).encode()).hexdigest()[:24]
            node(cid,'Citation',citation['locator'],citation)
            relations.append({'id':att['id']+':'+cid,'subject_id':att['id'],'object_id':citation['source_id'],
                              'predicate':'reportsInConsultedSource','citation_ids':[cid],
                              'assertion_class':'SOURCE_STATEMENT'})
    return {'entities':entities,'relations':relations,'jsonld':export_jsonld(entities,relations)}


def temporal_match(record,start,end):
    a,b=record.get('start_year'),record.get('end_year')
    if a is not None and (type(a) is not int or type(b) is not int or a>b):raise ValueError('Invalid time interval')
    if a is None or b is None:return 'UNKNOWN'
    return 'OVERLAP' if max(a,start)<=min(b,end) else 'OUTSIDE'


def export_gazetteer(places,start_year,end_year):
    if type(start_year) is not int or type(end_year) is not int or start_year>end_year:raise ValueError('Invalid temporal filter')
    features=[]
    for place in places:
        if not place.get('citation_ids'):raise ValueError('Gazetteer record needs a source citation')
        match=temporal_match(place,start_year,end_year)
        if match=='OUTSIDE':continue
        location=place.get('location');point=coordinates(location) if location else None
        radius=location.get('uncertainty_radius_m') if location else None
        if radius is not None and (type(radius) not in (int,float) or not math.isfinite(radius) or radius<0):raise ValueError('Invalid uncertainty radius')
        aliases=[]
        for alias in place.get('aliases',[]):
            if not alias.get('citation_ids'):raise ValueError('Historical alias needs a source citation')
            if temporal_match(alias,start_year,end_year)!='OUTSIDE':aliases.append(alias)
        features.append({'type':'Feature','id':place['id'],
                         'geometry':{'type':'Point','coordinates':list(point)} if point else None,
                         'properties':{'label':place['label'],'aliases':aliases,'temporal_match':match,
                                       'start_year':place.get('start_year'),'end_year':place.get('end_year'),
                                       'uncertainty_radius_m':radius,'citation_ids':place['citation_ids'],
                                       'verification_status':'UNVERIFIED'}})
    return {'type':'FeatureCollection','features':features,
            'coverage':'SOURCE_CITED_RECORDS_ONLY; NULL_COORDINATES_UNRESOLVED'}


def cited_routes(routes,places):
    lookup={p['id']:p for p in places};features=[]
    for route in routes:
        if not route.get('citation_ids'):raise ValueError('Route needs a source citation')
        points=[]
        for key in route['place_ids']:
            location=lookup[key].get('location')
            if not location:raise ValueError('Cannot map route with unresolved coordinates')
            points.append(list(coordinates(location)))
        if len(points)<2:raise ValueError('Route requires two sourced endpoints')
        features.append({'type':'Feature','id':route['id'],'geometry':{'type':'LineString','coordinates':points},
                         'properties':{**route,'geometry_meaning':'SCHEMATIC_CONNECTION_NOT_RECONSTRUCTED_SAILING_TRACK','verification_status':'UNVERIFIED'}})
    return {'type':'FeatureCollection','features':features}
