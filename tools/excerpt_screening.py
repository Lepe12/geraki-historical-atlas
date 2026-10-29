"""Cheap relevance screening before deep reading (PRISMA/Elicit-style).

Every excerpt is answered against explicit yes/no criteria derived from the
question, deterministically (no model call):

  place   (place questions)  the target is named: an unambiguous name, or an
          ambiguous name with co-occurring context places (place_context.py).
  name    (person questions) a literal name/alias of the person appears.
  topic   (if the question has a theme, e.g. piracy/corsairs or bases) a
          theme word appears in any source language.
  period  (if a period is given or implied) not every year in the excerpt
          lies outside the window; no years at all = UNKNOWN, which passes.

Only excerpts with no NO answer go to the readers. Failed excerpts are listed
with every answer and the reason, stay in the queue inventory as FILTERED and
can be re-included with PCT_SCREENING_REINCLUDE=<ids>|all or PCT_SCREENING=0.
"""
import os
import re

from excerpt_prefilter import name_hit, name_prefixes
from excerpt_ranking import BASES, PIRACY, _years, expand_names, fold, tokens
from place_context import ON_TARGET, classify, profile
from search_priority import infer_window

POLICY = 'explicit-criteria-screening-v1'
YES, NO, UNKNOWN, NA = 'YES', 'NO', 'UNKNOWN', 'NOT_APPLICABLE'
THEMES = {'piracy': PIRACY + r'|forban|levend|zeerov|kaper|esclav|captiv|schiav|riscat|ranc[oç]n|λυτρ|αιχμαλ|σκλαβ',
          'bases': BASES + r'|λιμαν|λιμεν|port[oi]?\b|mouill|rade\b|cala\b'}
PERIOD_TOLERANCE = 10


def settings(env=None):
    env = os.environ if env is None else env
    raw = str(env.get('PCT_SCREENING_REINCLUDE', '')).strip()
    return {'enabled': str(env.get('PCT_SCREENING', '1')).strip().lower() not in ('0', 'false', 'no', 'off'),
            'criteria': sorted(c.strip() for c in str(env.get('PCT_SCREENING_CRITERIA', 'place,name,topic,period')).split(',') if c.strip()),
            'reinclude': 'all' if raw.lower() == 'all' else sorted(x.strip() for x in raw.split(',') if x.strip())}


def question_criteria(kind, target, aliases, date_range, purpose):
    """The yes/no questions this research question implies."""
    themes = [k for k, rx in THEMES.items() if re.search(rx, fold(purpose))]
    start, end, basis = infer_window(date_range, purpose)
    return {'kind': kind, 'names': [n for n in [target, *aliases] if n],
            'themes': themes, 'window': [start, end] if start is not None else None, 'window_basis': basis}


def answer(row, crit, names, prof, prefixes, cfg):
    text = row.get('text') or ''
    title = (row.get('occurrences') or [{}])[0].get('title') or ''
    out = {}
    if crit['kind'] == 'place' and 'place' in cfg['criteria']:
        status, detail = classify(text + ' \n ' + title, names, prof)
        out['place'] = {'answer': YES if status == ON_TARGET else NO, 'status': status, 'detail': detail}
    elif crit['kind'] == 'person' and 'name' in cfg['criteria']:
        out['name'] = {'answer': YES if name_hit(text, prefixes) or name_hit(title, prefixes) else NO}
    if crit['themes'] and 'topic' in cfg['criteria']:
        folded = fold(text + ' ' + title)
        hits = [k for k in crit['themes'] if re.search(THEMES[k], folded)]
        out['topic'] = {'answer': YES if hits else NO, 'themes': hits or crit['themes']}
    if crit['window'] and 'period' in cfg['criteria']:
        lo, hi = crit['window'][0] - PERIOD_TOLERANCE, crit['window'][1] + PERIOD_TOLERANCE
        years = sorted(set(row.get('years_in_scope') or []) | set(_years(text)))
        if not years:
            out['period'] = {'answer': UNKNOWN}
        else:
            inside = [y for y in years if lo <= y <= hi]
            out['period'] = {'answer': YES if inside else NO, 'years': years[:12]}
    return out


def screen(records, kind, target='', aliases=(), date_range='', purpose='', env=None):
    """Return (passed, failed, report). Order of passed records is preserved."""
    cfg = settings(env)
    crit = question_criteria(kind, target, list(aliases), date_range, purpose)
    if not cfg['enabled'] or kind not in ('place', 'person'):
        return list(records), [], {'policy': POLICY, 'applied': False, 'criteria': crit,
                                   'reason': 'DISABLED' if not cfg['enabled'] else 'KIND_NOT_SCREENED:' + str(kind)}
    names = expand_names(crit['names'])
    prof = profile(names) if kind == 'place' else None
    prefixes = name_prefixes(names)
    passed, failed = [], []
    for row in records:
        answers = answer(row, crit, names, prof, prefixes, cfg)
        noes = [k for k, v in answers.items() if v['answer'] == NO]
        eid = row['evidence_id']
        if noes and (cfg['reinclude'] == 'all' or eid in cfg['reinclude']):
            row = {**row, 'screening_reincluded': noes}
            noes = []
        if not noes:
            passed.append({**row, 'screening': answers} if answers else row)
            continue
        occurrence = (row.get('occurrences') or [{}])[0]
        failed.append({'evidence_id': eid, 'status': 'screened_out_' + noes[0], 'detail': ','.join('NO_' + k.upper() for k in noes),
                       'screening': answers, 'title': occurrence.get('title'), 'url': occurrence.get('url'),
                       'lane': occurrence.get('lane'), 'acquired_text_path': occurrence.get('acquired_text_path'),
                       'locator': occurrence.get('locator'), 'excerpt_preview': (row.get('text') or '')[:160],
                       're_include_with': 'PCT_SCREENING_REINCLUDE=' + eid})
    by = {}
    for f in failed:
        for k in f['detail'].split(','):
            by[k] = by.get(k, 0) + 1
    report = {'policy': POLICY, 'applied': True, 'role': 'READING_SCREEN_NOT_TRUTH_OR_RELEVANCE_VERDICT',
              'model_calls': 0, 'settings': cfg, 'criteria': crit,
              'place_profile': {k: prof[k] for k in ('place_ids', 'clear_names', 'ambiguous_names')} if prof else None,
              'screened': len(records), 'passed': len(passed), 'failed': len(failed), 'failed_by_criterion': by,
              'failed_items': failed, 'deleted': 0}
    return passed, failed, report
