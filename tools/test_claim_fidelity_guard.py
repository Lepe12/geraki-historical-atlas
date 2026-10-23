import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from claim_fidelity_guard import apply, check, check_sections, OK, ROLE_MISMATCH, NOT_IN_QUOTE, NO_YEARS

# Actual quote and claim from run 39477358672 (semantic_reanalysis_39672897903, claim c-f840cdb199cc03c3c815).
BARBIERI_QUOTE = (" The local tradition of the Frankish origins of the church is\nultimately verified by the records of the "
                  "French consulate of Melos, which refer to a 1695 decision of capitan\ngenerale Antonio Zeno, acknowledging "
                  "that the Tuscan corsair Francesco Barbieri had built a Catholic church\nhonoring Saint George in Ayionissi "
                  "(CADN, Milo et l\u2019Argenti\u00e8re 3, 216).")
BARBIERI_CLAIM = ("The passage states that a Catholic church honoring Saint George was built by the Tuscan corsair "
                  "Francesco Barbieri in Ayionissi in 1695.")
BURIAL_QUOTE = ("In Paros, in 1679, the nineteen-year-old Augustin, son of the famous French corsair Hugues Creveliers, "
                "was buried with honors at the center of the Catholic church of Saint George in Naoussa.")


class ClaimFidelityGuard(unittest.TestCase):
    def test_barbieri_decision_date_is_not_the_construction_date(self):
        res = check(BARBIERI_CLAIM, BARBIERI_QUOTE, ['1695'])
        self.assertEqual(res['status'], ROLE_MISMATCH)
        f = res['findings'][0]
        self.assertEqual(f['quote_year_role']['term'], 'decision')
        self.assertIn('had built', f['prior_action_forms'])
        s = res['safe_rewrite_suggestion']
        self.assertEqual(s['label'], 'SOURCE_WORDING_ONLY_NOT_A_CORRECTED_DATE')
        self.assertIn('a 1695 decision of capitan generale Antonio Zeno', s['text'])
        # The suggestion introduces no year other than the quoted one.
        import re
        self.assertEqual(set(re.findall(r'1\d{3}', s['text'])), {'1695'})

    def test_claim_that_keeps_the_decision_role_passes(self):
        ok = 'A 1695 decision of Antonio Zeno acknowledged that Francesco Barbieri had built a Catholic church in Ayionissi.'
        self.assertEqual(check(ok, BARBIERI_QUOTE, ['1695'])['status'], OK)
        self.assertEqual(check('Francesco Barbieri built a Catholic church honoring Saint George in Ayionissi.',
                               BARBIERI_QUOTE)['status'], NO_YEARS)

    def test_correctly_dated_event_passes(self):
        claim = 'Augustin, son of Hugues Creveliers, was buried in the church of Saint George in Naoussa in 1679.'
        self.assertEqual(check(claim, BURIAL_QUOTE, ['1679'])['status'], OK)

    def test_year_absent_from_quote_is_flagged(self):
        claim = 'Augustin was buried in Naoussa in 1680.'
        res = check(claim, BURIAL_QUOTE, ['1680'])
        self.assertEqual(res['status'], NOT_IN_QUOTE)
        self.assertNotIn('safe_rewrite_suggestion', res)

    def test_ocr_glued_footnote_number_is_not_a_missing_year(self):
        quote = ' A similar attempt would be proposed by Pietro Lanza,\na skilled corsair in Habsburg employ in 160858.'
        self.assertEqual(check('Pietro Lanza was a skilled corsair in Habsburg employ in 1608', quote, ['1608'])['status'], OK)

    def test_greek_letter_date_moved_onto_earlier_raid(self):
        quote = 'Σε επιστολή του 1678 ο πρόξενος αναφέρει ότι οι κουρσάροι είχαν λεηλατήσει τη Μήλο.'
        bad = 'Οι κουρσάροι λεηλάτησαν τη Μήλο το 1678.'
        res = check(bad, quote, ['1678'])
        self.assertEqual(res['status'], ROLE_MISMATCH)
        self.assertEqual(res['findings'][0]['quote_year_role']['term'], 'επιστολη')
        good = 'Σε επιστολή του 1678 ο πρόξενος αναφέρει ότι οι κουρσάροι είχαν λεηλατήσει τη Μήλο.'
        self.assertEqual(check(good, quote, ['1678'])['status'], OK)
        event = 'Το 1678 οι κουρσάροι λεηλάτησαν τη Μήλο.'
        self.assertEqual(check(event, event, ['1678'])['status'], OK)

    def test_french_and_italian_document_dates(self):
        fr = "Une lettre de 1682 rapporte que le corsaire avait pillé l'île de Milo."
        self.assertEqual(check("Le corsaire pilla l'île de Milo en 1682.", fr, ['1682'])['status'], ROLE_MISMATCH)
        it = 'Nel 1690 il provveditore riferisce che il corsaro aveva costruito una torre a Milo.'
        res = check('Il corsaro costruì una torre a Milo nel 1690.', it, ['1690'])
        self.assertEqual(res['status'], ROLE_MISMATCH)
        self.assertEqual(res['findings'][0]['quote_year_role']['how'], 'REPORTING_VERB_CLAUSE')

    def test_apply_annotates_without_deleting_or_rewriting(self):
        claims = [{'claim_id': 'b', 'statement': BARBIERI_CLAIM, 'quote': BARBIERI_QUOTE, 'dates': ['1695'], 'uncertainty': []},
                  {'claim_id': 'a', 'statement': 'Augustin was buried in 1679.', 'quote': BURIAL_QUOTE, 'dates': ['1679']}]
        report = apply(claims)
        self.assertEqual(len(claims), 2)
        self.assertEqual(claims[0]['statement'], BARBIERI_CLAIM)
        self.assertEqual(claims[0]['dates'], ['1695'])
        self.assertEqual(claims[0]['fidelity_status'], ROLE_MISMATCH)
        self.assertIn(ROLE_MISMATCH, claims[0]['uncertainty'])
        self.assertEqual(claims[1]['fidelity_status'], OK)
        self.assertEqual(report['flagged_claim_ids'], ['b'])
        sections = check_sections([{'text': 'A church was built by Francesco Barbieri in Ayionissi in 1695, according to a secondary source.',
                                    'claim_ids': ['b']}], claims)
        self.assertEqual(sections[0]['status'], ROLE_MISMATCH)


