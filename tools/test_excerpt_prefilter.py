"""Offline tests for the no-LLM pre-filter and sentence windows (excerpt_prefilter.py)."""
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from excerpt_prefilter import COMPACT_HEADER, dehyphenate, gate, name_hit, name_prefixes, settings, windows
from semantic_research_answer import digest, execute, model_evidence, passages, quote_occurrences, render


def row(eid, text, years=(), flags=(), title='Book', lane='travellers'):
    return {'evidence_id': eid, 'text': text, 'years_in_scope': list(years), 'similar_text_fingerprint': eid,
            'uncertainties': ['ORIGINAL_NOT_INSPECTED', 'SOURCE_GENEALOGY_PENDING', 'INDEPENDENCE_UNRESOLVED', *flags],
            'source_bibliography': {'creator': 'Tournefort', 'date': None},
            'occurrences': [{'title': title, 'lane': lane, 'url': 'https://example.org/' + eid,
                             'locator': {'start_char': 100, 'end_char': 100 + len(text), 'start_line': 5}}]}


PROSE = 'The traveller describes the harbour, the town and the customs of its people in some detail.'
KIM = dict(target='Κίμωλος', aliases=['Argentiera', 'Argentière', 'Kimolos'])
NOGAZ = {'gazetteer': '/nonexistent.json'}


def run_gate(records, kind='place', env=None, **kw):
    args = {**KIM, **kw}
    return gate(records, kind, args['target'], args['aliases'], args.get('date_range', ''), args.get('purpose', ''),
                near_duplicate_of=args.get('near_duplicate_of'), env=env or {}, **NOGAZ)


class Matching(unittest.TestCase):
    def test_literal_prefixes_not_french_money(self):
        prefixes = name_prefixes(['Argentière', 'Κίμωλος', 'Kimolos'])
        self.assertIn('argentie', prefixes); self.assertIn('κιμωλ', prefixes)
        self.assertTrue(name_hit('the island of Argentiera', prefixes))
        self.assertTrue(name_hit('στην Κιμώλου', prefixes))
        self.assertFalse(name_hit("il n'a point d'argent pour payer", prefixes))

    def test_ocr_line_break_hyphenation_still_matches(self):
        prefixes = name_prefixes(['Argentiera', 'Kimolos'])
        self.assertEqual(dehyphenate('Argen-  tiera'), 'Argentiera')
        self.assertTrue(name_hit('the women of Milo and Argen-  TiERA are', prefixes))
        self.assertTrue(name_hit('die Inseln Milos, Ki-\nmolos und Polivos', prefixes))


