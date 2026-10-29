"""Deterministic, model-free pre-filter and sentence windows before the model.

Purpose: spend the slow local model's fixed per-pass budget (1800 s / 48 calls,
PCT_SEMANTIC_BATCHES batches) on relevant text. Nothing is deleted:

* gate():    excerpts with no mention of the target/aliases/old names AND no
             date-window AND no purpose/theme match -> 'filtered_irrelevant';
             numeric tables, catalogue/index metadata and very short fragments
             -> 'filtered_low_quality_*'; near-duplicates collapse to the
             ranking's representative -> 'filtered_near_duplicate'.
             Filtered items stay listed (answer.json, queue.json, rounds.json)
             and can be re-included with PCT_PREFILTER_REINCLUDE=<ids>|all or
             PCT_PREFILTER=0.
* windows(): for long excerpts only the sentences around literal target/alias
             hits (+-PCT_PREFILTER_WINDOW_SENTENCES) go to the model. A window
             is a child record with exact source offsets (same mechanism as
             fit_passages); the full excerpt stays linked via
             parent_evidence_id and model_window for provenance and citation.

Reading-budget heuristics only; never historical verification.
"""
import os
import re

from excerpt_ranking import PIRACY, BASES, _stem, _stop, _years, expand_names, fold, tokens

POLICY = 'deterministic-prefilter-sentence-window-v1'
UNIVERSAL_FLAGS = ('ORIGINAL_NOT_INSPECTED', 'SOURCE_GENEALOGY_PENDING', 'INDEPENDENCE_UNRESOLVED')
METADATA_FLAGS = {'CATALOGUE_METADATA', 'INDEX_ENTRY', 'BIBLIOGRAPHIC_CONTEXT'}
REASONS = ('filtered_irrelevant', 'filtered_low_quality_table', 'filtered_low_quality_metadata',
           'filtered_low_quality_short', 'filtered_near_duplicate')


def _flag(env, name, default):
    return str(env.get(name, default)).strip().lower() not in ('0', 'false', 'no', 'off', '')


def _kinds(env, name, default):
    return {k.strip() for k in str(env.get(name, default)).split(',') if k.strip()}


def settings(env=None):
    env = os.environ if env is None else env
    reinclude = str(env.get('PCT_PREFILTER_REINCLUDE', '')).strip()
    return {'enabled': _flag(env, 'PCT_PREFILTER', '1'),
            'relevance_kinds': sorted(_kinds(env, 'PCT_PREFILTER_KINDS', 'place,person')),
            'min_words': max(0, int(env.get('PCT_PREFILTER_MIN_WORDS', '8'))),
            'max_digit_ratio': float(env.get('PCT_PREFILTER_MAX_DIGIT_RATIO', '0.15')),
            'drop_tables': _flag(env, 'PCT_PREFILTER_DROP_TABLES', '1'),
            'drop_metadata': _flag(env, 'PCT_PREFILTER_DROP_METADATA', '1'),
            'collapse_duplicates': _flag(env, 'PCT_PREFILTER_COLLAPSE_DUPLICATES', '1'),
            'reinclude': 'all' if reinclude.lower() == 'all' else sorted(x.strip() for x in reinclude.split(',') if x.strip()),
            'window_sentences': max(0, int(env.get('PCT_PREFILTER_WINDOW_SENTENCES', '2'))),
            'window_kinds': sorted(_kinds(env, 'PCT_PREFILTER_WINDOW_KINDS', 'place')),
            'window_max_fraction': float(env.get('PCT_PREFILTER_WINDOW_MAX_FRACTION', '0.8')),
            'compact_evidence': _flag(env, 'PCT_PREFILTER_COMPACT_EVIDENCE', '1')}


def name_prefixes(names):
    """Literal-name prefixes: 'Argentière' -> 'argentie', 'Κίμωλος' -> 'κιμωλ'.

    Stricter than the ranking's 6-letter stems, so French 'argent' (money)
    is not a mention of Argentiera.
    """
    out = set()
    for name in names:
        for tok in tokens(name):
            if len(tok) < 4 or tok in _stop():
                continue
            out.add(tok if len(tok) <= 5 else tok[:max(5, len(tok) - 2)])
    return sorted(out)


_HYPHEN_BREAK = re.compile(r'([^\W\d_])[-\u00ad\u2010\u00ac]\s+([^\W\d_])')