class PipelineIntegration(unittest.TestCase):
    def test_flagged_claim_is_recorded_and_held_out_of_synthesis(self):
        from semantic_research_answer import collect, execute
        text = BARBIERI_QUOTE.strip() + ' ' + BURIAL_QUOTE
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp) / 'greek'
            (base / 'structured_output').mkdir(parents=True);(base / 'library_acquisition').mkdir()
            (base / 'library_acquisition/doc.txt').write_text(text)
            f = {'finding_id': 'fixture', 'file': 'doc.txt', 'url': 'https://example.org/source', 'title': 'Synthetic source',
                 'source_text_sha256': hashlib.sha256(text.encode()).hexdigest(), 'evidence_excerpt': text,
                 'years_in_scope': [1679, 1695], 'date_basis': 'EXPLICIT_PARAGRAPH', 'uncertainties': ['ORIGINAL_NOT_INSPECTED'],
                 'locator': {'start_char': 0, 'end_char': len(text), 'start_line': 1, 'end_line': 1}}
            (base / 'structured_output/extracted_findings.json').write_text(json.dumps({'findings': [f]}))
            eid = collect(tmp)[0][0]['evidence_id'];seen = {}
            def item(statement, quote, dates):
                return {'statement': statement, 'evidence_id': eid, 'quote': quote, 'kind': 'source_statement',
                        'actors': [], 'places': [], 'dates': dates, 'uncertainty': []}
            def caller(role, prompt):
                if role == 'evidence_extractor':
                    return {'status': 'COMPLETED', 'provider': 'simulated-test', 'model': 'fixture', 'content': json.dumps({'items': [
                        item(BARBIERI_CLAIM, BARBIERI_QUOTE.strip(), ['1695']),
                        item('Augustin was buried in the church of Saint George in Naoussa in 1679.', BURIAL_QUOTE, ['1679'])]})}
                if role == 'adversarial_reviewer':
                    if 'FINAL_ANSWER_JSON:' in prompt:
                        value = {'supported_section_indexes': [0], 'flagged_sections': []}
                    else:
                        cid = json.loads(prompt.split('CLAIMS_JSON:\n')[1])[0]['claim_id']
                        value = {'supported_claim_ids': [cid], 'flagged_claims': []}
                    return {'status': 'COMPLETED', 'provider': 'simulated-test', 'model': 'fixture', 'content': json.dumps(value)}
                seen['synthesis_prompt'] = prompt
                ids = [c['claim_id'] for c in json.loads(prompt.split('CLAIMS_AND_REVIEW_JSON:\n')[1])['claims']]
                return {'status': 'COMPLETED', 'provider': 'simulated-test', 'model': 'fixture', 'content': json.dumps(
                    {'answer_sections': [{'text': 'Augustin was buried in Naoussa in 1679, according to the source.', 'claim_ids': ids}],
                     'unknowns': [], 'limitations': []})}
            out = execute(tmp, 'Corsairs and churches in the Cyclades', caller=caller, config={'configured': True, 'missing': []})
            self.assertEqual(len(out['claims']), 2)
            flagged = [c for c in out['claims'] if c['fidelity_status'] == ROLE_MISMATCH]
            self.assertEqual(len(flagged), 1)
            self.assertEqual(out['claim_fidelity']['flagged_claim_ids'], [flagged[0]['claim_id']])
            self.assertNotIn('Barbieri', seen['synthesis_prompt'].split('CLAIMS_AND_REVIEW_JSON:\n')[1])
            self.assertEqual(out['synthesis_coverage']['fidelity_held_claim_ids'], [flagged[0]['claim_id']])
            self.assertEqual(out['status'], 'MODEL_ANSWER_PENDING_HUMAN_REVIEW')
            self.assertEqual(out['answer_section_fidelity'][0]['status'], OK)


if __name__ == '__main__':
    unittest.main()
