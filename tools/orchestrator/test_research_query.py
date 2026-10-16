import unittest
from research_query import split_research_query

class ResearchQueryTests(unittest.TestCase):
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

    def test_conflicting_explicit_dates_fail(self):
        with self.assertRaisesRegex(ValueError,"CONFLICTING"):
            split_research_query("Find sources about Rhodes 1600-1700","1500-1550")

if __name__=="__main__":unittest.main()
