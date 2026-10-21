import json
from pathlib import Path
import tempfile
import unittest
from urllib.error import HTTPError
from cited_work_acquisition import continue_citations, reference_queries, cited_bibliography_entries
from web_acquisition import acquire


class CitationContinuationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.title='A historical bibliography of maritime correspondence'
        self.finding={'finding_id':'f1','url':'https://archive.org/details/parent',
                      'evidence_excerpt':'Smith, «'+self.title+'», London 1956, pp. 237–253.',
                      'locator':{'start_char':120,'end_char':230},'source_text_sha256':'parent-hash'}

    def test_unquoted_book_reference_without_page_locator_is_a_discovery_query(self):
        text='RANDOLPH, B. 1983. The Present State of the Islands in the Archipelago (or\nArches). Sea of Constantinople, and Gulph of Smyrna with the Islands of\nCandia, and Rhodes, Oxford.'
        self.assertEqual(reference_queries(text),['The Present State of the Islands in the Archipelago (or Arches)'])

    def test_seventeenth_century_book_is_not_excluded_by_publication_date(self):
        text='SAULGER, R. 1698. Histoire nouvelle des anciens Ducs et autres Souverains de l’Archipel, Paris.'
        self.assertEqual(reference_queries(text),['Histoire nouvelle des anciens Ducs et autres Souverains de l’Archipel'])
        self.assertEqual(reference_queries('Smith, «A voyage through the islands of the Archipelago», Oxford 1687, pp. 10–12.'),['A voyage through the islands of the Archipelago'])

    def test_narrative_year_and_unquoted_prose_are_not_bibliography(self):
        self.assertEqual(reference_queries('In 1698 the captain sailed through the islands to the port.'),[])
        self.assertEqual(reference_queries('The Present State of the Islands in the Archipelago, 1687.'),[])

    def test_author_year_footnote_follows_unquoted_full_book_title(self):
        text='Bibliography\nRANDOLPH, B. 1983. The Present State of the Islands in the Archipelago (or\nArches). Sea of Constantinople, Oxford.\nSAULGER, R. 1698. Histoire nouvelle des anciens Ducs et autres Souverains de l’Archipel, Paris.'
        (self.root/'source.txt').write_text(text)
        sources=[{'url':'source','files':['source.txt'],'status':'TEXT_ACQUIRED'}]
        leads=cited_bibliography_entries(self.root,sources,[{'url':'source','evidence_excerpt':'78. RANDOLPH 1983, 10.'}])
        self.assertEqual(len(leads),1)
        self.assertEqual(leads[0]['bibliographic_queries'],['The Present State of the Islands in the Archipelago (or Arches)'])
        loc=leads[0]['locator']
        self.assertEqual(text[loc['start_char']:loc['end_char']],leads[0]['evidence_excerpt'])
        self.assertFalse(leads[0]['original_inspected'])
        self.assertEqual(cited_bibliography_entries(self.root,sources,[{'url':'different source','evidence_excerpt':'RANDOLPH 1983'}]),[])

    def test_line_wrapped_reference_and_container(self):
        text='23. A historical article on maritime correspondence, «Collected voy-\nages in the Mediterranean», Athens 1956, 237–253.'
        self.assertEqual(reference_queries(text),['A historical article on maritime correspondence','Collected voyages in the Mediterranean'])
        self.assertEqual(reference_queries('He said «A historical bibliography of maritime correspondence».'),[])

    def test_failed_pdf_continues_to_alternative_then_enters_normal_page_extraction(self):
        calls=[];results=[]
        def search(q,lane):
            return [],[{'title':self.title,'digital_url':'https://example.org/failed.pdf',
                        'url':'https://example.org/mirror.txt'}]
        def read(url,out,follow=True):
            calls.append(url)
            if url.endswith('.pdf'):raise HTTPError(url,503,'Unavailable',{},None)
            return acquire(url,out,fetcher=lambda u:(b'Captain Example sailed to the harbour in 1621. '*4,'text/plain',u))
        report=continue_citations(self.root,{'target':'Captain Example'},results,findings=[self.finding],searcher=search,reader=read)
        self.assertEqual(len(calls),2)
        self.assertEqual(report['searches'][0]['acquisitions'][0]['http_status'],503)
        self.assertEqual(len(results),1)
        self.assertEqual(results[0]['parent_finding_id'],'f1')
        self.assertTrue(Path(results[0]['files'][0]).exists())
        self.assertFalse(results[0]['original_inspected'])
        self.assertEqual(results[0]['verification_status'],'NEEDS_EVIDENCE')
        # Resume does not submit the same public queries or downloads again.
        continue_citations(self.root,{'target':'Captain Example'},results,findings=[self.finding],searcher=lambda *a:self.fail('duplicate search'),reader=read)
        self.assertEqual(len(calls),2)

    def test_unrelated_pdf_is_never_downloaded_and_budget_is_recorded(self):
        rows=[{'title':'Modern company financial report','url':'https://example.org/file.pdf'}]
        report=continue_citations(self.root,{},[],findings=[self.finding],searcher=lambda *a:([],rows),reader=lambda *a,**k:self.fail('unrelated download'))
        self.assertEqual(report['searches'][0]['title_matched_records'],0)
        self.assertEqual(report['searches'][0]['outcome'],'CITATION_DEAD_END_IN_SEARCHED_CATALOGUES')
        other={**self.finding,'evidence_excerpt':'Smith, «Another historical article about maritime archives», Athens 1956, pp. 237–253.'}
        report=continue_citations(self.root,{},[],findings=[other],max_queries=0)
        self.assertEqual(report['deferred'][0]['status'],'BOUNDED_WAVE_DEFERRED')

    def test_generic_congress_title_cannot_close_another_congress_reference(self):
        finding={**self.finding,'bibliographic_queries':[
            'Compte rendu du congrès international des Américanistes']}
        rows=[{'title':'Compte rendu du XIXe Congrès International de Géographie',
               'url':'https://example.org/geography.pdf'}]
        report=continue_citations(self.root,{},[],findings=[finding],
            searcher=lambda *a:([],rows),reader=lambda *a,**k:self.fail('wrong work downloaded'))
        search=report['searches'][0]
        self.assertEqual(search['title_matched_records'],0)
        self.assertEqual(search['ambiguous_title_candidates'][0]['title'],rows[0]['title'])
        self.assertTrue(report['unresolved'])
        self.assertEqual(search['outcome'],'CANDIDATE_TITLE_IDENTITY_REVIEW_REQUIRED')

    def test_legacy_acquired_title_is_reopened_for_identity_without_redownload(self):
        out=self.root/'library_acquisition';out.mkdir()
        legacy={'query_key':'legacy','attempts':1,'acquisitions':[
            {'url':'https://example.org/wrong.pdf','status':'TEXT_ACQUIRED',
             'basis':'TITLE_MATCH_DISCOVERY_ONLY'}]}
        (out/'cited_work_continuation.json').write_text(json.dumps({'searches':[legacy]}))
        report=continue_citations(self.root,{},[],findings=[],
            searcher=lambda *a:self.fail('duplicate search'),reader=lambda *a,**k:self.fail('duplicate acquisition'))
        self.assertEqual(report['pending'],[])
        self.assertEqual(report['unresolved'],['legacy'])
        self.assertEqual(report['identity_review_required'],['legacy'])
        self.assertEqual(report['searches'][0]['citation_resolution'],'CITATION_IDENTITY_REVIEW_REQUIRED')

    def test_internet_archive_text_is_followed_without_web_metadata(self):
        out=self.root/'library_acquisition';out.mkdir()
        text='Captain Example, «'+self.title+'», London 1956, pp. 237–253.'
        (out/'source_djvu.txt').write_text(text)
        (out/'acquisition_report.json').write_text(json.dumps({'results':[{
            'title':'Historical bibliography','url':'https://archive.org/details/source',
            'files':['library_acquisition/source_djvu.txt'],'status':'TEXT_ACQUIRED'}]}))
        queries=[]
        report=continue_citations(self.root,{'target':'Captain Example','aliases':[],'date_range':''},[],
            searcher=lambda q,lane:(queries.append(q) or [],[]))
        self.assertEqual(queries,[self.title])
        self.assertEqual(report['searches'][0]['parent_locator']['start_char'],0)
        self.assertEqual(report['searches'][0]['citation_excerpt'],text)

    def test_catalogue_landing_text_does_not_become_cited_article(self):
        rows=[{'title':self.title,'url':'https://example.org/catalogue',
               'evidence_level':'CATALOGUE_METADATA_ONLY'}]
        results=[]
        def reader(url,out,follow=True):
            return {'url':url,'status':'TEXT_ACQUIRED','files':[],
                    'source_type':'WEB_PAGE_TEXT','linked_documents':[]}
        report=continue_citations(self.root,{},results,findings=[self.finding],
            searcher=lambda *a:([],rows),reader=reader)
        self.assertEqual(results,[])
        self.assertEqual(report['searches'][0]['acquisitions'][0]['status'],
                         'CATALOGUE_METADATA_ACQUIRED_NOT_CITED_WORK')

    def test_pdf_larger_than_old_limit_is_accepted_but_limit_is_enforced(self):
        from unittest.mock import patch,MagicMock
        import web_acquisition as web
        response=MagicMock();response.read.return_value=b'x'*12_047_985
        response.headers={'Content-Type':'application/pdf'};response.url='https://example.org/book.pdf'
        opened=MagicMock();opened.__enter__.return_value=response
        with patch.object(web,'public_url',side_effect=lambda u,**k:u),patch.object(web.urllib.request,'build_opener') as opener:
            opener.return_value.open.return_value=opened
            self.assertEqual(len(web.fetch(response.url)[0]),12_047_985)
            response.read.assert_called_with(web.MAX_DOCUMENT_BYTES+1)
            with patch.object(web,'MAX_DOCUMENT_BYTES',100):
                with self.assertRaisesRegex(ValueError,'DOCUMENT_TOO_LARGE'):web.fetch(response.url)


if __name__=='__main__':unittest.main()

