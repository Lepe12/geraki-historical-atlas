import hashlib
import io
import json
from pathlib import Path
import runpy
import sys
import tempfile
import unittest
from unittest.mock import patch


class IIIFPageAcquisitionTests(unittest.TestCase):
    def run_acquire(self, labels, arguments):
        manifest={'items':[{'id':'canvas-'+str(i),'label':{'none':[label]},
            'items':[{'items':[{'body':{'id':'https://example.org/image-'+str(i)}}]}]}
            for i,label in enumerate(labels)]}
        raw=json.dumps(manifest).encode()
        def opened(request,timeout=60):
            return io.BytesIO(raw if request.full_url=='https://example.org/manifest' else b'actual image fixture')
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup)
        out=Path(temp.name)
        argv=['iiif_acquire','--manifest','https://example.org/manifest','--out',str(out),*arguments]
        with patch.object(sys,'argv',argv),patch('urllib.request.urlopen',side_effect=opened),patch('builtins.print'):
            runpy.run_path(str(Path(__file__).with_name('iiif_acquire.py')),run_name='__main__')
        return out,json.loads((out/'report.json').read_text()),raw

    def test_printed_page_and_actual_bytes_are_checksum_bound(self):
        out,r,raw=self.run_acquire(['(0001)','239 (0261)'],['--pages','239'])
        self.assertEqual(r['matches'][0]['canvas_index_0_based'],1)
        self.assertEqual(r['matches'][0]['printed_page'],239)
        self.assertEqual(r['manifest_sha256'],hashlib.sha256(raw).hexdigest())
        self.assertEqual(r['matches'][0]['sha256'],hashlib.sha256((out/'printed_239.jpg').read_bytes()).hexdigest())

    def test_explicit_scan_is_never_claimed_as_printed_page(self):
        out,r,_=self.run_acquire(['0','1'],['--canvas-indexes','1'])
        self.assertIsNone(r['matches'][0]['printed_page'])
        self.assertEqual(r['matches'][0]['canvas_index_0_based'],1)
        self.assertEqual(r['matches'][0]['selection_basis'],'EXPLICIT_SCAN_INDEX_NOT_PRINTED_PAGINATION')
        self.assertTrue((out/'scan_0001.jpg').exists())

    def test_ambiguous_printed_pages_are_preserved_as_blocked(self):
        _,r,_=self.run_acquire(['42','42'],['--pages','42'])
        self.assertEqual(r['missing'][0]['reason'],'AMBIGUOUS_LABEL')
        self.assertEqual(r['matches'],[])


if __name__=='__main__':unittest.main()
