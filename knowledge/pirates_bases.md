# Γνώση για πειρατές και ορμητήρια (κοινή για όλους τους agents)

# Repo: knowledge/pirates_bases.md
# Η αντιγραφή στο box πρέπει να μένει συγχρονισμένη με το αρχείο του repo.

Κάθε καταχώριση: ημερομηνία · θέμα · εύρημα · ονόματα/παλιά ονόματα · χρονολογία · πηγή (ακριβής) · βεβαιότητα (επιβεβαιωμένο / πιθανό / αμφίβολο) · ποιος το βρήκε.
Μόνο ό,τι έχει πηγή. Τίποτα επινοημένο. Διορθώσεις του Λεωνίδα έχουν προτεραιότητα.

## Διορθώσεις ιστορικού (υπερισχύουν)
- 2026-10-28 · Καψής · Χρόνια εξουσίας: μόνο κατά Saulger 1698, περ. 1677–1680, κρεμάστηκε 1680. · πηγή: Saulger 1698 · επιβεβαιωμένο από τον Λεωνίδα
- 2026-10-28 · Καψής · ΔΕΝ εξουδετέρωσε τον πρόκριτο Armeni· παντρεύτηκε την κόρη του (όνομα άγνωστο). · διόρθωση Λεωνίδα

## Παλιά ονόματα τόπων
- Milo = Μήλος
- Cerigo = Κύθηρα

## Ευρήματα

## Μαθήματα διαδικασίας (τι δούλεψε / τι όχι)
Μορφή: ημερομηνία · εργασία · τι έκανα · τι δούλεψε · τι απέτυχε ή να αποφεύγεται · ποιος
- 2026-10-28 · Zotero sync · Πρώτα dry-run, μετά εφαρμογή, μετά ξανά dry-run (πρέπει 0 εγγραφές). Το κλειδί θέλει και πρόσβαση στις σημειώσεις, αλλιώς βγαίνουν διπλές. · Nori
- 2026-10-29 · Αναζήτηση David Rumsey / Internet Archive · Ερωτήματα στο archive.org advancedsearch. Δουλεύουν ολόκληρες λέξεις (pirates OR corsaires). Το πρόθεμα με αστερίσκο (pirat*) δίνει σιωπηλά 0. Το σκέτο Milo φέρνει χιλιάδες συνωνυμίες (άτομα με όνομα Milo, Venus de Milo, Milo NY). Χρειάζεται χρονικό παράθυρο (π.χ. 1450–1900) και έλεγχος του πεδίου coverage. Το Cerigo είναι πολύ πιο καθαρό. · Grok Bot (executor)
- 2026-10-29 · Συνδέσεις Gallica / Europeana / HathiTrust / Ανέμη · Πρώτα διάβασα robots.txt και όρους κάθε αρχείου. Gallica και HathiTrust βγάζουν Cloudflare challenge στο box, άρα χρησιμοποιούμε τις επίσημες εναλλακτικές: τον κατάλογο BnF (catalogue.bnf.fr/api/SRU με bib.digitized=freeAccess) και το HathiTrust Bibliographic API με αριθμούς OCLC από το Internet Archive. Στο SRU της BnF το bib.date δίνει 0 (χρησιμοποίησε bib.publicationdate) και μερικές εγγραφές έρχονται ως διαγνωστικό λάθους (1/131), όχι ως εγγραφή. Η Europeana επιστρέφει το κλειδί μέσα στις απαντήσεις, οπότε πρέπει να το κρύβεις πριν αποθηκεύσεις. Η Ανέμη ήταν σε συντήρηση, και αυτό δεν παρακάμπτεται. · Grok Bot (executor)

