"""The question «Βρες στοιχεια για Κρεβελιε τον κουρσατο» must search, match and
read on the person Κρεβελιέ/Creveliers, not on the whole sentence.

Regression for live run 42984961899 (request ui-mwbu9zx3-cad5044d): the whole
sentence became the entity (kind=unknown, request_kind=place), libraries were
queried with the quoted sentence, the real Creveliers sources found on the web
were discarded as NO_TARGET_IDENTITY_MATCH and nothing was ever read. The same
rule applies to places: «ψάξε για την Κίμωλο» focuses on Κίμωλος.
No network, no GitHub run, no pct-live.
"""
import json
import tempfile
import unittest
from pathlib import Path

from orchestrator.research_query import extract_research_focus, split_research_query
from research_focus import decompose, focused_queries, request_focus, retrieval_names, topical_match, find_term_spans
from research_preflight import focus_context
from research_relevance import assess, discovery_queries, identity
from discovery_excerpt_acquisition import acquire_excerpt
from owned_source_library import inject_into_results

QUESTION = 'Βρες στοιχεια για Κρεβελιε τον κουρσατο'

# Real discoveries from run 42984961899 (titles/URLs/excerpt as recorded).
WIKIPEDIA = {
    'title': 'Ούγος ντε Κρεβελιέ', 'repository': 'Public Web Source Discovery',
    'url': 'https://el.wikipedia.org/wiki/%CE%9F%CF%8D%CE%B3%CE%BF%CF%82_%CE%BD%CF%84%CE%B5_%CE%9A%CF%81%CE%B5%CE%B2%CE%B5%CE%BB%CE%B9%CE%AD',
    'context_excerpt': ('Ούγος ντε Κρεβελιέ\n\n| Ιδιότητα | κουρσάρος |\n| Περίοδος ακμής | 17ος αιώνας |\n\n'
                        'Ο Ούγος ντε Κρεβελιέ ήταν διαβόητος και θηριώδης πειρατής, Γάλλος στη καταγωγή, που έδρασε '
                        'κυρίως στο Αιγαίο Πέλαγος, κατά το τελευταίο τέταρτο του 17ου αιώνα [1].\n\nΟ Κρεβελιέ στην '
                        'αρχή συγκρότησε στόλο από 12 γαλιότες και επεχείρησε κατάληψη νήσων του Αιγαίου.'),
}
OWNER_ARTICLE = {'title': 'Ούγος ντε Κρεβελιέ – Η Μάστιγα του Αιγαίου – Pirate Cartography',
                 'repository': 'Public Web Source Discovery', 'url': 'https://www.piratecartography.com/archives/4981'}
BOUKETO = {'title': 'Ο τρομερός πειρατής Κρεβελιέ | Μπουκέτο', 'repository': 'Public Web Source Discovery',
           'url': 'https://pleias.library.upatras.gr/index.php/bouketo/article/view/109753'}
HELIOS = {'title': 'Ήλιος - Αποθετήριο ΕΙΕ: Με αφορμή τον θάνατο του Creveliers στην Αστυπάλαια. Ο ρόλος του νησιού '
                   'στις καταδρομικές επιχειρήσεις των καθολικών κουρσάρων κατά τον 17ο αιώνα',
          'repository': 'Public Web Source Discovery', 'url': 'https://helios.eie.gr/helios/handle/10442/18865'}
ACADEMIA = {'title': '“Occasioned by the Death of Creveliers off Astypalaia: The Island’s Role in the Raids by Catholic '
                     'Corsairs during the 17th Century”, in Vathy, Astypalaia, v. I, Astypalaia in Time, edited by '
                     'A. G. Vlachopoulos, Athens: Ministry of Culture and Sports, 2023, p. 218-233 (in Greek).',
            'repository': 'Public Web Source Discovery',
            'url': 'https://www.academia.edu/104949876/_Occasioned_by_the_Death_of_Creveliers_off_Astypalaia'}
SAULGER = {'title': "Saulger, Robert: Histoire nouvelle des anciens ducs et autres souverains de l'Archipel",
           'repository': 'IIIF Full Text', 'url': 'https://api.digitale-sammlungen.de/iiif/presentation/v2/bsb10447069/canvas/294',
           'context_excerpt': "le dos, & deux bourreaux le fabre nud à ses côtez, avec ordre à lui de faire entendre aux affiégez"}


def resolved_request(question, variants=None):
    """What research_preflight writes for a UI question (gazetteer stubbed)."""
    extracted = extract_research_focus(question, '', question)
    variants = variants if variants is not None else [{'name': extracted['target'], 'basis': 'REQUEST_TARGET'}]
    request = {'target': extracted['target'], 'aliases': [], 'date_range': extracted['date_range'],
               'purpose': extracted['purpose'], 'search_name_variants': [v['name'] for v in variants]}
    context = focus_context(extracted, None)
    if context:
        request['target_context'] = context
    return request


def ident_for(request):
    return identity(request, {k: request[k] for k in ('target', 'aliases', 'date_range', 'purpose')})


