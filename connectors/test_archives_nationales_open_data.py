import unittest
from archives_nationales_open_data import normalize, search_csv

SAMPLE = ("fran_ir;titre;cotes;intitulé;dates;producteur;documents_numérisés;url_slv;fichier_xml\n"
          "FRAN_IR_1;Marine et Méditerranée;AE/1;Navires;1570-1600;Marine;oui;https://example.org/1;https://example.org/1.xml\n"
          "FRAN_IR_2;Finances;AE/2;Budget;1800-1850;État;non;https://example.org/2;https://example.org/2.xml\n")

class ConnectorTests(unittest.TestCase):
    def test_accents(self):
        self.assertEqual(normalize("Méditerranée"), "mediterranee")
    def test_matching(self):
        rows = search_csv(SAMPLE, "marine mediterranee")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["fran_ir"], "FRAN_IR_1")
    def test_no_matches(self):
        self.assertEqual(search_csv(SAMPLE, "venise"), [])
    def test_schema_guard(self):
        with self.assertRaises(ValueError):
            search_csv("wrong;columns\na;b\n", "a")

if __name__ == "__main__":
    unittest.main()
