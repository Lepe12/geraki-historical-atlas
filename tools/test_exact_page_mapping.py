import unittest
from exact_page_mapping import djvu_pages, map_context, pages_for_hit

CONTEXT='Captain Morgan led his men through the harbour and captured the fortified city.'


class MappingTests(unittest.TestCase):
    def test_unpaginated_book_is_not_leaf_zero(self):
        r=map_context(CONTEXT, [CONTEXT+' entire book text'], [{'leaf':0,'printed_page':None}], 'FORM_FEED')
        self.assertEqual(r['status'],'PAGINATION_UNRESOLVED_NO_PAGE_BOUNDARIES')
        self.assertNotIn('leaf',r)

    def test_structured_ocr_maps_to_nonzero_leaf_and_printed_page(self):
        words=''.join('<WORD>'+w+'</WORD>' for w in CONTEXT.split())
        xml=('<DjVuXML><BODY><OBJECT><WORD>Cover</WORD></OBJECT><OBJECT>'+words+'</OBJECT><OBJECT><WORD>End</WORD></OBJECT></BODY></DjVuXML>').encode()
        pages=djvu_pages(xml)
        r=map_context(CONTEXT,pages,[{'leaf':3,'printed_page':None},{'leaf':5,'printed_page':'211'},{'leaf':7,'printed_page':'212'}],'DJVU_XML_OBJECT_ORDER',[3,5,7])
        self.assertEqual((r['status'],r['leaf'],r['printed_page']),('EXACT_PAGE_MAPPED',5,'211'))

    def test_repeated_phrase_is_not_independent_page_match(self):
        r=map_context(CONTEXT,[CONTEXT,CONTEXT],[{'leaf':0},{'leaf':1}],'FORM_FEED')
        self.assertIn('AMBIGUOUS',r['status']); self.assertNotIn('leaf',r)

    def test_count_mismatch_does_not_invent_leaf(self):
        r=map_context(CONTEXT,['cover',CONTEXT],[{'leaf':0},{'leaf':1},{'leaf':2}],'FORM_FEED')
        self.assertEqual(r['status'],'PAGINATION_UNRESOLVED_PAGE_COUNT_MISMATCH')

    def test_scattered_context_words_do_not_select_page(self):
        r=map_context(CONTEXT,[' '.join(reversed(CONTEXT.split())),'cover'],[{'leaf':0},{'leaf':1}],'FORM_FEED')
        self.assertIn('UNMATCHED',r['status']); self.assertNotIn('leaf',r)

    def test_equal_counts_do_not_allow_misaligned_leaf_ids(self):
        r=map_context(CONTEXT,['cover',CONTEXT],[{'leaf':0},{'leaf':1}],'DJVU_XML_OBJECT_ORDER',[1,0])
        self.assertEqual(r['status'],'PAGINATION_UNRESOLVED_OCR_SCAN_LEAF_ALIGNMENT')

    def test_each_candidate_receives_only_its_own_page(self):
        results=[{'source_file':'book.txt','hit_index':0,'leaf':11},
                 {'source_file':'book.txt','hit_index':1,'leaf':40},
                 {'source_file':'other.txt','hit_index':0,'leaf':2}]
        self.assertEqual([p['leaf'] for p in pages_for_hit(results,'book.txt',0)],[11])


if __name__=='__main__': unittest.main()
