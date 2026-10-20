import unittest
from historical_source_admissibility import hold_reason
from research_relevance import assess,identity

class SourceAdmissibilityTests(unittest.TestCase):
    def test_declared_machine_author_and_music_keep_a_retained_lead_without_event_priority(self):
        request={'target':'Pirate bases and anchorages in the Mediterranean','date_range':'1600-1700'}
        ident=identity({},request)
        for record in ({'title':'Corsair harbours in the Mediterranean','creator':['A. Researcher','Claude/Anthropic']},
                       {'title':'I corsari: melodramma semiserio','creator':['A. Composer, librettist']},
                       {'title':'Elementi di gramatica italiana del sacerdote Corsari'}):
            result=assess(record,ident)
            self.assertEqual(result['status'],'EXCLUDE_FROM_ACQUISITION')
            self.assertTrue(hold_reason(record))
            self.assertFalse(result['verified'])
            self.assertTrue(result['retention'])

    def test_modern_scholarship_and_old_travel_accounts_are_not_excluded_by_publication_date(self):
        for record in ({'title':'Corsair anchorages during the17th century','creator':['Claude Marin'],'date':['2023']},
                       {'title':'A scholarly history of piracy in opera','creator':['A. Historian'],'date':['2024']},
                       {'title':'Ragguaglio del viaggio di un antiquario sorpreso dai corsari','date':['1805']}):
            self.assertIsNone(hold_reason(record))