class QuestionToFocusTests(unittest.TestCase):
    def test_creveliers_question_yields_the_person_not_the_sentence(self):
        extracted = extract_research_focus(QUESTION)
        self.assertEqual(extracted['target'], 'Κρεβελιε')
        self.assertEqual(extracted['kind_hint'], 'person')
        self.assertEqual(extracted['role_terms'], ['κουρσάρος'])
        self.assertEqual(extracted['purpose'], QUESTION)  # the question itself is kept
        # The instruction words alone are removed by the older splitter too.
        self.assertEqual(split_research_query(QUESTION)[0], 'Κρεβελιε τον κουρσατο')
        for variant in ('Βρες στοιχεία για τον Κρεβελιέ τον κουρσάρο', 'βρες μου πληροφορίες για τον κουρσάρο Κρεβελιέ',
                        'τι ξέρεις για τον Κρεβελιέ;', 'Κρεβελιέ ο κουρσάρος'):
            self.assertEqual(extract_research_focus(variant)['target'], 'Κρεβελιέ', variant)

    def test_request_is_a_person_never_a_place(self):
        request = resolved_request(QUESTION)
        self.assertEqual(request['target_context']['type'], 'person')
        focus = request_focus(request)
        self.assertEqual(focus['kind'], 'person')
        self.assertEqual(focus['names'], ['Κρεβελιε'])
        # Even a direct caller that passes the raw sentence gets the person.
        raw = decompose(QUESTION)
        self.assertEqual((raw['kind'], raw['names']), ('person', ['Κρεβελιε']))

    def test_queries_use_the_name_and_spellings_never_the_quoted_sentence(self):
        request = resolved_request(QUESTION)
        queries = discovery_queries(ident_for(request))
        joined = ' | '.join(queries)
        self.assertIn('"Κρεβελιε"', queries)
        self.assertIn('"Creveliers"', queries[:4])
        self.assertIn('"Crevelier"', queries[:4])
        for instruction in ('Βρες', 'στοιχεια', 'vres', 'stoicheia', 'κουρσατο'):
            self.assertNotIn(instruction, joined)
        names = retrieval_names(request_focus(request))
        self.assertEqual(names[0], 'Κρεβελιε')
        self.assertIn('Creveliers', names)

    def test_kimolos_phrasings_focus_on_kimolos(self):
        for question in ('ψάξε για την Κίμωλο', 'Ψάξε την Κίμωλο', 'ψαξε για την Κιμωλο',
                         'βρες στοιχεία για την Κίμωλο', 'βρες στοιχεία για το νησί Κίμωλο'):
            target = extract_research_focus(question)['target']
            self.assertIn(target, ('Κίμωλο', 'Κιμωλο'), question)
        gazetteer = [{'name': 'Κίμωλο', 'basis': 'REQUEST_TARGET'},
                     {'name': 'Κίμωλος', 'basis': 'GAZETTEER_SOURCED_VARIANT'},
                     {'name': 'Kimolos', 'basis': 'GAZETTEER_SOURCED_VARIANT'}]
        request = resolved_request('ψάξε για την Κίμωλο', gazetteer)
        self.assertEqual(request['target'], 'Κίμωλο')
        # A bare name is not forced to a kind (later stages treat it as a place);
        # «το νησί …» is explicit.
        self.assertNotIn('target_context', request)
        self.assertNotEqual(request_focus(request)['kind'], 'person')
        self.assertEqual(resolved_request('βρες στοιχεία για το νησί Κίμωλο')['target_context']['type'], 'place')
        request['aliases'] = []
        focus = request_focus(request)
        focus['names'] = [*focus['names'], *[v['name'] for v in gazetteer[1:]]]
        names = retrieval_names(focus)
        for spelling in ('Κίμωλο', 'Κίμωλος', 'Kimolos'):
            self.assertIn(spelling, names)
        joined = ' | '.join(discovery_queries(ident_for(request)))
        self.assertNotIn('ψάξε', joined.lower())
        self.assertIn('Κίμωλο', joined)
        # Without a gazetteer the mechanical forms still cover the nominative.
        bare = retrieval_names(decompose('ψάξε για την Κίμωλο'))
        self.assertIn('Κίμωλος', bare)
        self.assertIn('Kimolos', bare)

    def test_kimolos_matching_is_on_the_island_name_only(self):
        focus = request_focus(resolved_request('ψάξε για την Κίμωλο'))
        for title in ('Η Κίμωλος στον 17ο αιώνα', 'ΚΙΜΩΛΟΣ', 'Περιγραφή της Κιμώλου'):
            self.assertEqual(topical_match({'title': title}, focus)['category'], 'TARGET_MATCH', title)
        for title in ('Μήλος και Σίφνος', 'ψάξε για την πειρατεία στο Αιγαίο'):
            self.assertEqual(topical_match({'title': title}, focus)['category'], 'UNMATCHED', title)