## Πηγές και αρχεία (ποιότητα)
Μορφή: πηγή/αρχείο · τι έχει · πόσο αξιόπιστο · προβλήματα πρόσβασης
- David Rumsey Map Collection · χάρτες, πορτολάνοι, νησολόγια (π.χ. Roux 1764 «Pl. 86. I. Milo», Heather 1814 «Port Milo», Mercator/Hondius 1607 Candia με ένθετο Milo) · πολύ αξιόπιστη καταλογογράφηση · Το API LUNA (/luna/servlet/as, search) απαγορεύεται στο robots.txt, άρα δεν το χρησιμοποιούμε. Ψάχνουμε στο αντίγραφο του Internet Archive (collection:david-rumsey-map-collection) και κρατάμε το επίσημο link davidrumsey.com/luna/servlet/detail/RUMSEY~8~1~… (πεδίο source). Η πληρότητα του αντιγράφου δεν είναι γνωστή.
- Internet Archive (archive.org/advancedsearch.php) · κείμενα και βιβλία (π.χ. Castellan 1808 «Lettres sur la Morée et les iles de Cérigo», Sathas «Mnēmeia hellēnikēs historias» 1880) · ψάχνει μόνο σε μεταδεδομένα, όχι στο πλήρες κείμενο. Δεν υποστηρίζει αστερίσκο. Δεν έχει δηλωμένο όριο ρυθμού, οπότε κρατάμε 1 αίτημα/δευτ. και cache.
- Gallica (BnF), μέσω catalogue.bnf.fr/api/SRU · ψηφιοποιημένοι χάρτες και βιβλία με ελεύθερη πρόσβαση (π.χ. Coronelli [1689] «Cerigo», gallica.bnf.fr/ark:/12148/btv1b55006138z· «Ile de Cérigo (Tserigo)» [1880]· Rulhière «Essai sur les isles de Zante, de Cerigo…» an VIII) · πολύ αξιόπιστη καταλογογράφηση BnF, με πεδίο θέματος για τον τόπο · Το gallica.bnf.fr/SRU απαγορεύεται στο robots.txt (Disallow /*?) και βγάζει Cloudflare challenge, άρα δεν το χρησιμοποιούμε. Ο κατάλογος έχει Crawl-delay 5, άρα 1 αίτημα ανά 5 δευτ. Ψάχνει μόνο σε μεταδεδομένα, όχι στο OCR.
- Europeana (api.europeana.eu Search API v2) · συγκεντρώνει υλικό από πολλές βιβλιοθήκες (π.χ. Biblioteca Marciana: Bordone 1528 «Cerigo», europeana.eu/item/447/GEO0005512· «Milo» 1620, item/447/GEO0018203) · αξιόπιστη όσο ο πάροχος (πεδίο data_provider). Οι χρονολογίες μερικές φορές είναι λάθος (π.χ. «151») · Θέλει δωρεάν κλειδί, που μπαίνει στη μεταβλητή περιβάλλοντος EUROPEANA_API_KEY. Το δημόσιο demo κλειδί είναι μόνο για δοκιμή. Χωρίς κλειδί η σύνδεση δεν κάνει αίτημα και επιστρέφει API_KEY_REQUIRED.
- HathiTrust (catalog.hathitrust.org Bibliographic API) · βιβλία 19ου αι., συχνά σε Full view (π.χ. Grasset de Saint-Sauveur 1800 «Voyage historique… Cérigo et Cérigotte», catalog.hathitrust.org/Record/009711455· Sathas «Mnēmeia» 1880, Record/000628074) · πολύ αξιόπιστα μεταδεδομένα · Η αναζήτηση πλήρους κειμένου και ο κατάλογος βγάζουν Cloudflare challenge. Το Data API καταργήθηκε το 2024. Οι όροι χρήσης (AUP) απαγορεύουν τη μαζική αυτόματη λήψη. Γι' αυτό κάνουμε μόνο αναζήτηση με OCLC από το Internet Archive, που βρίσκει μόνο ένα υποσύνολο. Το Milo φέρνει πολλές συνωνυμίες (Pro Milone, Venus de Milo).
- Ανέμη (anemi.lib.uoc.gr, Παν. Κρήτης) · ψηφιακή βιβλιοθήκη νεοελληνικών σπουδών (ταξιδιωτικά, χάρτες) · άγνωστο, δεν ελέγχθηκε · Στις 2026-10-29 ήταν σε «Προσωρινή Διακοπή Υπηρεσίας» και έβγαζε σφάλμα πιστοποιητικού TLS στο box. Το OAI-PMH (index.tkl) δεν επιβεβαιώθηκε, οπότε δεν γράφτηκε σύνδεση. Ξανακοίτα το.