def dehyphenate(text):
    """Join OCR line-break hyphenation: 'Argen-  tiera' -> 'Argentiera', 'Ki-\nmolos' -> 'Kimolos'."""
    return _HYPHEN_BREAK.sub(r'\1\2', str(text or ''))


def name_hit(text, prefixes):
    return any(tok.startswith(p) for tok in tokens(dehyphenate(text)) for p in prefixes)


def _digit_ratio(text):
    letters = sum(c.isalpha() for c in text) or 1
    return sum(c.isdigit() for c in text) / letters


def gate(records, question_kind, target='', aliases=(), date_range='', purpose='',
         near_duplicate_of=None, env=None, gazetteer=None):
    """Return (kept, filtered, report). Order of kept is preserved."""
    cfg = settings(env)
    names = expand_names([target, *aliases], *( [gazetteer] if gazetteer else []))
    prefixes = name_prefixes(names)
    purpose_terms = {_stem(t) for t in tokens(purpose) if t not in _stop() and len(t) >= 4} - {_stem(p) for p in prefixes}
    piracy_purpose = bool(re.search(PIRACY + '|' + BASES, fold(purpose)))
    window = _years(date_range)
    window = (min(window), max(window)) if window else None
    near_duplicate_of = near_duplicate_of or {}
    relevance = question_kind in cfg['relevance_kinds'] and bool(prefixes)
    reinclude = cfg['reinclude']
    kept, filtered = [], []
    for row in records:
        eid = row['evidence_id']
        text = row.get('text') or ''
        title = (row.get('occurrences') or [{}])[0].get('title') or ''
        signals = {'name_mention': name_hit(text, prefixes), 'title_name_mention': name_hit(title, prefixes)}
        if window:
            signals['date_window'] = bool([y for y in (row.get('years_in_scope') or []) if window[0] <= y <= window[1]]
                                          or [y for y in _years(text) if window[0] <= y <= window[1]])
        else:
            signals['date_window'] = False
        folded = fold(text)
        signals['purpose_match'] = bool(purpose_terms & {_stem(t) for t in tokens(text)}) or bool(
            piracy_purpose and re.search(PIRACY, folded))
        words = len(text.split())
        reason = detail = None
        if relevance and not (signals['name_mention'] or signals['title_name_mention']
                              or signals['date_window'] or signals['purpose_match']):
            reason, detail = 'filtered_irrelevant', 'NO_TARGET_ALIAS_OLD_NAME_DATE_OR_PURPOSE_MATCH'
        elif cfg['drop_tables'] and _digit_ratio(text) > cfg['max_digit_ratio']:
            reason, detail = 'filtered_low_quality_table', 'DIGIT_TO_LETTER_RATIO_%.2f' % _digit_ratio(text)
        elif cfg['drop_metadata'] and METADATA_FLAGS & set(row.get('uncertainties') or []):
            reason, detail = 'filtered_low_quality_metadata', ','.join(sorted(METADATA_FLAGS & set(row['uncertainties'])))
        elif words < cfg['min_words']:
            reason, detail = 'filtered_low_quality_short', '%d_WORDS' % words
        elif cfg['collapse_duplicates'] and eid in near_duplicate_of:
            reason, detail = 'filtered_near_duplicate', 'REPRESENTATIVE_' + near_duplicate_of[eid]
        if reason and (reinclude == 'all' or eid in reinclude):
            row = {**row, 'prefilter_reincluded': reason}
            reason = None
        if reason is None:
            kept.append(row)
            continue
        occurrence = (row.get('occurrences') or [{}])[0]
        filtered.append({'evidence_id': eid, 'status': reason, 'detail': detail,
                         **({'near_duplicate_of': near_duplicate_of[eid]} if reason == 'filtered_near_duplicate' else {}),
                         'signals': signals, 'words': words, 'title': occurrence.get('title'),
                         'url': occurrence.get('url'), 'lane': occurrence.get('lane'),
                         'acquired_text_path': occurrence.get('acquired_text_path'),
                         'locator': occurrence.get('locator'),
                         'excerpt_preview': text[:160], 're_include_with': 'PCT_PREFILTER_REINCLUDE=' + eid})
    by_reason = {r: sum(f['status'] == r for f in filtered) for r in REASONS}
    report = {'policy': POLICY, 'role': 'MODEL_BUDGET_PREFILTER_NOT_TRUTH_OR_RELEVANCE_VERDICT',
              'settings': cfg, 'name_prefixes': prefixes, 'relevance_gate_applied': relevance,
              'collected': len(records), 'kept': len(kept), 'filtered_out': len(filtered),
              'filtered_by_reason': by_reason,
              'reincluded': [r['evidence_id'] for r in kept if r.get('prefilter_reincluded')],
              'filtered': filtered, 'deleted': 0}
    return kept, filtered, report


