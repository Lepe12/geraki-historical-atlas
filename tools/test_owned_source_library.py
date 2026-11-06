"""Fixture tests for the owned published-source library scanner.

Uses a tiny temp catalog and short txt only — never the real copyrighted PDFs.
"""
import os
import tempfile
import unittest
from pathlib import Path

from owned_source_library import (
    ENV_VAR,
    acquire_owned_query,
    inject_into_results,
    list_published_sources,
    match_sources,
    parse_katalogos,
    resolve_root,
    search_as_citation_rows,
)


FIXTURE_CATALOG = """# Test library

## Δημοσιευμένες πηγές

1. **Ioannou, Panagiotis.** «Oi fourtounes tou kapetan Petrou Lantza». *Thesaurismata* 30 (2000), σσ. 277–299.
   - PDF: `Ioannou_2000_Lantza.pdf`
   - Κείμενο: ίδιο όνομα, κατάληξη `.txt`

2. **Floristán, José M.** «Jerónimo Combis, capitán de estradiotes». *Erytheia* 36 (2015), σσ. 151 κ.ε.
   - PDF: `Floristan_2015_Combis.pdf`
   - Κείμενο: ίδιο όνομα, κατάληξη `.txt`

## Σημειώσεις εργασίας

Στον φάκελο `simeioseis-ergasias/`. Δεν είναι δημοσιευμένες πηγές.

- `notes.md` — working notes only.
"""


class OwnedSourceLibraryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'KATALOGOS.md').write_text(FIXTURE_CATALOG, encoding='utf-8')
        pairs = {
            'Ioannou_2000_Lantza.pdf': b'%PDF-1.4 fixture',
            'Ioannou_2000_Lantza.txt': 'Petros Lantzas served in Parga in 1573.\n',
            'Floristan_2015_Combis.pdf': b'%PDF-1.4 fixture',
            'Floristan_2015_Combis.txt': 'Jerónimo Combis in Naples espionage service.\n',
        }
        for name, body in pairs.items():
            path = self.root / name
            if name.endswith('.pdf'):
                path.write_bytes(body)
            else:
                path.write_text(body, encoding='utf-8')
        notes = self.root / 'simeioseis-ergasias'
        notes.mkdir()
        (notes / 'notes.md').write_text('working note — not citable', encoding='utf-8')
        # A stray pair under notes must never be listed even if present.
        (notes / 'Secret_1999.pdf').write_bytes(b'%PDF-1.4')
        (notes / 'Secret_1999.txt').write_text('secret', encoding='utf-8')

    def test_parse_katalogos_stops_before_working_notes(self):
        entries = parse_katalogos(FIXTURE_CATALOG)
        self.assertEqual(len(entries), 2)
        self.assertEqual(entries[0]['author'], 'Ioannou, Panagiotis')
        self.assertEqual(entries[0]['year'], 2000)
        self.assertIn('fourtounes', entries[0]['title'].casefold())
        self.assertEqual(entries[0]['pdf_name'], 'Ioannou_2000_Lantza.pdf')
        self.assertEqual(entries[0]['pages'], '277–299')

    def test_list_skips_working_notes_and_requires_pdf_txt_pair(self):
        sources = list_published_sources(root=self.root)
        self.assertEqual(len(sources), 2)
        names = {s['pdf_name'] for s in sources}
        self.assertEqual(names, {'Ioannou_2000_Lantza.pdf', 'Floristan_2015_Combis.pdf'})
        self.assertTrue(all(s['source_origin'] == 'OWNED_PUBLISHED_LIBRARY' for s in sources))

    def test_resolve_root_env_and_missing(self):
        self.assertIsNone(resolve_root({ENV_VAR: str(self.root / 'missing')}))
        self.assertEqual(resolve_root({ENV_VAR: str(self.root)}), self.root)
        # Empty env falls back to DEFAULT_ROOT only when that directory exists.
        empty = resolve_root({})
        if Path('/workspace/bibliothiki-piges').is_dir():
            self.assertEqual(empty, Path('/workspace/bibliothiki-piges'))
        else:
            self.assertIsNone(empty)

    def test_match_and_inject_before_web(self):
        hits = match_sources('Lantza Parga Ioannou 2000', root=self.root)
        self.assertEqual(len(hits), 1)
        self.assertEqual(hits[0]['year'], 2000)
        out = self.root / 'acq'
        results = []
        added = inject_into_results(results, out, ['Πέτρος Λάντζας', 'Lantza', 'Petros'], root=self.root)
        # Latin catalog tokens: "Lantza" should match.
        self.assertGreaterEqual(len(added), 1)
        self.assertEqual(results[0]['acquisition_route'], 'OWNED_LIBRARY')
        self.assertEqual(results[0]['status'], 'TEXT_ACQUIRED')
        self.assertTrue(Path(results[0]['files'][0]).is_file())
        self.assertIn('Lantzas', Path(results[0]['files'][0]).read_text(encoding='utf-8'))
        self.assertFalse(results[0]['original_inspected'])
        # Idempotent
        self.assertEqual(inject_into_results(results, out, ['Lantza'], root=self.root), [])

    def test_citation_rows_and_acquire_query(self):
        rows = search_as_citation_rows('Jerónimo Combis estradiotes', root=self.root)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['acquisition_route'], 'OWNED_LIBRARY')
        acquired = acquire_owned_query('Combis Naples Floristán', self.root / 'out', root=self.root)
        self.assertEqual(len(acquired), 1)
        self.assertEqual(acquired[0]['bibliography']['year'], 2015)

    def test_absent_library_is_noop(self):
        env = {ENV_VAR: str(self.root / 'nope')}
        self.assertEqual(list_published_sources(env=env), [])
        self.assertEqual(inject_into_results([], self.root / 'x', ['Lantza'], env=env), [])


if __name__ == '__main__':
    unittest.main()
