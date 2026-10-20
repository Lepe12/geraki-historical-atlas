import unittest
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from research_focus import decompose,topical_match
from research_topics import topic_queries
from research_topics import topic_match,strong_region_matches
from section_extraction import extract_document
from research_relevance import identity,assess

class TopicResearchTests(unittest.TestCase):
    def test_archipelago_does_not_make_bahamas_a_mediterranean_match(self):
        focus=decompose('Pirate bases and anchorages in the Mediterranean')
        text='Pirates sheltered in the Bahamas, an archipelago off the southeastern coast of the United States.'
        self.assertEqual(strong_region_matches(text,focus),[])
        self.assertNotEqual(topic_match(text,focus)['category'],'TARGET_MATCH')
        self.assertTrue(strong_region_matches('Οι κουρσάροι της Μεσογείου.',focus))
        self.assertTrue(strong_region_matches('Corsairs used anchorages in the Aegean.',focus))

    def test_real_cli_retains_themed_sections_without_inventing_a_named_place(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);acq=root/'library_acquisition';acq.mkdir()
            quote='In 1670 the corsairs anchored in the harbour. The location is unnamed.'
            (acq/'doc.txt').write_text(quote)
            (acq/'acquisition_report.json').write_text(json.dumps({'results':[{
                'title':'Voyage','url':'https://example.org/voyage','files':['library_acquisition/doc.txt']}]}))
            env={**os.environ,'PCT_TARGET':'Pirate bases and anchorages in the Mediterranean',
                 'PCT_DATE_RANGE':'1600-1700','PCT_ALIASES':'','PCT_RESEARCH_LANE':'travellers'}
            for script in ('event_first_search.py','verification_pipeline.py'):
                result=subprocess.run([sys.executable,str(Path(__file__).parent/script)],cwd=tmp,env=env,capture_output=True,text=True)
                self.assertEqual(result.returncode,0,result.stderr)
            hits=json.loads((root/'event_first_hits/event_hits.json').read_text())['hits']
            self.assertEqual(hits[0]['evidence_excerpt'],quote)
            self.assertFalse(hits[0]['verified'])
            events=json.loads((root/'structured_output/candidate_events.json').read_text())['events']
            self.assertEqual(events[0]['acquired_text_excerpt'],quote)
            self.assertFalse(events[0]['verified'])

    def test_topic_is_not_a_quoted_person(self):
        focus=decompose('Τοπωνύμια πειρατικών και κουρσάρικων ορμητηρίων στην Ανατολική Μεσόγειο')
        self.assertEqual(focus['kind'],'topic')
        self.assertEqual(focus['names'],[])
        self.assertTrue(all('Τοπωνύμια' not in q for q in topic_queries(focus,'venetian')))
        self.assertIn('corsari Mediterraneo',topic_queries(focus,'venetian'))
        self.assertIn('corsari',topic_queries(focus,'venetian')[:3])
        self.assertIn('πειρατεία',topic_queries(focus,'greek')[:3])

    def test_person_and_other_geography_preserved(self):
        self.assertEqual(decompose('Πέτρος Λάντζας')['kind'],'person')
        focus=decompose('Pirate bases and anchorages in the Caribbean')
        self.assertTrue(all('Mediterranean' not in q for q in topic_queries(focus)))

    def test_source_genre_is_acquired_but_no_base_invented(self):
        target='Pirate bases and anchorages in the Mediterranean'
        ident=identity({},dict(target=target,aliases=[],purpose=target,date_range='1600-1700'))
        self.assertEqual(assess({'title':'Voyage au Levant et dans l’Archipel','date':['1698']},ident)['status'],'PRIORITY')
        source={'title':'Voyage','url':'https://example.org/voyage'}
        quote='In 1670 the corsairs anchored in the harbour. The location is unnamed.'
        findings=extract_document(quote,source,'voyage.txt',dict(target=target,date_range='1600-1700'))
        self.assertEqual(len(findings),1)
        self.assertEqual(findings[0]['evidence_excerpt'],quote)
        self.assertFalse(findings[0]['verified'])
        self.assertEqual(findings[0]['matched_names'],[])

    def test_modern_topic_collision_has_no_match(self):
        focus=decompose('Pirate bases and anchorages in the Mediterranean')
        self.assertEqual(topical_match({'title':'Software piracy in modern corporations'},focus)['category'],'POSSIBLE_TARGET')
        findings=extract_document('Software piracy in 2024.',{'url':'https://example.org'},'a.txt',dict(target=focus['entity'],date_range='1600-1700'))
        self.assertEqual(findings[0]['decision'],'REVIEW_CONTEXT')
        self.assertIn('DATE_OUTSIDE_SCOPE',findings[0]['uncertainties'])
