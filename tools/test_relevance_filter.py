import unittest

from relevance_filter import (apply, check_sections, classify_claim, subject_profile, synthesis_label,
                              CONTEXTUAL, DIRECT, HOLD, OFF_TOPIC)
from place_resolver import resolve

# Requests exactly as recorded in the run manifests (normalized_request).
KAPSIS_REQUEST = {  # run 39902909088
    'target': 'Ιωάννης Καψής', 'aliases': ['Ioannis Kapsis', 'Jean Capsis', 'Jean Capsi', 'Giovanni Capsi'],
    'date_range': '1600-1700',
    'purpose': 'Έλεγξε με πραγματικές πηγές την ιστορική ταυτότητα του Ιωάννη Καψή και την αναφορά σε βασιλιά της Μήλου.'}
MILOS_REQUEST = {  # run 39304933066
    'target': 'Μήλος', 'aliases': ['Milos', 'Milo', 'Melos', 'Μῆλος'], 'date_range': '1660-1680',
    'purpose': 'Αναζήτησε πηγές για τη Μήλο, το λιμάνι και τα αγκυροβόλιά της, τη ναυτική κίνηση και την '
               'πειρατική/κουρσάρικη παρουσία αποκλειστικά με χρονολογικό έλεγχο 1660–1680.'}
TOPIC_REQUEST = {  # runs 39377319867 / 39477358672
    'target': 'Τοπωνύμια πειρατικών και κουρσάρικων ορμητηρίων στην Ανατολική Μεσόγειο', 'aliases': [],
    'date_range': '1600-1700',
    'purpose': 'Νέα πραγματική αναζήτηση πηγών για ορμητήρια, αγκυροβόλια και καταφύγια πειρατών και κουρσάρων '
               'στην Ανατολική Μεσόγειο, 1600–1700.'}

# Real stored claims (statement/actors/places/dates copied from the answer.json files).
SMYRNA_CONSULS = {  # 39477358672/semantic_reanalysis_39672897903, c-afc928bb9eb20d904550 (cited in that answer)
    'claim_id': 'c-afc928bb9eb20d904550',
    'statement': 'The study references letters from embassies and consuls in Izmir during the second half of the 17th '
                 'century, including Agostino Spinola and others, as primary sources.',
    'actors': ['Agostino Spinola', 'Durazzo', 'Sinibaldo Fieschi'], 'places': ['Izmir'], 'dates': [],
    'quote': ' The study will also benefit from correspondences of especially those who served in Izmir in the second '
             'half of the 17th century such as Agostino Spinola, Durazzo, Sinibaldo Fieschi, Pompeo Giustiniani and '
             'Ottavio Doria, Luigi Cartabono, Simon Massa and Giovanni Luigi Gentile.'}
KAPSIS_GALLEYS = {  # 39304929906/semantic_reanalysis_39376752977, c-aafc9f6829d06961aee9
    'claim_id': 'c-aafc9f6829d06961aee9',
    'statement': 'The consulted source reports that Ioannis Kapsis, with his brothers of the Tromara and Niko, set out '
                 'with two galleys from the Mytikas of Aetolia and sailed throughout the Aegean and Ionian seas.',
    'actors': [], 'places': [], 'dates': [],
    'quote': ' Ο Ιωάννης Κάψης µε τα αδέρφια  του Τροµάρα και Νίκο εξορμούσαν µε δύο γαλέρες από  τον Μύτικα της '
             'Αιτωλοακαρνανίας και σάλπαραν σε όλο  στο Αιγαίο και το Ιόνιο.'}
MILOS_PIRATE_KING = {  # 39304929906, c-f6628dc1818bc27114dd
    'claim_id': 'c-f6628dc1818bc27114dd',
    'statement': 'The consulted source reports that in 1677, the island of Milos under Ottoman rule acquired a pirate king.',
    'actors': [], 'places': [], 'dates': [],
    'quote': 'Η Μήλος εν µέσω οθωμανικής κυριαρχίας, το 1677 απέ-  κτησε πειρατή βασιλιά!'}
