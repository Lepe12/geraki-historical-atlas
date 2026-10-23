#!/usr/bin/env python3
"""Claim fidelity guard: a claim may not date an event the quote leaves undated.

Deterministic, model-free check of each claim (or answer paragraph) against its
own cited quotation. For every year written in the claim statement or its
``dates`` field:

* DATE_NOT_IN_QUOTE  - the year does not occur in the quotation at all.
* DATE_ROLE_MISMATCH - in the quotation the year is attached to a reporting /
  documentary event (a decision, decree, letter, report, register; or verbs
  such as acknowledging, records, refer to) and the claim does not keep that
  role, i.e. it moves the document's date onto the reported action. A
  past-perfect form of the reported action ("had built", aveva, avait, había,
  είχε) is recorded as an additional signal: the action is earlier and undated.
* OK                 - every claimed year is used in the quote's own role.

Flagged claims are never deleted or rewritten. They are marked and held out of
the narrative synthesis so they are not presented as a verified fact. A
"safe_rewrite_suggestion" may be attached; it only quotes the source sentence
and never proposes a corrected date. The check is lexical and conservative: it
is a fidelity flag for human review, not a historical judgement.
"""
from __future__ import annotations
import json
import re
import sys
import unicodedata

POLICY = 'claim-fidelity-guard-v1'
OK, ROLE_MISMATCH, NOT_IN_QUOTE = 'OK', 'DATE_ROLE_MISMATCH', 'DATE_NOT_IN_QUOTE'
NO_YEARS = 'NO_CLAIMED_YEARS'
NO_QUOTE = 'NO_QUOTE_TO_CHECK'
FLAGGED = (ROLE_MISMATCH, NOT_IN_QUOTE)
NEAR_TOKENS = 3      # "a 1695 decision", "decision of capitan ... 1695", "lettre de 1695"
YEAR = re.compile(r'(?<!\d)(1[0-9]{3})(?!\d)')

# Accent-folded, lower-case word prefixes. Kept explicit and auditable.
DOCUMENT_NOUNS = (
    # English
    'decision', 'decree', 'letter', 'report', 'record', 'register', 'document', 'deed', 'petition',
    'dispatch', 'despatch', 'survey', 'census', 'visitation', 'inventory', 'ordinance', 'edict',
    'judgment', 'judgement', 'sentence', 'verdict', 'notarial', 'contract', 'memorandum', 'minute',
    'chronicle', 'entry', 'testimon', 'deposition', 'act', 'acts', 'order', 'orders',
    # Italian
    'decisione', 'decreto', 'lettera', 'relazione', 'dispaccio', 'atto', 'atti', 'registro', 'documento',
    'supplica', 'sentenza', 'terminazione', 'ducale', 'informazione',
    # French
    'decret', 'lettre', 'rapport', 'acte', 'actes', 'registre', 'memoire', 'requete', 'ordonnance',
    'proces-verbal', 'depeche',
    # Spanish
    'carta', 'informe', 'relacion', 'acta', 'actas', 'memorial', 'consulta', 'cedula', 'despacho',
    # Latin
    'decretum', 'decreto', 'litter', 'epistol', 'relatio', 'instrument',
    # Greek
    'αποφασ', 'διαταγ', 'επιστολ', 'γραμμα', 'εγγραφ', 'εκθεσ', 'αναφορ', 'πρακτικ', 'κωδικ',
    'καταστιχ', 'ψηφισμ', 'θεσπισμ', 'ορισμ', 'συμβολαι', 'μαρτυρ',
)
REPORTING_VERBS = (
    'acknowledg', 'record', 'mention', 'refer', 'report', 'confirm', 'attest', 'recogni', 'declar',
    'decid', 'decree', 'state', 'note', 'wrote', 'write', 'describ', 'testif', 'certif', 'list',
    'riconosc', 'menzion', 'scriv', 'scriss', 'riferisc', 'dichiar', 'attest', 'conferm', 'decis',
    'reconn', 'mentionn', 'ecri', 'rapport', 'atteste', 'confirm',
    'reconoc', 'mencion', 'escrib', 'escrit', 'refier', 'confirm',
    'testat', 'scrib', 'scrips', 'memorat', 'confirmat', 'recognov',
    'αναγνωρ', 'αναφερ', 'καταγραφ', 'γραφ', 'σημειων', 'βεβαιων', 'δηλων', 'αποφασισ', 'μαρτυρ',
)
COMPLEMENTIZER = re.compile(r'\b(?:that|che|que|quod|οτι|πως)\b')
STOPWORDS = {'a', 'an', 'the', 'of', 'in', 'on', 'from', 'dated', 'de', 'du', 'des', 'la', 'le', 'les', 'el', 'del',
             'di', 'della', 'dello', 'il', 'lo', 'un', 'una', 'une', 'του', 'της', 'το', 'η', 'ο', 'με', 'στο',
             'στη', 'στην', 'μια', 'ενα', 'ενας', 'anno', 'year', 'en', 'año', 'ano', 'annee', 'ετος'}
