"""Stage-specific generation structure. Schema validity never proves source support."""
def obj(properties):return {'type':'object','properties':properties,'required':list(properties),'additionalProperties':False}
def array(items,maximum=None):
    value={'type':'array','items':items}
    if maximum is not None:value['maxItems']=maximum
    return value
STRING={'type':'string'}
STRINGS=array(STRING)

def extraction(evidence_ids):
    item=obj({'statement':STRING,'evidence_id':{'type':'string','enum':evidence_ids},
        'passage_ids':array({'type':'integer','minimum':0},4),
        'kind':{'type':'string','enum':['source_statement','inference','hypothesis']},
        'source_type':{'type':'string','enum':['UNVERIFIED','PRIMARY_SOURCE','SECONDARY_SOURCE']},
        'actors':STRINGS,'places':STRINGS,'dates':STRINGS,
        'usage_type':{'type':'string','enum':['BASE','ANCHORAGE','REFUGE','RAID_LOCATION','OTHER','UNRESOLVED']},'uncertainty':STRINGS})
    return obj({'items':array(item,2)})

def review(count):
    decisions=array(obj({'claim_index':{'type':'integer','enum':list(range(count))},
                         'reason':STRING,'decision':{'type':'string','enum':['SUPPORTED','UNSUPPORTED','UNCERTAIN']}}),count)
    decisions['minItems']=count
    return obj({'decisions':decisions,'limitations':STRINGS})

def synthesis(claim_ids):
    return obj({'answer_sections':array(obj({'text':STRING,'claim_ids':array({'type':'string','enum':claim_ids})}),4),
                'unknowns':STRINGS,'limitations':STRINGS})

def final_review(count):
    indexes={'type':'integer','enum':list(range(count))}
    decisions=array(obj({'section_index':indexes,'source_support_reason':STRING,
                         'unsupported_answer_spans':STRINGS,
                         'decision':{'type':'string','enum':['SUPPORTED','UNSUPPORTED','UNCERTAIN']}}),count)
    decisions['minItems']=count
    return obj({'section_decisions':decisions})
