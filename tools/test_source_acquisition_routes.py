import tempfile
import json
import subprocess
import sys
from pathlib import Path
import unittest
from unittest.mock import patch
from dspace_acquisition import documents
from web_acquisition import acquire
from research_relevance import assess,identity

class SourceAcquisitionRoutes(unittest.TestCase):
    def test_actual_two_column_pdf_does_not_join_unrelated_narratives(self):
        left=['In 1670 corsairs used this harbour.','Their vessels returned to the same anchorage.',
              'The harbour supplied their vessels with water.','This column concerns the seventeenth century.']
        right=['In 1781 another fleet crossed the Atlantic.','This separate narrative concerns America.',
               'The account describes a different region.','The other column is a separate narrative.']
        stream='\n'.join('BT /F1 11 Tf '+str(x)+' 740 Td '+
            ' 0 -14 Td '.join('('+line+') Tj' for line in lines)+' ET' for x,lines in ((40,left),(330,right))).encode()
        objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
            b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
            b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'\nendstream']
        raw=b'%PDF-1.4\n';offsets=[]
        for i,obj in enumerate(objects,1):offsets.append(len(raw));raw+=str(i).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
        xref=len(raw);raw+=b'xref\n0 6\n0000000000 65535 f \n'+b''.join(f'{v:010d} 00000 n \n'.encode() for v in offsets)
        raw+=f'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()
        with tempfile.TemporaryDirectory() as tmp:
            record=acquire('https://example.org/columns.pdf',tmp,fetcher=lambda url:(raw,'application/pdf',url))
            text=next(Path(f).read_text() for f in record['files'] if f.endswith('.txt'))
            self.assertIn('\n'.join(left),text)
            self.assertIn('\n'.join(right),text)
            sidecar=json.loads(next(Path(f).read_text() for f in record['files'] if f.endswith('.pages.json')))
            self.assertEqual(sidecar['text_order'],'POPPLER_READING_ORDER')
            parser=Path(__file__).resolve().parents[1]/'server/command-center-live/pdf-evidence.py'
            result=subprocess.run([sys.executable,str(parser),record['pdf_file']],capture_output=True,text=True,check=True)
            self.assertIn('\n'.join(left),json.loads(result.stdout)['pages'][0]['text'])

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
