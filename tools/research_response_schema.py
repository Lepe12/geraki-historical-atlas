"""Stage-specific generation structure. Schema validity never proves source support."""
def obj(properties):return {'type':'object','properties':properties,'required':list(properties),'additionalProperties':False}
def array(items,maximum=None):
    value={'type':'array','items':items}
    if maximum is not None:value['maxItems']=maximum
    return value
STRING={'type':'string'}
STRINGS=array(STRING)
SHORT_STRINGS=array({'type':'string','maxLength':240},5)

def extraction(evidence_ids, question_kind=None):
    places=array(STRING)
    actors=array(STRING)
    if question_kind in ('place','topic'):places['minItems']=1
    if question_kind=='person':actors['minItems']=1
    item=obj({'passage_kind':{'type':'string','enum':['NARRATIVE_EVIDENCE','BIBLIOGRAPHIC_REFERENCE','INDEX_ENTRY','CATALOGUE_METADATA','NAME_LIST']},
        'statement':{'type':'string','maxLength':320},'evidence_id':{'type':'string','enum':evidence_ids},
        'passage_ids':array({'type':'integer','minimum':0},4),
        'kind':{'type':'string','enum':['source_statement','inference','hypothesis']},
        'source_type':{'type':'string','enum':['UNVERIFIED','PRIMARY_SOURCE','SECONDARY_SOURCE']},
        'actors':actors,'places':places,'dates':STRINGS,
        'usage_type':{'type':'string','enum':['BASE','ANCHORAGE','REFUGE','RAID_LOCATION','OTHER','UNRESOLVED']},'uncertainty':STRINGS})
    return obj({'items':array(item,2)})

def review(count):
    decisions=array(obj({'claim_index':{'type':'integer','enum':list(range(count))},
                         'reason':{'type':'string','maxLength':600},'decision':{'type':'string','enum':['SUPPORTED','UNSUPPORTED','UNCERTAIN']}}),count)
    decisions['minItems']=count
    return obj({'decisions':decisions,'limitations':SHORT_STRINGS})

def synthesis(claim_ids):
    citations=array({'type':'string','enum':claim_ids},len(claim_ids));citations['minItems']=1
    sections=array(obj({'text':{'type':'string','maxLength':480},'claim_ids':citations}),min(4,len(claim_ids)))
    sections['minItems']=1
    return obj({'answer_sections':sections,'unknowns':SHORT_STRINGS,'limitations':SHORT_STRINGS})

def final_review(count):
    indexes={'type':'integer','enum':list(range(count))}
    decisions=array(obj({'section_index':indexes,'source_support_reason':{'type':'string','maxLength':600},
                         'unsupported_answer_spans':array({'type':'string','maxLength':160},3),
                         'decision':{'type':'string','enum':['SUPPORTED','UNSUPPORTED','UNCERTAIN']}}),count)
    decisions['minItems']=count
    return obj({'section_decisions':decisions})
