"""Offline tests for opt-in parallel semantic reading (shards + merge); no model, no network."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
import unittest
from unittest.mock import patch

from semantic_research_answer import execute, render, semantic_shard, shard_groups
from continuation_rounds import record

PLACES = ['Kimolos', 'Milos', 'Sifnos', 'Paros', 'Naxos']


def text_of(place):
    return 'In 1677 the ships attacked the island of %s. The account is uncertain.' % place


def fixture(root):
    for place in PLACES:
        text = text_of(place)
        base = Path(root) / ('lane_' + place.lower())
        (base / 'structured_output').mkdir(parents=True)
        (base / 'library_acquisition').mkdir()
        (base / 'library_acquisition/doc.txt').write_text(text)
        finding = {'finding_id': place, 'file': 'doc.txt', 'url': 'https://example.org/' + place,
                   'title': 'Synthetic source ' + place,
                   'source_text_sha256': hashlib.sha256(text.encode()).hexdigest(),
                   'evidence_excerpt': text, 'years_in_scope': [1677], 'date_basis': 'EXPLICIT_PARAGRAPH',
                   'uncertainties': ['ORIGINAL_NOT_INSPECTED'],
                   'locator': {'start_char': 0, 'end_char': len(text), 'start_line': 1, 'end_line': 1}}
        (base / 'structured_output/extracted_findings.json').write_text(json.dumps({'findings': [finding]}))


def response(value):
    return {'status': 'COMPLETED', 'provider': 'simulated-test', 'model': 'fixture', 'content': json.dumps(value)}


class Caller:
    """Deterministic simulated model: one claim per evidence item."""
    def __init__(self, forbid=()):
        self.calls, self.extracted, self.forbid = [], [], set(forbid)

    def __call__(self, role, prompt):
        if role in self.forbid:
            raise AssertionError('unexpected new model call: ' + role)
        self.calls.append(role)
        if role == 'evidence_extractor':
            evidence = json.loads(prompt.split('EVIDENCE_JSON:\n', 1)[1].split('\n', 1)[0])
            items = []
            for row in evidence:
                self.extracted.append(row['evidence_id'])
                place = re.search(r'island of (\w+)', ' '.join(x['text'] for x in row['passages'])).group(1)
                items.append({'statement': 'The consulted source reports an attack on %s in 1677.' % place,
                              'evidence_id': row['evidence_id'], 'quote': text_of(place), 'kind': 'source_statement',
                              'actors': [], 'places': [place], 'dates': ['1677'], 'uncertainty': []})
            return response({'items': items})
        if role == 'adversarial_reviewer':
            if 'FINAL_ANSWER_JSON:' in prompt:
                sections = json.loads(prompt.split('FINAL_ANSWER_JSON:\n', 1)[1])['sections']
                return response({'supported_section_indexes': list(range(len(sections))), 'flagged_sections': []})
            cid = json.loads(prompt.split('CLAIMS_JSON:\n')[1])[0]['claim_id']
            return response({'supported_claim_ids': [cid], 'flagged_claims': [], 'contradictions': [], 'limitations': []})
        if role == 'synthesis':
            ids = sorted(set(re.findall(r'"claim_id": "([^"]+)"', prompt)))
            return response({'answer_sections': [{'text': 'The consulted sources report attacks in 1677.', 'claim_ids': ids}],
                             'unknowns': ['Actors not identified'], 'limitations': []})
        raise AssertionError(role)


BASE_ENV = {'PCT_SEMANTIC_BATCH_CHARS': '1200', 'PCT_SEMANTIC_BATCHES': '6', 'PCT_SEMANTIC_PARTIAL_ANSWER': '1',
            'PCT_ENABLE_RESPONSE_CACHE': '1', 'PCT_SEMANTIC_SHARD': '', 'PCT_SEMANTIC_MERGE': ''}
CONFIG = {'configured': True, 'missing': []}


class ShardSplit(unittest.TestCase):
    def test_parse_and_default_is_single_job(self):
        self.assertIsNone(semantic_shard({}))
        self.assertIsNone(semantic_shard({'PCT_SEMANTIC_SHARD': ''}))
        self.assertEqual(semantic_shard({'PCT_SEMANTIC_SHARD': '2/4'}), (2, 4))
        for bad in ('4/4', '1', 'a/b', '0/9'):
            with self.assertRaises(ValueError):
                semantic_shard({'PCT_SEMANTIC_SHARD': bad})

    def test_round_robin_by_rank_disjoint_complete_and_skips_read_batches(self):
        groups = [[{'evidence_id': 'e%d' % i}] for i in range(10)]
        done = {id(groups[1]), id(groups[4])}
        completed = lambda g: id(g) in done
        pending = [g for g in groups if not completed(g)]
        slices = [shard_groups(groups, completed, i, 3)[0] for i in range(3)]
        flat = [g[0]['evidence_id'] for s in slices for g in s]
        self.assertEqual(sorted(flat), sorted(g[0]['evidence_id'] for g in pending))
        self.assertEqual(len(flat), len(set(flat)))
        # Every shard starts with one of the top-ranked unread batches.
        self.assertEqual([s[0][0]['evidence_id'] for s in slices], ['e0', 'e2', 'e3'])
        self.assertEqual(slices, [shard_groups(groups, completed, i, 3)[0] for i in range(3)])
        mine, others = shard_groups(groups, completed, 0, 3)
        self.assertEqual({o['reason'] for o in others}, {'ASSIGNED_TO_OTHER_SHARD'})
        self.assertEqual(len(others) + sum(map(len, mine)), len(pending))


class ShardMerge(unittest.TestCase):
    def run_single(self, root):
        with patch.dict(os.environ, BASE_ENV):
            return execute(root, 'Synthetic question', caller=Caller(), config=CONFIG,
                           output_root=Path(root) / 'single', provenance_root=root)

    def test_shards_then_merge_equal_single_job_answer(self):
        with tempfile.TemporaryDirectory() as single_root, tempfile.TemporaryDirectory() as root:
            fixture(single_root); fixture(root)
            single = self.run_single(single_root)
            self.assertEqual(single['status'], 'MODEL_ANSWER_PENDING_HUMAN_REVIEW')
            shard_extracted, shard_answers = [], []
            # Each CI shard works on its own checkout of the same snapshot;
            # the merge job unpacks every shard's research_continuation/.
            shard_roots = [Path(root + '_shard_%d' % index) for index in range(2)]
            for shard_root in shard_roots:
                shutil.copytree(root, shard_root); self.addCleanup(shutil.rmtree, shard_root, True)
            for index, shard_root in enumerate(shard_roots):
                caller = Caller(forbid=('synthesis',))
                with patch.dict(os.environ, {**BASE_ENV, 'PCT_SEMANTIC_SHARD': '%d/2' % index}):
                    out = execute(shard_root, 'Synthetic question', caller=caller, config=CONFIG,
                                  output_root=shard_root / 'shard_out', provenance_root=shard_root)
                shutil.copytree(shard_root / 'research_continuation', Path(root) / 'research_continuation', dirs_exist_ok=True)
                self.assertEqual(out['status'], 'SHARD_EXTRACTION_AND_REVIEW_COMPLETE')
                self.assertEqual(out['semantic_shard']['count'], 2)
                self.assertNotIn('synthesis', caller.calls)
                shard_extracted.append(caller.extracted); shard_answers.append(out)
            self.assertFalse(set(shard_extracted[0]) & set(shard_extracted[1]))
            self.assertEqual(len(shard_extracted[0]) + len(shard_extracted[1]), len(PLACES))
            merge_caller = Caller(forbid=('evidence_extractor',))
            with patch.dict(os.environ, {**BASE_ENV, 'PCT_SEMANTIC_MERGE': '1'}):
                merged = execute(root, 'Synthetic question', caller=merge_caller, config=CONFIG,
                                 output_root=Path(root) / 'merge', provenance_root=root)
            self.assertEqual(merged['status'], single['status'])
            self.assertEqual(sorted(c['claim_id'] for c in merged['claims']),
                             sorted(c['claim_id'] for c in single['claims']))
            self.assertEqual(merged['research_funnel']['examined'], single['research_funnel']['examined'])
            # Same verdicts; each shard also spends its own review budget, so a
            # sharded round can leave fewer claims awaiting review, never more.
            self.assertLessEqual(set(single['review']['supported_claim_ids']), set(merged['review']['supported_claim_ids']))
            self.assertEqual(len(merged['review']['supported_claim_ids']), len(PLACES))
            self.assertLessEqual(len(merged['coverage']['claims_awaiting_review']), len(single['coverage']['claims_awaiting_review']))
            # Shard reviews are replayed from the response cache: only synthesis
            # and the final answer review are new model calls in the merge.
            self.assertEqual(merge_caller.calls, ['synthesis', 'adversarial_reviewer'])
            self.assertTrue(merged['semantic_shard_merge'])
            # Round ledger carries per-shard and total counts.
            merged['semantic_shards'] = {'count': 2, 'shards': [
                {'index': i, 'examined_excerpts': a['research_funnel']['examined']['excerpts'],
                 'model_calls': len(a['calls'])} for i, a in enumerate(shard_answers)],
                'total': {'examined_excerpts': sum(a['research_funnel']['examined']['excerpts'] for a in shard_answers)}}
            ledger = record(root, merged, 1, 'merge')
            self.assertEqual(ledger['rounds'][-1]['shards']['total']['examined_excerpts'], len(PLACES))
            merged['continuation_rounds'] = ledger
            self.assertIn('Parallel reading', render(merged))

    def test_merge_never_extracts_unread_batches(self):
        with tempfile.TemporaryDirectory() as root:
            fixture(root)
            with patch.dict(os.environ, {**BASE_ENV, 'PCT_SEMANTIC_SHARD': '0/2'}):
                execute(root, 'Synthetic question', caller=Caller(), config=CONFIG,
                        output_root=Path(root) / 'shard_0', provenance_root=root)
            with patch.dict(os.environ, {**BASE_ENV, 'PCT_SEMANTIC_MERGE': '1'}):
                merged = execute(root, 'Synthetic question', caller=Caller(forbid=('evidence_extractor',)),
                                 config=CONFIG, output_root=Path(root) / 'merge', provenance_root=root)
            self.assertEqual(len(merged['claims']), 3)
            self.assertEqual(merged['research_funnel']['examined']['remaining'], 2)
            self.assertEqual(merged['answer_scope'], 'PROVISIONAL_EXAMINED_PASSAGES_ONLY')


class ContinuationRoundReadsUnread(unittest.TestCase):
    """Kimolos 40857073690: rounds 2-5 read 0 new excerpts (stuck at 115/259)."""

    def test_round_2_shard_selects_only_unexamined_excerpts_despite_review_backlog(self):
        from semantic_research_answer import routing_summary
        with tempfile.TemporaryDirectory() as root:
            fixture(root)
            env = {**BASE_ENV, 'PCT_SEMANTIC_BATCHES': '2', 'PCT_SEMANTIC_SHARD': '0/1'}
            first = Caller()
            with patch.dict(os.environ, env):
                execute(root, 'Synthetic question', caller=first, config=CONFIG,
                        output_root=Path(root) / 'round_1', provenance_root=root)
            self.assertEqual(len(first.extracted), 2)
            # The previous round left claims awaiting review: before the fix this
            # zeroed the batch limit, so every shard selected 0 batches.
            previous = ({'question': 'Synthetic question', 'model_configuration': routing_summary(),
                         'coverage': {'claims_awaiting_review': ['c-pending']}}, {})
            second = Caller()
            with patch.dict(os.environ, env), patch('research_continuation.latest_analysis', return_value=previous):
                out = execute(root, 'Synthetic question', caller=second, config=CONFIG,
                              output_root=Path(root) / 'round_2', provenance_root=root)
            self.assertEqual(out['semantic_shard']['selected_batches'], 2)  # unread only
            self.assertEqual(len(second.extracted), 2)
            self.assertFalse(set(second.extracted) & set(first.extracted))
            # The merge pass of round 2 now counts 4 of 5 excerpts examined.
            with patch.dict(os.environ, {**BASE_ENV, 'PCT_SEMANTIC_MERGE': '1'}):
                merged = execute(root, 'Synthetic question', caller=Caller(forbid=('evidence_extractor',)),
                                 config=CONFIG, output_root=Path(root) / 'merge_2', provenance_root=root)
            self.assertEqual(merged['research_funnel']['examined']['excerpts'], 4)
            self.assertEqual(merged['research_funnel']['examined']['remaining'], 1)

    def test_chain_stops_when_a_round_reads_no_new_excerpt(self):
        from continuation_rounds import stop_rule
        cap = {'max_rounds': 5, 'no_gain_rounds': 2}
        rounds = [{'round': 0, 'remaining': 246, 'new_examined': 13, 'new_supported_claims': 0},
                  {'round': 1, 'remaining': 144, 'new_examined': 102, 'new_supported_claims': 8}]
        self.assertIsNone(stop_rule({'rounds': rounds}, cap))
        rounds.append({'round': 2, 'remaining': 144, 'new_examined': 0, 'new_supported_claims': 2})
        self.assertEqual(stop_rule({'rounds': rounds}, cap), 'NO_NEW_EXCERPTS_READ')


class ReanalysisModes(unittest.TestCase):
    def test_merge_summary_counts_and_missing_shards(self):
        from reanalyse_acquired_research import merge_summary
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp)
            (dest / 'shards/shard_0').mkdir(parents=True)
            (dest / 'shards/shard_0/shard_summary.json').write_text(json.dumps(
                {'index': 0, 'count': 2, 'examined_excerpts': 7, 'model_calls': 9, 'status': 'SHARD_EXTRACTION_AND_REVIEW_COMPLETE'}))
            summary = merge_summary(dest, 2)
            self.assertEqual(summary['total']['examined_excerpts'], 7)
            self.assertEqual(summary['missing_shards'], [1])


class WorkflowOptIn(unittest.TestCase):
    def test_default_is_one_job_and_shards_are_capped(self):
        root = Path(__file__).resolve().parents[1] / '.github/workflows'
        text = (root / 'research-semantic-reanalysis.yml').read_text()
        self.assertIn('semantic_shards:', text)
        self.assertIn("(needs.plan.outputs.shards || '1') == '1'", text)
        self.assertIn('--shard', text); self.assertIn('--merge-shards', text)
        self.assertIn('max(1,min(4', text)
        for name in ('Reanalyse actual sources ${{ matrix.parent_run }}', 'Reanalyse actual sources ${{ inputs.run_id }}'):
            self.assertIn(name, text)  # the coordinator sees every job of a busy corpus
        pct = (root / 'pct-parallel-multi-agent.yml').read_text()
        self.assertIn('semantic_shards:', pct)


if __name__ == '__main__':
    unittest.main()
