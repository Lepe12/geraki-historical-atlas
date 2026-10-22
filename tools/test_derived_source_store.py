"""Content-addressed derived inputs: written once, read back byte-identical."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from derived_source_store import (compact, durable_text_path, materialize, read_bytes, resolve,
                                  store_path, MANIFEST)


def tree(root):
    root = Path(root)
    return {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(root.rglob('*')) if p.is_file()}


class DerivedSourceStore(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.run = Path(self.temp.name) / 'evidence/runs/123'
        self.run.mkdir(parents=True)

    def make_pass(self, name, texts):
        derived = self.run / name / 'derived_sources'
        for relative, content in texts.items():
            path = derived / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding='utf-8')
        return self.run / name

    def test_second_pass_with_same_inputs_writes_no_new_objects(self):
        texts = {'greek/library_acquisition/a.txt': 'Χειμάρρα 1660', 'greek/library_acquisition/acquisition_report.json': '{"results":[]}',
                 'derivation_receipt.json': '{}'}
        first = compact(self.run, self.make_pass('semantic_reanalysis_1', texts))
        self.assertEqual((first['status'], first['files'], first['new_objects']), ('COMPACTED', 3, 3))
        second = compact(self.run, self.make_pass('semantic_reanalysis_2', texts))
        self.assertEqual((second['new_objects'], second['reused_objects'], second['new_object_bytes']), (0, 3, 0))
        self.assertFalse((self.run / 'semantic_reanalysis_2/derived_sources').exists())
        self.assertTrue((self.run / 'semantic_reanalysis_2' / MANIFEST).is_file())
        self.assertEqual(len(list((self.run / 'sources/by-sha256').iterdir())), 3)
        for name in ('semantic_reanalysis_1', 'semantic_reanalysis_2'):
            for relative, content in texts.items():
                self.assertEqual(read_bytes(self.run, name + '/derived_sources/' + relative), content.encode())
        # Original suffixes stay visible to importers that filter by extension.
        sha = hashlib.sha256(texts['greek/library_acquisition/a.txt'].encode()).hexdigest()
        self.assertTrue((self.run / store_path(self.run, sha, 'a.txt')).is_file())
        self.assertTrue(store_path(self.run, sha, 'a.txt').endswith(sha + '.txt'))

    def test_old_format_pass_with_full_copy_is_read_unchanged(self):
        self.make_pass('semantic_reanalysis_9', {'lane/library_acquisition/a.txt': 'old full copy'})
        logical = 'semantic_reanalysis_9/derived_sources/lane/library_acquisition/a.txt'
        self.assertEqual(resolve(self.run, logical), (self.run / logical).resolve())
        self.assertEqual(read_bytes(self.run, logical), b'old full copy')
        self.assertFalse((self.run / 'sources').exists())
        copy = materialize(self.run, 'semantic_reanalysis_9', Path(self.temp.name) / 'copy')
        self.assertEqual(tree(copy), tree(self.run / 'semantic_reanalysis_9/derived_sources'))

    def test_lane_paths_are_not_remapped(self):
        (self.run / 'greek/library_acquisition').mkdir(parents=True)
        (self.run / 'greek/library_acquisition/a.txt').write_text('lane text')
        self.assertEqual(read_bytes(self.run, 'greek/library_acquisition/a.txt'), b'lane text')
        self.assertEqual(durable_text_path('greek/library_acquisition/a.txt', 'a' * 64), 'greek/library_acquisition/a.txt')
        self.assertEqual(durable_text_path('semantic_reanalysis_5/derived_sources/g/x.txt', 'a' * 64),
                         'sources/by-sha256/' + 'a' * 64 + '.txt')

    def test_materialize_rebuilds_identical_tree(self):
        texts = {'a/library_acquisition/x.txt': 'x' * 100, 'a/structured_output/extracted_findings.json': '{"findings":[]}'}
        pass_dir = self.make_pass('semantic_reanalysis_3', texts)
        before = tree(pass_dir / 'derived_sources')
        compact(self.run, pass_dir)
        copy = materialize(self.run, 'semantic_reanalysis_3', Path(self.temp.name) / 'rebuilt')
        self.assertEqual(tree(copy), before)

    def test_tampered_object_and_unsafe_paths_fail_closed(self):
        pass_dir = self.make_pass('semantic_reanalysis_4', {'l/library_acquisition/a.txt': 'genuine'})
        compact(self.run, pass_dir)
        obj = next((self.run / 'sources/by-sha256').iterdir())
        obj.write_text('tampered')
        with self.assertRaisesRegex(ValueError, 'STORED_OBJECT_CHECKSUM_MISMATCH'):
            read_bytes(self.run, 'semantic_reanalysis_4/derived_sources/l/library_acquisition/a.txt')
        with self.assertRaisesRegex(ValueError, 'STORED_OBJECT_CHECKSUM_MISMATCH'):
            compact(self.run, self.make_pass('semantic_reanalysis_5', {'l/library_acquisition/a.txt': 'genuine'}))
        with self.assertRaisesRegex(ValueError, 'UNSAFE'):
            resolve(self.run, '../outside.txt')
        with self.assertRaises(FileNotFoundError):
            resolve(self.run, 'semantic_reanalysis_4/derived_sources/missing.txt')
        with self.assertRaisesRegex(ValueError, 'PASS_MUST_BE'):
            compact(self.run, self.run / 'greek')

    def test_symlinks_are_rejected(self):
        pass_dir = self.make_pass('semantic_reanalysis_6', {'l/a.txt': 'x'})
        (pass_dir / 'derived_sources/l/link.txt').symlink_to(pass_dir / 'derived_sources/l/a.txt')
        with self.assertRaisesRegex(ValueError, 'REGULAR_DERIVED_FILES_ONLY'):
            compact(self.run, pass_dir)

    def test_citation_replay_and_evidence_bundle_after_compaction(self):
        from persistent_evidence_bundle import build as bundle
        from research_validation_report import replay_citations
        text = 'Ο πειρατής Καψής στη Μήλο το 1677.'
        logical_rel = 'greek/library_acquisition/a.txt'
        pass_dir = self.make_pass('semantic_reanalysis_7', {logical_rel: text})
        sha = hashlib.sha256(text.encode()).hexdigest()
        quote = 'Καψής στη Μήλο'
        start = text.index(quote)
        occurrence = {'url': 'https://example.org/a', 'acquired_text_path': 'semantic_reanalysis_7/derived_sources/' + logical_rel,
                      'source_text_sha256': sha, 'locator': {'start_char': start, 'end_char': start + len(quote)}}
        answer = {'research_run_id': '123', 'claims': [{'claim_id': 'c1', 'quote': quote, 'kind': 'source_statement',
                  'statement': 's', 'source_occurrences': [occurrence]}], 'review': {'supported_claim_ids': ['c1']}}
        before = replay_citations(self.run, answer, {'c1'})
        out = pass_dir / 'research_answer'
        out.mkdir()
        built = bundle(answer)
        (out / 'historical_evidence_bundle.json').write_text(json.dumps(built))
        self.assertEqual(built['sources'][0]['text_path'], 'sources/by-sha256/' + sha + '.txt')
        self.assertEqual(built['sources'][0]['analysis_text_path'], occurrence['acquired_text_path'])
        compact(self.run, pass_dir)
        after = replay_citations(self.run, answer, {'c1'})
        self.assertEqual(before, after)
        self.assertEqual(after[0]['status'], 'PASS')
        self.assertEqual((self.run / built['sources'][0]['text_path']).read_bytes(), text.encode())

    def test_poppler_prepared_inputs_collect_identically_after_compaction(self):
        from prepare_acquired_analysis import prepare
        from semantic_research_answer import collect
        from test_source_acquisition_routes import two_column_pdf
        lane = self.run / 'greek'
        library = lane / 'library_acquisition'
        library.mkdir(parents=True)
        raw, _, _ = two_column_pdf()
        (library / 'doc.pdf').write_bytes(raw)
        subprocess.run(['pdftotext', '-layout', str(library / 'doc.pdf'), str(library / 'doc.txt')], check=True)
        source = {'status': 'TEXT_ACQUIRED', 'title': 'Synthetic source', 'url': 'https://example.org/source.pdf',
                  'files': ['library_acquisition/doc.pdf', 'library_acquisition/doc.txt']}
        (library / 'acquisition_report.json').write_text(json.dumps({'results': [source]}))
        request = {'target': 'Pirate bases and anchorages in the Mediterranean', 'aliases': [], 'date_range': '1600-1700', 'purpose': 'Test'}
        pass_dir = self.run / 'semantic_reanalysis_8'
        prepare(self.run, pass_dir / 'derived_sources', request)
        rows, excluded = collect(pass_dir / 'derived_sources', provenance_root=self.run)
        self.assertTrue(rows)
        compact(self.run, pass_dir)
        rebuilt = materialize(self.run, 'semantic_reanalysis_8', pass_dir / 'derived_sources')
        again, excluded_again = collect(rebuilt, provenance_root=self.run)
        self.assertEqual((again, excluded_again), (rows, excluded))
        for row in rows:
            for occurrence in row['occurrences']:
                self.assertEqual(hashlib.sha256(read_bytes(self.run, occurrence['acquired_text_path'])).hexdigest(),
                                 occurrence['source_text_sha256'])


if __name__ == '__main__':
    unittest.main()