class Gate(unittest.TestCase):
    def test_irrelevant_dropped_but_listed_and_never_deleted(self):
        records = [row('e-k', 'At Argentiera the corsairs anchored. ' + PROSE),
                   row('e-x', 'Il colle di Ruscone, buono a cavallo, comincia sopra Villaluisa e va a cadere a Brianzone.')]
        kept, filtered, report = run_gate(records)
        self.assertEqual([r['evidence_id'] for r in kept], ['e-k'])
        self.assertEqual(filtered[0]['evidence_id'], 'e-x')
        self.assertEqual(filtered[0]['status'], 'filtered_irrelevant')
        self.assertEqual(filtered[0]['re_include_with'], 'PCT_PREFILTER_REINCLUDE=e-x')
        self.assertEqual(filtered[0]['url'], 'https://example.org/e-x')
        self.assertEqual(report['collected'], 2); self.assertEqual(report['deleted'], 0)
        self.assertEqual(report['filtered_by_reason']['filtered_irrelevant'], 1)

    def test_date_window_or_purpose_keeps_excerpt_without_name(self):
        records = [row('e-d', 'In 1672 the inhabitants paid tribute to both sides. ' + PROSE, years=[1672]),
                   row('e-p', 'The corsairs careened their ships in the bay and sold their prizes. ' + PROSE)]
        kept, filtered, _ = run_gate(records, date_range='1660-1680', purpose='role for corsairs and pirates')
        self.assertEqual({r['evidence_id'] for r in kept}, {'e-d', 'e-p'}); self.assertEqual(filtered, [])

    def test_title_mention_keeps(self):
        kept, _, _ = run_gate([row('e-t', PROSE, title='Voyage to Argentiera')])
        self.assertEqual(len(kept), 1)

    def test_tables_metadata_short_and_duplicates(self):
        records = [row('e-ok', 'Argentiera ' + PROSE),
                   row('e-tab', 'Kimolos 30 6.88 Milos 48 5.54 Anafi 37 5.99 Santorini 20 3.40 Kiklades 157 9.38 total 1234'),
                   row('e-meta', 'Argentiera ' + PROSE + ' catalogue', flags=['CATALOGUE_METADATA']),
                   row('e-short', 'Argentiere, Milo.'),
                   row('e-dup', 'Argentiera  ' + PROSE.replace('people', 'peo-ple'))]
        kept, filtered, report = run_gate(records, near_duplicate_of={'e-dup': 'e-ok'})
        self.assertEqual([r['evidence_id'] for r in kept], ['e-ok'])
        status = {f['evidence_id']: f['status'] for f in filtered}
        self.assertEqual(status, {'e-tab': 'filtered_low_quality_table', 'e-meta': 'filtered_low_quality_metadata',
                                  'e-short': 'filtered_low_quality_short', 'e-dup': 'filtered_near_duplicate'})
        self.assertEqual([f for f in filtered if f['evidence_id'] == 'e-dup'][0]['near_duplicate_of'], 'e-ok')
        self.assertEqual(report['kept'] + report['filtered_out'], len(records))

    def test_reinclude_by_id_or_all_and_thresholds_from_env(self):
        records = [row('e-ok', 'Argentiera ' + PROSE), row('e-short', 'Argentiere, Milo.')]
        kept, filtered, report = run_gate(records, env={'PCT_PREFILTER_REINCLUDE': 'e-short'})
        self.assertEqual(len(kept), 2); self.assertEqual(filtered, [])
        self.assertEqual(report['reincluded'], ['e-short'])
        self.assertEqual(len(run_gate(records, env={'PCT_PREFILTER_REINCLUDE': 'all'})[0]), 2)
        self.assertEqual(len(run_gate(records, env={'PCT_PREFILTER_MIN_WORDS': '1'})[0]), 2)
        self.assertEqual(settings({'PCT_PREFILTER_MAX_DIGIT_RATIO': '0.3'})['max_digit_ratio'], 0.3)
        self.assertFalse(settings({'PCT_PREFILTER': '0'})['enabled'])

    def test_relevance_gate_not_applied_to_topics_by_default(self):
        records = [row('e-x', 'A long discussion of Venetian convoys and Ottoman fleets in the archipelago. ' + PROSE)]
        kept, _, report = run_gate(records, kind='topic')
        self.assertEqual(len(kept), 1); self.assertFalse(report['relevance_gate_applied'])

    def test_deterministic(self):
        records = [row('e-%d' % i, ('Argentiera ' if i % 2 else 'Brianzone ') + PROSE) for i in range(10)]
        self.assertEqual(run_gate(records), run_gate(records))


def sentences(n, hit_at=()):
    return ' '.join(('Sentence %s mentions Argentiera here.' if i in hit_at else 'Sentence %s is about something else entirely.') % i
                    for i in range(n))


class Windows(unittest.TestCase):
    def run_windows(self, records, kind='place', env=None):
        return windows(records, kind, name_prefixes(['Argentiera']), passages, quote_occurrences, digest, env or {})

    def test_window_keeps_exact_offsets_and_links_full_excerpt(self):
        parent = row('e-long', sentences(20, hit_at=(10,)))
        out, report = self.run_windows([parent])
        self.assertEqual(len(out), 1); child = out[0]
        start, end = child['model_window']['start_char'], child['model_window']['end_char']
        self.assertEqual(parent['text'][start:end], child['text'])
        self.assertEqual(child['parent_evidence_id'], 'e-long')
        self.assertEqual(child['model_window']['sentence_range'], [8, 12])
        self.assertEqual(child['occurrences'][0]['locator']['start_char'], 100 + start)
        self.assertIn('Argentiera', child['text'])
        self.assertLess(report['chars_sent'], report['chars_full'])

    def test_overlapping_hits_merge_and_distant_hits_split(self):
        out, _ = self.run_windows([row('e-a', sentences(30, hit_at=(5, 7, 25)))])
        self.assertEqual([c['model_window']['sentence_range'] for c in out], [[3, 9], [23, 27]])

    def test_short_or_unmatched_or_disabled_unchanged(self):
        short = row('e-s', sentences(4, hit_at=(1,)))
        nohit = row('e-n', sentences(20))
        self.assertEqual(self.run_windows([short, nohit])[0], [short, nohit])
        long_ = row('e-l', sentences(20, hit_at=(10,)))
        self.assertEqual(self.run_windows([long_], env={'PCT_PREFILTER_WINDOW_SENTENCES': '0'})[0], [long_])
        self.assertEqual(self.run_windows([long_], kind='person')[0], [long_])

    def test_compact_model_view_is_smaller_and_keeps_ids(self):
        out, _ = self.run_windows([row('e-long', sentences(20, hit_at=(10,)))])
        full = model_evidence(out[0]); compact = model_evidence({**out[0], 'model_view': 'compact'})
        self.assertLess(len(json.dumps(compact)), len(json.dumps(full)))
        self.assertEqual(compact['evidence_id'], full['evidence_id'])
        self.assertEqual(compact['passages'], full['passages'])
        self.assertTrue(compact['excerpt_window'])
        self.assertNotIn('ORIGINAL_NOT_INSPECTED', compact.get('uncertainties', []))
        self.assertIn('ORIGINAL_NOT_INSPECTED', COMPACT_HEADER)


