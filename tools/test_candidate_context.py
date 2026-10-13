"""Observed negative regressions and explicit synthetic positive controls."""
import json
from pathlib import Path
import unittest
import tempfile
from retrospective_candidate_review import review
from candidate_context import assess, catalogue_assess, review_preserved
from evidence_model import normalize_date, toponym_identity


class ContextPolicy(unittest.TestCase):
    def test_legacy_preserved_request_context_is_reassessed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'runs';lane=root/'123/travellers'
            (lane/'structured_output').mkdir(parents=True);(lane/'research_lanes').mkdir()
            request={'target':'Milos','aliases':['Milo'],'date_range':'1660-1680'}
            (lane/'research_lanes/travellers.json').write_text(json.dumps({'normalized_context':request}))
            source=lane/'structured_output/candidate_events.json'
            source.write_text(json.dumps({'events':[{'candidate_id':'fixture','source_type':'OCR_CONTEXT','context_excerpt':'In 1677 pirates attacked the island of Milo.','verified':False}]}))
            before=source.read_bytes();result=review(root)
            self.assertEqual(result['candidate_records_reviewed'],1)
            self.assertEqual(result['not_reassessed'],[])
            self.assertEqual(source.read_bytes(),before)

    def test_observed_false_positives(self):
        fixture=json.loads((Path(__file__).resolve().parent.parent/'tests/fixtures/context_false_positives.json').read_text())
        req=fixture['request']
        for candidate in fixture['candidates']:
            with self.subTest(candidate=candidate['candidate_id']):
                d=review_preserved(candidate,req['target'],req['aliases'],1660,1680)
                self.assertNotEqual(d['decision'],'RETAIN_CANDIDATE')

    def test_synthetic_multilingual_positive_controls(self):
        # Routing fixtures, NOT claims about historical events or sources.
        for text in ['In 1677 pirates attacked the island of Milo.',
                     'En 1677 les corsaires attaquent le port de Milo.',
                     'Nel 1677 i corsari assalirono il porto di Milo.',
                     'Im Jahr 1677 griffen Piraten die Insel Milo an.',
                     'Το 1677 πειρατές επιτέθηκαν στο λιμάνι της Μήλου.',
                     'In 1677 the ships attacked the island of Milo.']:
            hit=assess(text,['Milo','Μήλου'],1660,1680)
            self.assertTrue(any(h['decision']=='RETAIN_CANDIDATE' for h in hit),text)

    def test_metadata_lifespan_and_publication_are_not_event_dates(self):
        record={'title':'Pirates at the island of Milo','creator':['John, 1660-1722'],
                'date':['1677'],'raw':{'identifier':'1660','contributors':['Born 1660']}}
        self.assertFalse(any(h['decision']=='RETAIN_CANDIDATE' for h in catalogue_assess(record,['Milo'],1660,1680)))
        self.assertFalse(any(h['decision']=='RETAIN_CANDIDATE' for h in assess('Published 1677. Pirates at the island of Milo.', ['Milo'],1660,1680)))

    def test_distant_unrelated_context_does_not_join(self):
        text='The island of Milo.'+' A musical catalogue.'*100+' In 1677 pirates attacked elsewhere.'
        self.assertFalse(any(h['decision']=='RETAIN_CANDIDATE' for h in assess(text,['Milo'],1660,1680)))
        hits=assess('In 1677 pirates attacked the island of Milo.\n\nMilo contributions 1660.', ['Milo'],1660,1680)
        self.assertEqual([h['decision'] for h in hits],['RETAIN_CANDIDATE','REVIEW_CONTEXT'])

    def test_ambiguous_terms_do_not_suffice(self):
        for text in ['Milo contributions 1660','Melos Slavische Rhapsodie 1680','Island of Milo: contributions to painting, 1677.']:
            self.assertFalse(any(h['decision']=='RETAIN_CANDIDATE' for h in assess(text,['Milo','Melos'],1660,1680)))

    def test_undated_piracy_lead_is_preserved(self):
        hits=assess('Pirates attacked the island of Milo.', ['Milo'],1660,1680)
        self.assertEqual(hits[0]['decision'],'REVIEW_CONTEXT')
        self.assertEqual(hits[0]['reason'],'EVENT_DATE_UNRESOLVED')

    def test_place_and_date_remain_provisional(self):
        self.assertFalse(toponym_identity('Milo','Milos',['Milo'])['auto_equivalence'])
        date=normalize_date('1677','POSSIBLE_EVENT_CONTEXT')
        self.assertEqual(date['certainty'],'CONTEXT_YEAR_UNVERIFIED')
        self.assertFalse(date['conversion_applied'])


if __name__=='__main__': unittest.main()
