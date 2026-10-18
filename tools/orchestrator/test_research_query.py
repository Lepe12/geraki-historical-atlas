import unittest
from research_query import split_research_query

class ResearchQueryTests(unittest.TestCase):
    def test_actual_unaccented_request(self):
        q="βρες πληροφοριες για Ιωάννη Καψή"
        self.assertEqual(split_research_query(q),("Ιωάννη Καψή","",q))

    def test_accent_case_and_unicode_variants(self):
        import unicodedata
        for command in ["ΒΡΕΣ ΠΛΗΡΟΦΟΡΙΕΣ ΓΙΑ", "βρες πληροφορίες για", "ψαξε για", "Ψάξε για", "αναζητησε πηγες σχετικα με"]:
            for name in ["Ιωάννη Καψή","Ανδρέα Μιαούλη"]:
                q=command+" "+name
                self.assertEqual(split_research_query(q)[0],name)
                q=unicodedata.normalize("NFD",q)
                self.assertEqual(split_research_query(q)[0],unicodedata.normalize("NFD",name))

    def test_unaccented_period_and_empty_target(self):
        self.assertEqual(split_research_query("ψαξε για τη Ροδο την περιοδο 1600–1700")[:2],("Ροδο","1600-1700"))
        with self.assertRaisesRegex(ValueError,"REQUIRES_TARGET"):
            split_research_query("βρες πληροφοριες για ")

    def test_greek_query_keeps_original_question(self):
        q="Βρες πηγές για τη Μήλο την περίοδο 1660–1680"
        self.assertEqual(split_research_query(q),("Μήλο","1660-1680",q))

    def test_other_targets_are_not_hardcoded(self):
        q="Find sources about the port of Ragusa 1500—1550"
        self.assertEqual(split_research_query(q),("port of Ragusa","1500-1550",q))
        self.assertEqual(split_research_query("Βρες πηγές για τον Πέτρο Λάντζα 1577–1583")[0],"Πέτρο Λάντζα")

    def test_explicit_fields_are_preserved(self):
        self.assertEqual(split_research_query("Rhodes","1600-1700","Trade"),("Rhodes","1600-1700","Trade"))
        self.assertEqual(split_research_query("Unknown prose with dates 1600-1700")[0],"Unknown prose with dates 1600-1700")

    def test_references_and_polite_commands_preserve_target_and_period(self):
        for prefix in ['Θέλω να βρεις αναφορές για τον ', 'Μπορείς να ψάξεις για τον ',
                       'Αναζήτησε αναφορές για τον ', 'Find references to ']:
            q=prefix+'Πέτρο Λάντζα 1577–1583'
            self.assertEqual(split_research_query(q),('Πέτρο Λάντζα','1577-1583',q))

    def test_short_explicit_name_with_period(self):
        self.assertEqual(split_research_query('Henry Morgan 1660–1680')[:2],('Henry Morgan','1660-1680'))
        self.assertEqual(split_research_query('Πέτρος Λάντζας 1577–1583')[:2],('Πέτρος Λάντζας','1577-1583'))
        self.assertEqual(split_research_query('Unknown prose with dates 1600-1700')[0],'Unknown prose with dates 1600-1700')

    def test_conflicting_explicit_dates_fail(self):
        with self.assertRaisesRegex(ValueError,"CONFLICTING"):
            split_research_query("Find sources about Rhodes 1600-1700","1500-1550")

if __name__=="__main__":unittest.main()
