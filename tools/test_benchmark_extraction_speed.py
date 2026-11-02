"""Benchmark qualification must reject unsupported specificity, not reward speed alone."""
import unittest
from benchmark_extraction_speed import checks,load_fixture
from semantic_research_answer import extraction_request
import hashlib

class Qualification(unittest.TestCase):
    def test_public_fixture_and_production_prompts_remain_bound(self):
        fixture,checksum=load_fixture()
        self.assertEqual(len(checksum),64)
        for case in fixture['cases']:
            prompt,_=extraction_request([case['record']],case['question'],case['question_kind'])
            self.assertEqual(hashlib.sha256(prompt.encode()).hexdigest(),case['production_prompt_sha256'])

    def test_merchant_shipping_cannot_qualify_a_pirate_base(self):
        case={'expect':'merchant_anchorage'}
        accepted=[{'statement':'Pirates used Argentiera as a base.','quote':'Trading ships anchor near Argentiera.','dates':[],'usage_type':'BASE'}]
        result=checks(case,accepted,[],{'items':[{}]})
        self.assertFalse(result['no_unquoted_piracy'])
        self.assertFalse(result['required_finding'])

    def test_date_in_statement_does_not_escape_check_with_empty_date_array(self):
        result=checks({'expect':'merchant_anchorage'},[{'statement':'Ships anchor near Argentiera in 1677.','quote':'Trading ships anchor near Argentiera.','dates':[],'usage_type':'ANCHORAGE'}],[],{'items':[{}]})
        self.assertFalse(result['no_invented_dates'])

    def test_empty_output_is_not_a_successful_identity_answer(self):
        self.assertFalse(checks({'expect':'named_identity'},[],[],{'items':[]})['required_finding'])
        self.assertTrue(checks({'expect':'index_is_not_narrative'},[],[],{'items':[]})['required_finding'])

if __name__=='__main__':unittest.main()