class IdentityMatchTests(unittest.TestCase):
    def setUp(self):
        self.request = resolved_request(QUESTION)
        self.ident = ident_for(self.request)
        self.focus = self.ident['focus']

    def test_real_creveliers_sources_match_the_person(self):
        for row in (WIKIPEDIA, OWNER_ARTICLE, BOUKETO):
            match = topical_match(row, self.focus)
            self.assertEqual(match['category'], 'TARGET_MATCH', row['title'])
        for row in (HELIOS, ACADEMIA):
            match = topical_match(row, self.focus)
            self.assertEqual(match['category'], 'POSSIBLE_TARGET', row['title'])
            self.assertEqual(match['matched_name'], 'Creveliers')
        self.assertEqual(topical_match(SAULGER, self.focus)['category'], 'UNMATCHED')

    def test_matching_sources_are_queued_for_reading_and_unrelated_are_not(self):
        for row in (WIKIPEDIA, OWNER_ARTICLE, BOUKETO, HELIOS, ACADEMIA):
            result = assess(dict(row), self.ident)
            self.assertEqual(result['status'], 'PRIORITY', (row['title'], result['reasons']))
            self.assertFalse(result['verified'])
            self.assertEqual(result['retention']['acquisition_disposition'], 'AUTO_ACQUIRE_ELIGIBLE')
        self.assertNotIn('NO_TARGET_IDENTITY_MATCH', assess(dict(WIKIPEDIA), self.ident)['reasons'])
        self.assertEqual(assess(dict(SAULGER), self.ident)['status'], 'EXCLUDE_FROM_ACQUISITION')

    def test_old_run_sentence_identity_would_have_discarded_them(self):
        # Documents the bug: the whole question as the identity matches nothing.
        sentence_focus = {'schema': 'pct-research-focus-v1', 'kind': 'unknown', 'entity': QUESTION,
                          'names': [QUESTION], 'roles': [], 'places': []}
        self.assertEqual(topical_match(WIKIPEDIA, sentence_focus)['category'], 'UNMATCHED')


class ReadMatchingSourcesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.out = Path(self.temp.name)
        self.ident = ident_for(resolved_request(QUESTION))

    def test_matched_hit_excerpt_is_read_when_page_cannot_be_fetched(self):
        row = {**WIKIPEDIA, 'files': [], 'status': 'LOCATED_CITATION_CHASE',
               'relevance_assessment': assess(dict(WIKIPEDIA), self.ident)}
        acquired = acquire_excerpt(row, self.out)
        self.assertIsNotNone(acquired)
        self.assertEqual(acquired['status'], 'TEXT_ACQUIRED')
        self.assertTrue(acquired['excerpt_only'])
        self.assertTrue(acquired['web_acquisition_attempted'])
        self.assertFalse(acquired['original_inspected'])
        text = Path(acquired['files'][0]).read_text(encoding='utf-8')
        self.assertIn('Ο Ούγος ντε Κρεβελιέ ήταν διαβόητος', text)
        # Unmatched discoveries are not turned into reading material.
        unrelated = {**SAULGER, 'context_excerpt': SAULGER['context_excerpt'] * 5,
                     'relevance_assessment': assess(dict(SAULGER), self.ident)}
        self.assertIsNone(acquire_excerpt(unrelated, self.out))

    def test_unaccented_request_finds_accented_name_in_acquired_text(self):
        text = Path(self.out / 'x.txt')
        text.write_text(WIKIPEDIA['context_excerpt'], encoding='utf-8')
        spans = find_term_spans('Κρεβελιε', text.read_text(encoding='utf-8'))
        self.assertGreaterEqual(len(spans), 2)
        from candidate_context import assess as context_assess
        leads = context_assess(WIKIPEDIA['context_excerpt'], ['Κρεβελιε'], target_kind='person')
        self.assertTrue(leads)

    def test_owned_library_is_matched_by_the_extracted_name(self):
        root = self.out / 'library'
        root.mkdir()
        (root / 'KATALOGOS.md').write_text(
            '## Δημοσιευμένες πηγές\n\n'
            '1. **Βλαχόπουλος, Α.** «Ο κουρσάρος Κρεβελιέ στην Αστυπάλαια». 2023.\n'
            '   - PDF: `Test_2023_Krevelie.pdf`\n\n'
            '2. **Ioannou, Panagiotis.** «Oi fourtounes tou kapetan Petrou Lantza». 2000.\n'
            '   - PDF: `Ioannou_2000_Lantza.pdf`\n', encoding='utf-8')
        for stem, body in (('Test_2023_Krevelie', 'Ο Κρεβελιέ σκοτώθηκε στην Αστυπάλαια.'),
                           ('Ioannou_2000_Lantza', 'Petros Lantzas in Parga.')):
            (root / f'{stem}.pdf').write_bytes(b'%PDF-1.4 fixture')
            (root / f'{stem}.txt').write_text(body, encoding='utf-8')
        request = resolved_request(QUESTION)
        terms = [request['target'], *request['search_name_variants']]
        added = inject_into_results([], self.out / 'acq', terms, root=root)
        self.assertEqual([r['identifier'] for r in added], ['owned:Test_2023_Krevelie.pdf'])
        self.assertEqual(added[0]['status'], 'TEXT_ACQUIRED')


if __name__ == '__main__':
    unittest.main()
