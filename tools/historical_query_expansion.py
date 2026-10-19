#!/usr/bin/env python3
"""Deterministic multilingual/historical query expansion for Agent Piracy.

Expands user-supplied target/aliases with lane-appropriate event vocabulary.
It does not invent historical spellings: historical name variants come from the
request; generic event vocabulary is controlled here and every emitted query is
preserved in the repository plan for audit.
"""
from research_focus import decompose, focused_queries

EVENT_TERMS={
 "greek":["πειρατεία","πειρατής","πειρατές","κουρσάρος","κουρσάροι","επιδρομή","λεηλασία","αιχμαλωσία","λύτρα","ρεσάλτο","πειρατικό","corsair","piracy","pirate","Aegean","Αιγαίο","Αρχιπέλαγος"],
 "travellers":["pirate","corsair","privateer","raid","captivity","ransom","pillage","πειρατής","πειρατές","κουρσάρος","κουρσάροι","επιδρομή","αιχμαλωσία","λύτρα","λεηλασία","κατάληψη","ρεσάλτο"],
 "spanish_simancas":["pirata","corsario","incursión","saqueo","cautivo","rescate","armada","galera","galeras","navío","navíos"],
 "venetian":["pirata","corsaro","incursione","saccheggio","schiavo","riscatto","armata"],
 "french":["pirate","corsaire","forban","incursion","pillage","captivité","rançon"],
 "british":["pirate","corsair","privateer","raid","plunder","captivity","ransom"],
 "dutch":["piraat","zeerover","kaper","aanval","plundering","gevangene","losgeld"],
 "german":["Pirat","Seeräuber","Kaper","Angriff","Plünderung","Gefangene","Lösegeld"],
 "italian_states":["pirata","corsaro","incursione","saccheggio","schiavo","riscatto"],
 "ottoman":["korsan","levend","akın","esir","fidye","donanma"],
 "north_african":["corsaire","pirata","corsario","ghazwa","captif","esclave","rançon","galera","galeras","navío","navíos"]
}
def expand_queries(lane,target,aliases,date_range="",max_queries=0):
    focus=decompose(target,aliases)
    if focus['kind']=='person':
        queries=focused_queries(focus,([str(date_range)] if date_range else [])+EVENT_TERMS.get(lane,EVENT_TERMS['travellers']),include_hypotheses=True)
        return queries[:max_queries] if max_queries and max_queries>0 else queries
    names=[]
    seeds=[focus['entity']] if focus['kind']=='place' and focus.get('entity') else [target]
    for raw in seeds+list(aliases or []):
        v=str(raw).strip()
        if v and v.casefold() not in {x.casefold() for x in names}: names.append(v)
    terms=EVENT_TERMS.get(lane,EVENT_TERMS["travellers"])
    queries=[]
    # Broad name-only searches protect recall; event-qualified searches improve precision.
    for n in names:
        queries.append(n)
        for term in terms: queries.append(f'"{n}" {term}')
    # Date is a separate variant because some archival catalogues index dates poorly.
    if date_range:
        import re
        ys=re.findall(r"\b(1[0-9]{3}|20[0-9]{2})\b",str(date_range))
        date_terms=[str(date_range)]
        date_terms += [y for y in ys if y not in date_terms]
        for n in names:
            for dt in date_terms:
                queries.append(f'"{n}" {dt}')
    ded=[];seen=set()
    for q in queries:
        k=q.casefold()
        if k not in seen: seen.add(k);ded.append(q)
    return ded[:max_queries] if max_queries and max_queries>0 else ded