# Past perfect (prior, undated) forms of the reported action.
PLUPERFECT = re.compile(r'\b(?:'
    r"had\s+(?:\w+ly\s+)?(?:been\s+)?\w+(?:ed|en|wn|ne|de|ung|ught|ilt|ent|old|ound|t)"
    r'|(?:aveva|avevano|avea|aveano)\s+\w+(?:ato|uto|ito|ata|uta|ita|atti|tto|sto|so|tti)'
    r'|(?:era|erano)\s+(?:stat[oaie]\s+)?\w+(?:ato|uto|ito|ata|uta|ita|ati|iti|ute)'
    r'|(?:avait|avaient)\s+(?:\w+\s+)?\w+(?:e|i|u|is|it|te|ts|es)'
    r'|(?:etait|etaient)\s+\w+(?:e|i|u|is|ee|es)'
    r'|(?:habia|habian)\s+\w+(?:ado|ido|to|cho|ada|ida)'
    r'|(?:ειχε|ειχαν|ειχαμε|ειχες)\s+\w+'
    r'|\w{2,}(?:erat|erant))\b')


def year_regex(year, glued_footnote=False):
    # glued_footnote: OCR often fuses a footnote number to a year ("160858" = 1608 + note 58).
    return re.compile(r'(?<!\d)' + year + (r'\d{1,3}(?!\d)' if glued_footnote else r'(?!\d)'))


def fold(text):
    text = unicodedata.normalize('NFKD', str(text or '').replace('ſ', 's'))
    return ''.join(c for c in text if not unicodedata.combining(c)).lower().replace('ς', 'σ')


def _tokens(text):
    return [(m.group(0), m.start(), m.end()) for m in re.finditer(r'[^\W_]+(?:-[^\W_]+)?', text)]


def _is(word, vocab):
    return any(word == v or (len(v) >= 4 and word.startswith(v)) for v in vocab)


def _sentence(text, pos):
    start = max(text.rfind('. ', 0, pos), text.rfind('; ', 0, pos), text.rfind('\n\n', 0, pos))
    ends = [i for i in (text.find('. ', pos), text.find('; ', pos), text.find('\n\n', pos)) if i >= 0]
    return start + 1 if start >= 0 else 0, min(ends) + 1 if ends else len(text)


def year_role(text, year):
    """Return the documentary role a year has in ``text`` (or None if plain).

    Accent-folded text is searched; returns e.g. {'term': 'decision', 'how':
    'DOCUMENT_NOUN_ADJACENT'} for "a 1695 decision" or "In 1695 X acknowledged that".
    """
    folded = fold(text)
    roles = []
    pattern = year_regex(year)
    if not pattern.search(folded):
        pattern = year_regex(year, glued_footnote=True)
    for m in pattern.finditer(folded):
        toks = _tokens(folded)
        idx = next((i for i, t in enumerate(toks) if t[1] <= m.start() < t[2]), None)
        if idx is None:
            continue
        lo, hi = _sentence(folded, m.start())
        near = []
        # Up to NEAR_TOKENS content words each side; stopwords and day/month numbers are free.
        for step in (-1, 1):
            i, seen = idx + step, 0
            while 0 <= i < len(toks) and seen < NEAR_TOKENS and lo <= toks[i][1] < hi:
                w = toks[i][0]
                if w not in STOPWORDS and not w.isdigit():
                    near.append(w)
                    seen += 1
                i += step
        noun = next((w for w in near if _is(w, DOCUMENT_NOUNS)), None)
        if noun:
            roles.append({'term': noun, 'how': 'DOCUMENT_NOUN_ADJACENT'})
            continue
        # "In 1695 the governor acknowledged that ..." : reporting verb in the year's clause
        clause_end = COMPLEMENTIZER.search(folded, m.end(), hi)
        if clause_end:
            clause = [t[0] for t in _tokens(folded[m.end():clause_end.start()])]
            verb = next((w for w in clause if _is(w, REPORTING_VERBS)), None)
            if verb and len(clause) <= 8:
                roles.append({'term': verb, 'how': 'REPORTING_VERB_CLAUSE'})
                continue
        roles.append(None)
    if not roles or any(r is None for r in roles):
        return None   # at least one plain (event) use of the year: not provably a document date
    return roles[0]


def claimed_years(claim):
    years = []
    for value in [claim.get('statement') or claim.get('text') or ''] + [str(d) for d in (claim.get('dates') or [])]:
        for y in YEAR.findall(str(value)):
            if y not in years:
                years.append(y)
    return years


def _source_sentence(quote, year):
    folded = fold(quote)
    m = year_regex(year).search(folded) or year_regex(year, glued_footnote=True).search(folded)
    lo, hi = _sentence(folded, m.start()) if m else (0, len(quote))
    return ' '.join(quote[lo:hi].split())