MILO_STONES = {  # 39304933066, c-b348ebee8fd5f145f2b9 (old name 'Milo')
    'claim_id': 'c-b348ebee8fd5f145f2b9',
    'statement': 'The consulted source reports that Milo supplied other islands, Constantinople, the Kingdom of Cyprus, '
                 'and a large part of Egypt with stones for construction.', 'actors': [], 'places': [], 'dates': []}
SAPIENZA_RAID = {  # 39477358672/semantic_reanalysis_39702177640, c-82b89d92edcf49002e83 (generic raid)
    'claim_id': 'c-82b89d92edcf49002e83',
    'statement': 'The consulted source reports that French ships were attacked by Trablusgarb corsairs near the island '
                 'of Barak Reis in 1670.', 'actors': [], 'places': ['Barak Reis'], 'dates': ['19 Kasım 1670'],
    'quote': '19 Kasım 1670 tarihinde İzmir’den Marsilya’ya hareket eden S. Bartolomeo adlı Fransız ticaret gemisi '
             'Sapienza (Barak Reis adası) açıklarında 5 Trablusgarb korsanının saldırısına uğramış'}
AZOV = {  # 39377319867/semantic_reanalysis_39578430849, c-53f369010e4ba9743338
    'claim_id': 'c-53f369010e4ba9743338',
    'statement': 'The source states that Russia acquired the Black Sea port of Azov in 1696.',
    'actors': [], 'places': [], 'dates': []}


