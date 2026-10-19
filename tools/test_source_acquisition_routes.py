import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch
from dspace_acquisition import documents
from web_acquisition import acquire
from research_relevance import assess,identity

class SourceAcquisitionRoutes(unittest.TestCase):
    def test_dspace_follows_declared_original_bitstreams_only(self):
        fixtures={
            'https://example.org/item':{'_links':{'bundles':{'href':'https://example.org/bundles'}}},
            'https://example.org/bundles':{'_embedded':{'bundles':[
                {'name':'THUMBNAIL','_links':{'bitstreams':{'href':'https://example.org/thumb'}}},
                {'name':'ORIGINAL','_links':{'bitstreams':{'href':'https://example.org/original'}}}]}},
            'https://example.org/original':{'_embedded':{'bitstreams':[{'name':'article.pdf','_links':{'content':{'href':'https://example.org/content'}}}]}}}
        self.assertEqual(documents('https://example.org/item',fixtures.__getitem__)[0]['url'],'https://example.org/content')

    def test_robot_challenge_is_not_acquired_source_text(self):
        with tempfile.TemporaryDirectory() as tmp:
            fetch=lambda url:(b'<h1>JavaScript is disabled</h1>In order to continue, we need to verify that you are not a robot. This requires JavaScript.','text/html',url)
            with self.assertRaisesRegex(ValueError,'ACCESS_CHALLENGE_RETURNED'):acquire('https://example.org',tmp,fetcher=fetch)
            self.assertEqual(list(Path(tmp).glob('*.txt')),[])

    def test_turkish_subject_relevance_does_not_require_english_history_word(self):
        ctx={'target':'Pirate bases and anchorages in the Mediterranean','aliases':[],'date_range':'1600-1700','purpose':''}
        result=assess({'title':'Akdenizde korsan faaliyetleri (1665-1690)'},identity({},ctx))
        self.assertEqual(result['status'],'PRIORITY')

    def test_topic_facets_can_be_in_separate_bibliographic_fields(self):
        ctx={'target':'Pirate bases and anchorages in the Mediterranean','aliases':[],'date_range':'1600-1700','purpose':''}
        result=assess({'title':'Corsair bases','description':'Mediterranean harbour history'},identity({},ctx))
        self.assertEqual(result['status'],'PRIORITY')