def check(statement, quote, dates=None):
    """Assess one statement against one quotation. Pure function."""
    claim = {'statement': statement, 'dates': dates or []}
    years = claimed_years(claim)
    result = {'policy': POLICY, 'claimed_years': years, 'findings': []}
    if not years:
        result['status'] = NO_YEARS
        return result
    if not (quote or '').strip():
        result['status'] = NO_QUOTE
        return result
    fquote = fold(quote)
    plup = [m.group(0) for m in PLUPERFECT.finditer(fquote)]
    for y in years:
        note = None
        if not year_regex(y).search(fquote):
            if not year_regex(y, glued_footnote=True).search(fquote):
                result['findings'].append({'year': y, 'status': NOT_IN_QUOTE})
                continue
            note = 'YEAR_FOUND_WITH_GLUED_FOOTNOTE_NUMBER'
        role = year_role(quote, y)
        if role is None:
            result['findings'].append({'year': y, 'status': OK, **({'note': note} if note else {})})
            continue
        kept = year_role(statement or '', y) if y in YEAR.findall(statement or '') else None
        if kept is not None:
            result['findings'].append({'year': y, 'status': OK, 'quote_year_role': role, 'claim_keeps_role': kept})
            continue
        if y not in YEAR.findall(statement or ''):
            # year only in the structured dates field: the field may not carry a role,
            # so it is flagged only when the reported action is explicitly prior.
            if not plup:
                result['findings'].append({'year': y, 'status': OK, 'quote_year_role': role,
                                           'note': 'DATES_FIELD_ONLY_NO_PRIOR_ACTION_SIGNAL'})
                continue
        result['findings'].append({'year': y, 'status': ROLE_MISMATCH, 'quote_year_role': role,
                                   'prior_action_forms': plup[:4],
                                   'source_sentence': _source_sentence(quote, y)})
    statuses = [f['status'] for f in result['findings']]
    result['status'] = ROLE_MISMATCH if ROLE_MISMATCH in statuses else NOT_IN_QUOTE if NOT_IN_QUOTE in statuses else OK
    mism = [f for f in result['findings'] if f['status'] == ROLE_MISMATCH]
    if mism:
        result['safe_rewrite_suggestion'] = {
            'label': 'SOURCE_WORDING_ONLY_NOT_A_CORRECTED_DATE',
            'text': 'The source says: "' + mism[0]['source_sentence'] + '" The year ' + mism[0]['year']
                    + ' is given for the ' + mism[0]['quote_year_role']['term']
                    + ', not for the reported action, whose date the quotation does not state.'}
    return result


def apply(claims):
    """Annotate claims in place (adds fields only). Returns a report dict."""
    report = {'policy': POLICY, 'checked': 0, 'flagged_claim_ids': [], 'by_status': {}}
    for claim in claims or []:
        res = check(claim.get('statement'), claim.get('quote'), claim.get('dates'))
        report['checked'] += 1
        report['by_status'][res['status']] = report['by_status'].get(res['status'], 0) + 1
        claim['fidelity_status'] = res['status']
        claim['claim_fidelity'] = res
        if res['status'] in FLAGGED:
            report['flagged_claim_ids'].append(claim.get('claim_id'))
            claim['fidelity_hold'] = 'HELD_FROM_SYNTHESIS_NOT_A_VERIFIED_FACT'
            unc = claim.get('uncertainty')
            if isinstance(unc, list) and res['status'] not in unc:
                unc.append(res['status'])
    return report


def check_sections(sections, claims):
    """Check answer paragraphs against the quotes of the claims they cite."""
    by_id = {c.get('claim_id'): c for c in claims or []}
    results = []
    for i, section in enumerate(sections or []):
        quote = '\n'.join((by_id.get(cid) or {}).get('quote') or '' for cid in section.get('claim_ids') or [])
        res = check(section.get('text'), quote)
        results.append({'section_index': i, 'status': res['status'], 'fidelity': res})
    return results


def main(argv=None):
    """Read-only audit of an existing answer.json; prints a JSON report."""
    argv = sys.argv[1:] if argv is None else argv
    if not argv:
        print('usage: claim_fidelity_guard.py ANSWER_JSON', file=sys.stderr)
        return 2
    answer = json.load(open(argv[0], encoding='utf-8'))
    claims = json.loads(json.dumps(answer.get('claims') or []))
    report = apply(claims)
    report['claims'] = [{'claim_id': c.get('claim_id'), 'statement': c.get('statement'),
                         'fidelity_status': c['fidelity_status'],
                         'safe_rewrite_suggestion': c['claim_fidelity'].get('safe_rewrite_suggestion')}
                        for c in claims if c['fidelity_status'] in FLAGGED]
    report['sections'] = check_sections(answer.get('answer_sections'), claims)
    print(json.dumps(report, ensure_ascii=False, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