class RelevanceFilter(unittest.TestCase):
    def test_smyrna_consul_claim_is_held_for_kapsis_milos_and_topic_questions(self):
        for req in (KAPSIS_REQUEST, MILOS_REQUEST, TOPIC_REQUEST):
            res = classify_claim(SMYRNA_CONSULS, subject_profile(req))
            self.assertEqual(res['status'], OFF_TOPIC, req['target'])
        res = classify_claim(SMYRNA_CONSULS, subject_profile(TOPIC_REQUEST))
        self.assertIn('SOURCE_DESCRIPTION_NOT_A_FINDING', res['reasons'])

    def test_kapsis_claim_is_direct(self):
        res = classify_claim(KAPSIS_GALLEYS, subject_profile(KAPSIS_REQUEST, 'person'))
        self.assertEqual(res['status'], DIRECT)
        self.assertTrue(res['evidence']['subject_name_matches'])

    def test_namesake_guard_different_person_is_never_direct(self):
        minister = {'claim_id': 'c-789d1988cbf7d8dc5095', 'statement': 'The consulted source reports Kapsis, Ioannis '
                    'as a government official in the Foreign Affairs Ministry.', 'actors': [], 'places': [], 'dates': []}
        res = classify_claim(minister, subject_profile(KAPSIS_REQUEST, 'person'), linkage={'status': 'DIFFERENT_PERSON'})
        self.assertEqual(res['status'], OFF_TOPIC)
        self.assertIn('NAMESAKE_GUARD_DIFFERENT_PERSON', res['reasons'])

    def test_milos_period_claim_passes_as_context_for_kapsis(self):
        res = classify_claim(MILOS_PIRATE_KING, subject_profile(KAPSIS_REQUEST, 'person'))
        self.assertEqual(res['status'], CONTEXTUAL)
        self.assertEqual(res['reasons'], ['SUBJECT_PLACE_INSIDE'])

    def test_old_name_milo_is_the_subject_of_a_milos_question(self):
        self.assertEqual(classify_claim(MILO_STONES, subject_profile(MILOS_REQUEST))['status'], DIRECT)
        self.assertEqual(classify_claim(MILO_STONES, subject_profile(KAPSIS_REQUEST, 'person'))['status'], CONTEXTUAL)

    def test_argentiera_greek_sourced_form_is_in_scope_neighbour(self):
        # Αρζαντιέρα is a SOURCED Wikidata variant of Kimolos (gz:Q919194), ~10 km from Milos.
        prof = subject_profile(MILOS_REQUEST)
        self.assertIn('gz:Q919194', prof['neighbour_place_ids'])
        claim = {'statement': 'Η πηγή αναφέρει ότι στην Αρζαντιέρα αγκυροβόλησαν δύο γαλέρες το 1668.'}
        res = classify_claim(claim, prof)
        self.assertEqual(res['status'], CONTEXTUAL)
        self.assertEqual(res['reasons'], ['NEIGHBOUR_PLACE_INSIDE'])

    def test_latin_argentiera_is_unsourced_and_never_matched(self):
        # The gazetteer lists 'Argentiera' only as an UNSOURCED proposal; it is not used for matching.
        self.assertEqual(resolve('the port of Argentiera'), [])

    def test_generic_raid_elsewhere_is_held_for_kapsis_but_context_for_topic(self):
        self.assertEqual(classify_claim(SAPIENZA_RAID, subject_profile(KAPSIS_REQUEST, 'person'))['status'], OFF_TOPIC)
        self.assertEqual(classify_claim(SAPIENZA_RAID, subject_profile(MILOS_REQUEST))['status'], OFF_TOPIC)
        self.assertNotEqual(classify_claim(SAPIENZA_RAID, subject_profile(TOPIC_REQUEST, 'topic'))['status'], OFF_TOPIC)

    def test_raid_in_same_passage_as_subject_is_context(self):
        res = classify_claim(SAPIENZA_RAID, subject_profile(KAPSIS_REQUEST, 'person'),
                             passage_text='... Jean Capsi ... ' + SAPIENZA_RAID['quote'])
        self.assertEqual(res['status'], CONTEXTUAL)
        self.assertIn('SAME_PASSAGE_NAMES_SUBJECT', res['reasons'])

    def test_manetas_bays_on_ikaria_or_fournoi_are_in_topic_region(self):
        # 39304936293/semantic_reanalysis_39372264436, c-0ecde140d07aa9e67f96. Ikaria (Q209576) and the
        # Fournoi islands (Q608379) are SOURCED Wikidata gazetteer entries.
        claim = {'claim_id': 'c-0ecde140d07aa9e67f96', 'statement': 'Local traditions suggest that the murder took place '
                 'either in Ikaria or Phournoi, specifically in the bays of Pano and Kato Maneta.'}
        res = classify_claim(claim, subject_profile(TOPIC_REQUEST, 'topic'))
        self.assertEqual(res['status'], CONTEXTUAL)
        self.assertEqual([p['place_id'] for p in res['evidence']['region_places']], ['gz:Q209576'])
        self.assertEqual([m['place_ids'] for m in resolve('Nicaria e Furni')], [['gz:Q209576'], ['gz:Q608379']])

    def test_azov_is_held_for_topic_question(self):
        self.assertEqual(classify_claim(AZOV, subject_profile(TOPIC_REQUEST, 'topic'))['status'], OFF_TOPIC)

    def test_far_outside_window_is_not_context(self):
        claim = {'statement': 'In 1912 a ferry service from Milos to Piraeus was established.'}
        self.assertEqual(classify_claim(claim, subject_profile(KAPSIS_REQUEST, 'person'))['status'], OFF_TOPIC)

    def test_thin_request_never_holds(self):
        self.assertEqual(classify_claim(SAPIENZA_RAID, subject_profile({'target': 'Pedro Lanza'}, 'person'))['status'],
                         CONTEXTUAL)

    def test_apply_marks_but_never_deletes_and_sections_follow_claims(self):
        claims = [dict(KAPSIS_GALLEYS), dict(MILOS_PIRATE_KING), dict(SMYRNA_CONSULS)]
        before = [dict(c) for c in claims]
        rep = apply(claims, KAPSIS_REQUEST, 'person')
        self.assertEqual(len(claims), 3)
        for old, new in zip(before, claims):
            self.assertEqual({k: new[k] for k in old}, old)
        self.assertEqual(rep['held_claim_ids'], ['c-afc928bb9eb20d904550'])
        self.assertEqual(claims[2]['relevance_hold'], HOLD)
        self.assertEqual(synthesis_label(claims[1]), 'CONTEXT_ONLY_NOT_A_FACT_ABOUT_THE_SUBJECT')
        sections = [{'text': 'The study draws on consular letters from Izmir.', 'claim_ids': ['c-afc928bb9eb20d904550']},
                    {'text': 'Milos acquired a pirate king in 1677.', 'claim_ids': ['c-f6628dc1818bc27114dd']}]
        res = check_sections(sections, claims, KAPSIS_REQUEST, 'person')
        self.assertEqual([r['status'] for r in res], [OFF_TOPIC, CONTEXTUAL])


if __name__ == '__main__':
    unittest.main()