def windows(records, question_kind, prefixes, passages, quote_occurrences, digest, env=None):
    """Replace long excerpts by sentence windows around literal name hits.

    passages/quote_occurrences/digest are injected from semantic_research_answer
    so windows use the exact sentence split and locator arithmetic the
    validators and citations use.
    """
    cfg = settings(env)
    span = cfg['window_sentences']
    report = {'policy': POLICY, 'window_sentences': span, 'applied': False,
              'excerpts_windowed': 0, 'windows': 0, 'chars_full': 0, 'chars_sent': 0}
    if not span or question_kind not in cfg['window_kinds'] or not prefixes:
        report['chars_full'] = report['chars_sent'] = sum(len(r.get('text') or '') for r in records)
        return list(records), report
    report['applied'] = True
    out = []
    for row in records:
        text = row.get('text') or ''
        report['chars_full'] += len(text)
        parts = passages(text)
        hits = [p['passage_id'] for p in parts if name_hit(p['text'], prefixes)]
        if not hits or len(parts) <= 2 * span + 1:
            out.append(row); report['chars_sent'] += len(text); continue
        ranges = []
        for h in hits:
            a, b = max(0, h - span), min(len(parts) - 1, h + span)
            if ranges and a <= ranges[-1][1] + 1:
                ranges[-1][1] = max(ranges[-1][1], b)
            else:
                ranges.append([a, b])
        covered = sum(parts[b]['end_char'] - parts[a]['start_char'] for a, b in ranges)
        if covered >= cfg['window_max_fraction'] * len(text):
            out.append(row); report['chars_sent'] += len(text); continue
        report['excerpts_windowed'] += 1
        for a, b in ranges:
            start, end = parts[a]['start_char'], parts[b]['end_char']
            excerpt = text[start:end]
            out.append({**row, 'evidence_id': 'e-' + digest([row['evidence_id'], 'window', start, end])[:20],
                        'text': excerpt, 'parent_evidence_id': row['evidence_id'],
                        'occurrences': quote_occurrences(row, start, excerpt),
                        'model_window': {'policy': POLICY, 'parent_evidence_id': row['evidence_id'],
                                         'start_char': start, 'end_char': end,
                                         'sentence_range': [a, b], 'hit_sentence_ids': [h for h in hits if a <= h <= b],
                                         'full_excerpt_chars': len(text),
                                         'full_excerpt_sha256': digest(text),
                                         'role': 'MODEL_INPUT_WINDOW_FULL_EXCERPT_REMAINS_THE_CITATION_CONTEXT'}})
            report['windows'] += 1
            report['chars_sent'] += len(excerpt)
    return out, report


def compact(value):
    """Smaller per-item JSON for prefiltered records (header carries constants)."""
    value = dict(value)
    value['uncertainties'] = [u for u in value.get('uncertainties') or [] if u not in UNIVERSAL_FLAGS]
    value['source_bibliography'] = {k: v for k, v in (value.get('source_bibliography') or {}).items() if v is not None}
    source = dict(value.get('consulted_source') or {})
    if isinstance(source.get('title'), str) and len(source['title']) > 120:
        source['title'] = source['title'][:117] + '...'
    value['consulted_source'] = source
    value.pop('source_independence', None)
    if value.get('repeated_occurrences') == 1:
        value.pop('repeated_occurrences')
    return {k: v for k, v in value.items() if v not in (None, [], {})}


COMPACT_HEADER = (' Every EVIDENCE_JSON item additionally carries the uncertainties ' + ', '.join(UNIVERSAL_FLAGS)
                  + ' and source_independence UNKNOWN_NOT_ESTABLISHED, omitted per item to save context.'
                  + ' An item marked excerpt_window shows only the sentences around a name mention of a longer'
                  + ' excerpt; passage_ids refer to the sentences shown, and the full excerpt stays linked for citation.')