def finding(base, name, text, fid):
    (base / 'library_acquisition' / name).write_text(text)
    return {'finding_id': fid, 'file': name, 'url': 'https://example.org/' + fid, 'title': 'Synthetic travels',
            'source_text_sha256': hashlib.sha256(text.encode()).hexdigest(), 'evidence_excerpt': text,
            'years_in_scope': [], 'date_basis': 'UNRESOLVED', 'uncertainties': ['ORIGINAL_NOT_INSPECTED'],
            'locator': {'start_char': 0, 'end_char': len(text), 'start_line': 1, 'end_line': 1}}


class Pipeline(unittest.TestCase):
    def test_filtered_items_listed_in_answer_queue_funnel_and_report(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp) / 'travellers'
            for d in ('structured_output', 'library_acquisition', 'run_manifest'):
                (base / d).mkdir(parents=True)
            keep = 'At Argentiera the inhabitants traded with the corsairs who anchored in the harbour every winter.'
            drop = 'Il colle di Ruscone, buono a cavallo, comincia sopra Villaluisa e va a cadere sopra Brianzone.'
            findings = [finding(base, 'a.txt', keep, 'f-keep'), finding(base, 'b.txt', drop, 'f-drop')]
            (base / 'structured_output/extracted_findings.json').write_text(json.dumps({'findings': findings}))
            (base / 'run_manifest/manifest.json').write_text(json.dumps({'normalized_request': {
                'target': 'Κίμωλος', 'aliases': ['Argentiera', 'Kimolos']}}))
            with patch.dict(os.environ, {'PCT_EXCERPT_RANKING': '1'}):
                out = execute(tmp, 'Argentiera', config={'configured': False, 'missing': []})
            pre = out['coverage']['prefilter']
            self.assertEqual(pre['filtered_out'], 1)
            self.assertEqual(pre['filtered'][0]['status'], 'filtered_irrelevant')
            self.assertEqual(out['coverage']['collected_unique_passages'], 2)
            self.assertEqual(out['coverage']['unique_passages'], 1)
            funnel = out['research_funnel']
            self.assertEqual(funnel['collected']['unique_excerpts'], 2)
            self.assertEqual(funnel['prefilter']['filtered_out'], 1)
            self.assertEqual(funnel['prefilter']['filtered_by_reason']['filtered_irrelevant'], 1)
            queue_root = Path(tmp) / 'research_continuation'
            queue = json.loads((queue_root / json.loads((queue_root / 'active.json').read_text())['queue']).read_text())
            self.assertEqual(queue['total'], 1); self.assertEqual(queue['filtered'], 1)
            self.assertEqual([i['status'] for i in queue['items']], ['PENDING', 'FILTERED'])
            text = render({**out, 'status': 'X', 'coverage': {**out['coverage'], 'selected_passages': 0}})
            self.assertIn('No-LLM filter', text); self.assertIn('PCT_PREFILTER_REINCLUDE', text)
            from continuation_rounds import record
            ledger = record(tmp, out, 0, 'research_answer', env={})
            self.assertEqual(ledger['rounds'][0]['prefilter']['filtered_out'], 1)
            self.assertEqual(ledger['rounds'][0]['collected'], 2)
            with patch.dict(os.environ, {'PCT_PREFILTER': '0'}):
                off = execute(tmp, 'Argentiera', config={'configured': False, 'missing': []})
            self.assertIsNone(off['coverage']['prefilter']); self.assertEqual(off['coverage']['unique_passages'], 2)


if __name__ == '__main__':
    unittest.main()
