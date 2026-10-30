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

v2 limits on the topic/period criteria (the place/name criterion is unchanged,
so text that does not name the target is still never read):

  identity questions  "which island is X today", "what was X called", "tell the
          namesakes apart": the theme and century describe where the name occurs,
          not what the evidence must say. Topic and period are NOT_APPLICABLE.
  in-window rescue    an on-target excerpt with a year inside the question's
          window passes even without a theme word (period YES outweighs a
          missing keyword; the topic answer stays NO in the record).
  never empty by topic  if no excerpt passes, the best-ranked excerpts whose
          only NO is the topic are kept (PCT_SCREENING_TOPIC_FLOOR, default 3),
          so a vocabulary gap cannot hide all target text from the readers.
"""
import os
import re

from excerpt_prefilter import name_hit, name_prefixes
from excerpt_ranking import BASES, PIRACY, _years, expand_names, fold, tokens
from place_context import ON_TARGET, classify, profile
from search_priority import infer_window

POLICY = 'explicit-criteria-screening-v2'
YES, NO, UNKNOWN, NA = 'YES', 'NO', 'UNKNOWN', 'NOT_APPLICABLE'
THEMES = {'piracy': PIRACY + r'|pyrat|armateur|forban|levend|zeerov|kaper|esclav|captiv|schiav|riscat|ranc[oç]n|λυτρ|αιχμαλ|σκλαβ',
          'bases': BASES + r'|λιμαν|λιμεν|port[oi]?\b|mouill|rade\b|cala\b'}
PERIOD_TOLERANCE = 10
# Purposes that ask WHO/WHICH the target is (identification, old names,
# namesakes). Folded (no accents, final sigma -> σ).
IDENTITY_INTENT = (r'ποιο νησι|ποια νησια|ποιο μεροσ|ποιοσ ηταν|ποια ηταν|ποιο ηταν|λεγεται|λεγοταν|ονομαζ|'
                   r'σημερα|συνωνυμ|ξεχωρισ|ταυτισ|ταυτοποι|which (?:island|place)|who was|identif|namesake|homonym|'
                   r'\btoday\b|old name|earlier name|now called|quelle (?:ile|isle)|qui etait|homonyme')
TOPIC_FLOOR = 3


def settings(env=None):
    env = os.environ if env is None else env
    raw = str(env.get('PCT_SCREENING_REINCLUDE', '')).strip()
    return {'enabled': str(env.get('PCT_SCREENING', '1')).strip().lower() not in ('0', 'false', 'no', 'off'),
            'criteria': sorted(c.strip() for c in str(env.get('PCT_SCREENING_CRITERIA', 'place,name,topic,period')).split(',') if c.strip()),
            'reinclude': 'all' if raw.lower() == 'all' else sorted(x.strip() for x in raw.split(',') if x.strip()),
            'identity_exemption': str(env.get('PCT_SCREENING_IDENTITY_EXEMPTION', '1')).strip().lower() not in ('0', 'false', 'no', 'off'),
            'window_rescue': str(env.get('PCT_SCREENING_WINDOW_RESCUE', '1')).strip().lower() not in ('0', 'false', 'no', 'off'),
            'topic_floor': max(0, int(env.get('PCT_SCREENING_TOPIC_FLOOR', TOPIC_FLOOR)))}


def question_criteria(kind, target, aliases, date_range, purpose):
    """The yes/no questions this research question implies."""
    themes = [k for k, rx in THEMES.items() if re.search(rx, fold(purpose))]
    start, end, basis = infer_window(date_range, purpose)
    return {'kind': kind, 'names': [n for n in [target, *aliases] if n],
            'themes': themes, 'window': [start, end] if start is not None else None, 'window_basis': basis,
            'identity_question': bool(re.search(IDENTITY_INTENT, fold(purpose)))}


def answer(row, crit, names, prof, prefixes, cfg):
    text = row.get('text') or ''
    title = (row.get('occurrences') or [{}])[0].get('title') or ''
    out = {}
    if crit['kind'] == 'place' and 'place' in cfg['criteria']:
        status, detail = classify(text + ' \n ' + title, names, prof)
        out['place'] = {'answer': YES if status == ON_TARGET else NO, 'status': status, 'detail': detail}
    elif crit['kind'] == 'person' and 'name' in cfg['criteria']:
        out['name'] = {'answer': YES if name_hit(text, prefixes) or name_hit(title, prefixes) else NO}
    identity = crit.get('identity_question') and cfg.get('identity_exemption', True)
    if identity and (crit['themes'] or crit['window']):
        # The question asks which place/person the name denotes: the theme and
        # period describe the sources it comes from, not the evidence needed.
        if crit['themes'] and 'topic' in cfg['criteria']:
            out['topic'] = {'answer': NA, 'reason': 'IDENTITY_QUESTION'}
        if crit['window'] and 'period' in cfg['criteria']:
            out['period'] = {'answer': NA, 'reason': 'IDENTITY_QUESTION'}
        return out
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
    target_answer = (out.get('place') or out.get('name') or {}).get('answer')
    if (cfg.get('window_rescue', True) and target_answer == YES and (out.get('topic') or {}).get('answer') == NO
            and (out.get('period') or {}).get('answer') == YES):
        out['topic']['rescued_by'] = 'TARGET_AND_YEAR_IN_WINDOW'
    return out


def _noes(answers):
    return [k for k, v in answers.items() if v['answer'] == NO and not (k == 'topic' and v.get('rescued_by'))]


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
    judged = [(row, answer(row, crit, names, prof, prefixes, cfg)) for row in records]
    floor_ids = set()
    if cfg.get('topic_floor') and not any(not _noes(a) for _, a in judged):
        # Never empty by topic alone: keep the best-ranked excerpts that name
        # the target and fail only the keyword test (input order = ranking).
        floor_ids = {row['evidence_id'] for row, a in judged if _noes(a) == ['topic']}
        floor_ids = set([row['evidence_id'] for row, _ in judged if row['evidence_id'] in floor_ids][:cfg['topic_floor']])
    for row, answers in judged:
        noes = _noes(answers)
        eid = row['evidence_id']
        if eid in floor_ids:
            answers['topic']['rescued_by'] = 'TOPIC_FLOOR_NO_EXCERPT_PASSED'
            noes = []
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
              'failed_items': failed, 'deleted': 0,
              'topic_rescued': {why: [r['evidence_id'] for r in passed if ((r.get('screening') or {}).get('topic') or {}).get('rescued_by') == why]
                                for why in ('TARGET_AND_YEAR_IN_WINDOW', 'TOPIC_FLOOR_NO_EXCERPT_PASSED')}}
    return passed, failed, report
