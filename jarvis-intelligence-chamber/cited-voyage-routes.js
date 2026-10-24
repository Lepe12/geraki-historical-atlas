/* Cited voyage segments for the 3D map.
   A segment is drawn only when it has a book, a printed page, an excerpt,
   and two endpoints whose coordinates are copied from
   data/gazetteer/mediterranean_gazetteer.v1.json (Wikidata P625).
   The line is the project's schematic connection of those two named places.
   It is not a reconstructed sailing track. Passages without both ends,
   without a printed page, or without gazetteer coordinates stay in `excluded`. */
(function () {
  "use strict";
  const BOOK = "Γιώργος Κουτζακιώτης, «Με αφορμή τον θάνατο του Creveliers στην Αστυπάλαια: Ο ρόλος του νησιού στις καταδρομικές επιχειρήσεις των καθολικών κουρσάρων κατά τον 17ο αιώνα», στο: Ανδρέας Γ. Βλαχόπουλος (επιστημονική επιμέλεια), Βαθύ Αστυπάλαιας. Δέκα χρόνια έρευνας (2011-2020) σε ένα διαχρονικό παλίμψηστο του Αιγαίου, τόμος Ι: Η Αστυπάλαια στον χρόνο, ISBN 978-960-386-573-5";
  const KOUT = {
    url: "https://hdl.handle.net/10442/18865",
    pdf_url: "https://helios.eie.gr/helios/bitstream/10442/18865/1/Koutzakiotis%202023.pdf",
    evidence_path: "evidence/runs/39385248640/greek/library_acquisition/18f781280144b88f0b78dfa5.txt",
    source_text_sha256: "e26f6ef2185e1ab836a0d7557edb95d14406f35bca8faa5bbb509ea5eed1dd0a",
    catalogue_year: "2023",
    catalogue_year_meaning: "PUBLICATION_OR_CATALOGUE_METADATA_NOT_EVENT_DATE",
  };
  const ALEXANDRIA = {
    place_id: "gz:Q87",
    label: "Αλεξάνδρεια",
    lon: 29.8925,
    lat: 31.1975,
    coordinate_source: "https://www.wikidata.org/wiki/Q87#P625",
  };
  const CONSTANTINOPLE = {
    place_id: "gz:Q16869",
    label: "Κωνσταντινούπολη",
    lon: 28.976018,
    lat: 41.01224,
    coordinate_source: "https://www.wikidata.org/wiki/Q16869#P625",
  };

  function cite(page, lines, excerpt, footnote) {
    return Object.assign({ book: BOOK, page: page, lines: lines, excerpt: excerpt, footnote: footnote || null }, KOUT);
  }

  const DATA = {
    schema: "nabou-cited-voyage-routes-v1",
    geometry_meaning: "SCHEMATIC_CONNECTION_NOT_RECONSTRUCTED_SAILING_TRACK",
    verification_status: "UNVERIFIED",
    original_inspected: false,
    voyages: [
      {
        id: "convoy-alexandria-constantinople-1679",
        title: "Νηοπομπή από την Αλεξάνδρεια προς την Κωνσταντινούπολη",
        vessel: "Οθωμανική νηοπομπή. Ο Creveliers δεν διατρέχει αυτή τη γραμμή· η πηγή τον έχει να περιμένει στην Αστυπάλαια.",
        year_label: "1679 (αναμονή του Creveliers· η χρονολογία είναι του επεισοδίου, όχι του χάρτη)",
        segments: [
          {
            id: "saulger-alexandria-to-constantinople",
            direction_stated: true,
            from: ALEXANDRIA,
            to: CONSTANTINOPLE,
            citation: cite(
              "220",
              [178, 181],
              "Περίμενε εκεί [στην Αστυπάλαια] να περάσει μια μεγάλη νηοπομπή η οποία ερχόταν από την Αλεξάνδρεια με προορισμό την Κωνσταντινούπολη.",
              "8. SAULGER 1698, 317. Το απόσπασμα είναι παράθεμα του Κουτζακιώτη· το Saulger 1698 δεν ανοίχτηκε εδώ."
            ),
            also_cited: [
              cite(
                "220",
                [107, 109],
                "διερχόμενα εμπορικά οθωμανικά πλοία, τα οποία ακολουθούσαν τις ρότες μεταξύ Αλεξάνδρειας και Κωνσταντινούπολης",
                null
              ),
            ],
          },
        ],
      },
      {
        id: "hospitaller-alexandria-constantinople",
        title: "Εμπορικά πλοία μεταξύ Αλεξάνδρειας και Κωνσταντινούπολης",
        vessel: "Εμπορικά πλοία Οθωμανών και Μαμελούκων, όπως τα κυνηγούσαν οι Ιωανννίτες. Δεν είναι πλοίο του Creveliers.",
        year_label: "1310-1522, όπως το γράφει η πηγή",
        segments: [
          {
            id: "belavilas-via-koutzakiotis-between",
            direction_stated: false,
            from: ALEXANDRIA,
            to: CONSTANTINOPLE,
            citation: cite(
              "220",
              [136, 139],
              "κυνηγούσαν εμπορικά πλοία των Οθωμανών και των Μαμελούκων, τα οποία έπλεαν μεταξύ Αλεξάνδρειας και Κωνσταντινούπολης",
              "12. Βλ. κυρίως ΜΠΕΛΑΒΙΛΑΣ 1997, 88-92. Η γραφή «Ιωανννίτες» είναι του αποκτημένου κειμένου."
            ),
          },
        ],
      },
    ],
    excluded: [
      {
        id: "kapsis-mytikas-aegean-ionian",
        who: "Ιωάννης Κάψης",
        why: "The sentence gives a departure, Mytikas of Aetolia-Acarnania, and then “sailed throughout the Aegean and the Ionian”. It names no second port. The seas are not treated as route endpoints.",
        why_el: "Η πρόταση δίνει αναχώρηση από τον Μύτικα Αιτωλοακαρνανίας και ύστερα «σάλπαραν σε όλο στο Αιγαίο και το Ιόνιο». Δεν ονομάζει δεύτερο λιμάνι. Οι θάλασσες δεν αντιμετωπίζονται ως άκρα ρότας.",
        citation: {
          book: "Διαδρομή Ελευθερίας 174 (2017 Sep)",
          page: null,
          page_note: "printed_page is null in the acquired OCR; no printed folio was recovered next to this passage.",
          lines: [3677, 3680],
          excerpt: "Ο Ιωάννης Κάψης µε τα αδέρφια του Τροµάρα και Νίκο εξορμούσαν µε δύο γαλέρες από τον Μύτικα της Αιτωλοακαρνανίας και σάλπαραν σε όλο στο Αιγαίο και το Ιόνιο.",
          url: "https://archive.org/details/diadromi_174",
          evidence_path: "evidence/runs/39902909088/travellers/library_acquisition/diadromi_174_diadromi_174_djvu.txt",
          source_text_sha256: "3e4e658a54947737c278d495f736f3592615d6f23800c4e391d097256f0e8a09",
        },
      },
      {
        id: "kapsis-stop-at-milos",
        who: "Ιωάννης Κάψης",
        why: "A stop at Milos is stated. The sentence does not name the port he sailed from.",
        why_el: "Αναφέρεται στάση στη Μήλο. Η πρόταση δεν ονομάζει το λιμάνι από το οποίο απέπλευσε.",
        citation: {
          book: "Διαδρομή Ελευθερίας 174 (2017 Sep)",
          page: null,
          page_note: "printed_page is null in the acquired OCR.",
          lines: [3680, 3681],
          excerpt: "Ο Κάψης σε µια στάση του στην Μήλο γνώρισε την κόρη ενός πλούσιου προύχοντα",
          url: "https://archive.org/details/diadromi_174",
          evidence_path: "evidence/runs/39902909088/travellers/library_acquisition/diadromi_174_diadromi_174_djvu.txt",
          source_text_sha256: "3e4e658a54947737c278d495f736f3592615d6f23800c4e391d097256f0e8a09",
        },
      },
      {
        id: "kapsis-return-to-milos",
        who: "Ιωάννης Κάψης",
        why: "“επιστρέφει στην Μήλο” names the destination of a return and not the place he left.",
        why_el: "Το «επιστρέφει στην Μήλο» ονομάζει τον προορισμό της επιστροφής, όχι τον τόπο αναχώρησης.",
        citation: {
          book: "Διαδρομή Ελευθερίας 174 (2017 Sep)",
          page: null,
          page_note: "printed_page is null in the acquired OCR.",
          lines: [3685, 3687],
          excerpt: "Ο Κάψης κατατρέ- χει τους Οθωμανούς, ισχυροποιείται µε πλοία, άνδρες και όπλα και επιστρέφει στην Μήλο",
          url: "https://archive.org/details/diadromi_174",
          evidence_path: "evidence/runs/39902909088/travellers/library_acquisition/diadromi_174_diadromi_174_djvu.txt",
          source_text_sha256: "3e4e658a54947737c278d495f736f3592615d6f23800c4e391d097256f0e8a09",
        },
      },
      {
        id: "kapsis-led-to-constantinople",
        who: "Ιωάννης Κάψης",
        why: "The Ottomans lead him to Constantinople. The sentence does not name the port of departure. His rule on Milos is the surrounding narrative, not a stated sailing origin.",
        why_el: "Οι Οθωμανοί τον οδηγούν στην Κωνσταντινούπολη. Η πρόταση δεν ονομάζει λιμάνι αναχώρησης. Η κυριαρχία του στη Μήλο είναι το περιβάλλον της αφήγησης, όχι δηλωμένη αφετηρία πλου.",
        citation: {
          book: "Διαδρομή Ελευθερίας 174 (2017 Sep)",
          page: null,
          page_note: "printed_page is null in the acquired OCR.",
          lines: [3843, 3845],
          excerpt: "Το 1680 η κυριαρχία του Κάψη τελειώνει. Οι Οθωμανοί των συλλαμβάνουν, τον οδηγούν στην Κωνσταντινούπολη και τον απαγχονίζουν.",
          url: "https://archive.org/details/diadromi_174",
          evidence_path: "evidence/runs/39902909088/travellers/library_acquisition/diadromi_174_diadromi_174_djvu.txt",
          source_text_sha256: "3e4e658a54947737c278d495f736f3592615d6f23800c4e391d097256f0e8a09",
        },
      },
      {
        id: "maynard-capsi-galley",
        who: "Jean Capsi",
        why: "Maynard says Capsi mastered Milo, and in the next sentences that a kapudan pasha lured him into a galley and took him to Constantinople. The galley sentence does not say the galley left from Milo.",
        why_el: "Ο Maynard γράφει ότι ο Capsi έγινε κύριος της Μήλου και, στις επόμενες προτάσεις, ότι ένας καπουδάν πασάς τον παρέσυρε στη γαλέρα του και τον πήγε στην Κωνσταντινούπολη. Η πρόταση της γαλέρας δεν λέει ότι η γαλέρα αναχώρησε από τη Μήλο.",
        citation: {
          book: "Félix Maynard, Impressions de voyage de Paris à Sébastopol, 1855",
          page: "38",
          lines: [1875, 1877],
          excerpt: "Un capitan-pacha, sous prétexte de traiter de la paix^ Tattira dans sa galère^ et le conduisit, chargé de chaînes^ à Gonstantinople.",
          url: "https://archive.org/details/impressionsdevo01mayngoog",
          evidence_path: "evidence/runs/39902909088/travellers/library_acquisition/impressionsdevo01mayngoog_impressionsdevo01mayngoog_djvu.txt",
          source_text_sha256: "5318830634c7b3294ab7ef08d06bc532987a52d79cf42375f79a3bd47ba7063f",
          page_basis: "Running header in the acquired OCR: “38 IMPRESSIONS DE VOYAGE”, immediately above this passage.",
        },
      },
      {
        id: "maynard-1855-steamer",
        who: "Félix Maynard",
        why: "The coastal sequence on printed pages 33–39 (Morea, Sapienza, Coron, Matapan, Cerigo, Milo on the horizon, Hydra) is the author’s own 1855 passage, not a voyage of Kapsis or Creveliers. Several of those names are not in the project gazetteer, so a continuous track would need coordinates the repository does not carry.",
        why_el: "Η παράκτια ακολουθία στις τυπωμένες σελίδες 33–39 (Μοριάς, Sapienza, Κορώνη, Matapan, Cerigo, Μήλος στον ορίζοντα, Ύδρα) είναι ο πλους του ίδιου του συγγραφέα το 1855, όχι ταξίδι του Κάψη ή του Creveliers. Ορισμένα από αυτά τα ονόματα δεν υπάρχουν στο γκαζετίερ του έργου, οπότε συνεχής γραμμή θα απαιτούσε συντεταγμένες που το αποθετήριο δεν φέρει.",
        citation: {
          book: "Félix Maynard, Impressions de voyage de Paris à Sébastopol, 1855",
          page: "33-39",
          lines: [1664, 1910],
          excerpt: "Le 6, la jeune aurore du vieil Homère éclaire les hautes erres de Morée",
          url: "https://archive.org/details/impressionsdevo01mayngoog",
          evidence_path: "evidence/runs/39902909088/travellers/library_acquisition/impressionsdevo01mayngoog_impressionsdevo01mayngoog_djvu.txt",
          source_text_sha256: "5318830634c7b3294ab7ef08d06bc532987a52d79cf42375f79a3bd47ba7063f",
        },
      },
      {
        id: "creveliers-1673-toward-karpathos",
        who: "Hugues Creveliers",
        why: "They are reported sailing southeast of Astypalaia, toward Karpathos, looking for convoys that had left Egypt. The sentence states neither a departure from Astypalaia nor an arrival at Karpathos. Astypalaia and Karpathos are not in the project gazetteer; coordinates are not typed in by hand.",
        why_el: "Μαρτυρούνται να πλέουν νοτιοανατολικά της Αστυπάλαιας, κατά την Κάρπαθο, προς αναζήτηση νηοπομπών που είχαν αναχωρήσει από την Αίγυπτο. Η πρόταση δεν δηλώνει ούτε αναχώρηση από την Αστυπάλαια ούτε άφιξη στην Κάρπαθο. Η Αστυπάλαια και η Κάρπαθος δεν είναι στο γκαζετίερ· οι συντεταγμένες δεν συμπληρώνονται με το χέρι.",
        citation: cite("220", [113, 117], "μαρτυρούνται να πλέουν στα νοτιοανατολικά της Αστυπάλαιας, κατά την Κάρπαθο, προς αναζήτηση νηοπομπών που είχαν αναχωρήσει από την Αίγυπτο", "9. Gazette 1673, 857-858. Πρβ. DAL POZZO 1715, 409-410, 414."),
      },
      {
        id: "creveliers-1678-for-astypalaia",
        who: "Hugues Creveliers",
        why: "On 2 September 1678 he and two other corsairs had departed for Astypalaia, taking Muslims captured on Naxos. The sentence does not say the ship left from Naxos. Astypalaia has no coordinates in the project gazetteer.",
        why_el: "Στις 2 Σεπτεμβρίου 1678 αυτός και δύο άλλοι κουρσάροι είχαν αναχωρήσει για την Αστυπάλαια, παίρνοντας μουσουλμάνους που είχαν αιχμαλωτίσει στη Νάξο. Η πρόταση δεν λέει ότι το πλοίο έφυγε από τη Νάξο. Η Αστυπάλαια δεν έχει συντεταγμένες στο γκαζετίερ.",
        citation: cite("220", [118, 121], "στις 2 Σεπτεμβρίου 1678, ο Creveliers και δύο άλλοι κουρσάροι (Jean-Joseph d’Antrechaux και Pietro Santo) είχαν αναχωρήσει για την Αστυπάλαια, παίρνοντας μαζί τους όσους μουσουλμάνους είχαν καταφέρει να αιχμαλωτίσουν στη Νάξο", "10. ΜΑΡΚΟΠΟΛΙΣ 1893, 109-110· ΖΕΡΛΕΝΤΗΣ 1922, 94-95."),
      },
      {
        id: "manettas-1682-astypalaia-ikaria",
        who: "Μανέττας",
        why: "The footnote does state a departure from Astypalaia toward Ikaria in 1682. Ikaria is gz:Q209576. Astypalaia is not in the project gazetteer, so the segment is not mapped.",
        why_el: "Η υποσημείωση δηλώνει αναχώρηση από την Αστυπάλαια προς την Ικαρία το 1682. Η Ικαρία είναι gz:Q209576. Η Αστυπάλαια δεν είναι στο γκαζετίερ, οπότε το τμήμα δεν χαρτογραφείται.",
        citation: cite("226", [611, 615], "το 1682 ο Μανέττας είχε αναχωρήσει από την Αστυπάλαια με κατεύθυνση την Ικαρία, για να συναντήσει εκεί έναν άλλον κουρσάρο", "ΚΡΑΝΤΟΝΕΛΛΗ 1994, 291, as cited in Koutzakiotis’s footnote 56. Krantonelli 1994 was not opened for this segment."),
      },
      {
        id: "grassetto-1511-astypalaia-amorgos",
        who: "Francesco Grassetto",
        why: "A 1511 Venetian galley is described travelling from Astypalaia toward Amorgos and anchoring at Vathy. Neither Astypalaia nor Amorgos nor Vathy is in the project gazetteer.",
        why_el: "Γαλέρα της Βενετίας το 1511 περιγράφεται να ταξιδεύει από την Αστυπάλαια προς την Αμοργό και να αγκυροβολεί στο Βαθύ. Ούτε η Αστυπάλαια ούτε η Αμοργός ούτε το Βαθύ είναι στο γκαζετίερ.",
        citation: cite("227", [665, 667], "ταξιδεύοντας από την Αστυπάλαια προς την Αμοργό, είχαν αγκυροβολήσει στο «λιμάνι του Αγίου Ιωάννη ή λιμάνι Βαθύ»", "62. CERUTI 1886, 28-29."),
      },
      {
        id: "kemiski-novel",
        who: "Hugues Creveliers",
        why: "The consulted text calls this a historical novel and writes “υποτίθεται”. An attack south of Kos and a later presence at Astypalaia are not drawn.",
        why_el: "Το κείμενο που συμβουλευτήκαμε το ονομάζει ιστορικό μυθιστόρημα και γράφει «υποτίθεται». Επίθεση νότια της Κω και μεταγενέστερη παρουσία στην Αστυπάλαια δεν σχεδιάζονται.",
        citation: cite("220", [122, 127], "ένα ιστορικό μυθιστόρημα της ίδιας εποχής, η Ιστορία και οι περιπέτειες της γεωργιανής Kemiski, παρουσιάζει τον Creveliers, τον «Bασιλιά του Αρχιπελάγους», να επιτίθεται, μαζί με άλλους κουρσάρους, σε νηοπομπή, στα νότια της Κω, και αργότερα να βρίσκεται στην Αστυπάλαια, όπου υποτίθεται ότι τον είχε συναντήσει απεσταλμένος", "11. LE NOBLE 1697, 232-235, 276-277."),
      },
      {
        id: "seasonal-ambush-zones",
        who: "Catholic corsairs",
        why: "Spring ambushes “between Samos and the Dodecanese” and summer ones “between Cyprus, Egypt and Syria” are zones, not a port-to-port segment. The Dodecanese, Egypt and Syria are not single gazetteer points.",
        why_el: "Ενέδρες την άνοιξη «μεταξύ Σάμου και Δωδεκανήσων» και το θέρος «μεταξύ Κύπρου, Αιγύπτου και Συρίας» είναι ζώνες, όχι τμήμα από λιμάνι σε λιμάνι. Τα Δωδεκάνησα, η Αίγυπτος και η Συρία δεν είναι ένα σημείο του γκαζετίερ.",
        citation: cite("221", [220, 222], "την άνοιξη ενέδρευαν μεταξύ Σάμου και Δωδεκανήσων και το θέρος μεταξύ Κύπρου, Αιγύπτου και Συρίας", "19. ANF, AE BI 862, φ. 75v."),
      },
      {
        id: "fournoi-manetas-bay",
        who: "Μανέττας",
        why: "The author says it would be hard to deny that Manettas’s ship had anchored in the Fournoi bay that bears his name. That is a conjecture, not a stated passage.",
        why_el: "Ο συγγραφέας λέει ότι θα ήταν δύσκολο να υποστηρίξει κανείς ότι το πλοίο του Μανέττα δεν είχε αράξει στον ομώνυμο όρμο των Φούρνων. Αυτό είναι εικασία, όχι δηλωμένος διάπλους.",
        citation: cite("226", [576, 578], "Ένας από τους όρμους των Φούρνων ονομάζεται σήμερα όρμος Μανέτα και θα ήταν δύσκολο να υποστηρίξει κανείς ότι το πλοίο του ομώνυμου ζακυνθινού, συνεργάτη του Creveliers, δεν είχε αράξει αρκετές φορές σε αυτό το νησιωτικό σύμπλεγμα", null),
      },
      {
        id: "creveliers-amorgos-1675-1678",
        who: "Hugues Creveliers",
        why: "He is reported staying on Amorgos in 1675 or leading prizes to that island in 1678. No origin is named, and Amorgos is not in the project gazetteer.",
        why_el: "Αναφέρεται να μένει στην Αμοργό το 1675 ή να οδηγεί εκεί πλοία που είχε κουρσέψει το 1678. Δεν ονομάζεται αφετηρία, και η Αμοργός δεν είναι στο γκαζετίερ.",
        citation: cite("227", [683, 684], "αναφέρεται να μένει στην Αμοργό (1675) ή να οδηγεί στο ίδιο νησί πλοία που είχε κουρσέψει (1678)", "63. ΜΑΡΚΟΠΟΛΙΣ 1893, 108· ΖΕΡΛΕΝΤΗΣ 1922, 63, 68."),
      },
      {
        id: "galland-arrival-milos",
        who: "Antoine Galland",
        why: "Galland’s arrival at Milos on 23 October 1679 is an arrival of the reporter, not a voyage of Creveliers, and no origin is named.",
        why_el: "Η άφιξη του Galland στη Μήλο στις 23 Οκτωβρίου 1679 είναι άφιξη του αφηγητή, όχι ταξίδι του Creveliers, και δεν ονομάζεται αφετηρία.",
        citation: cite("219", [64, 67], "Τον πρόσφατο τότε θάνατο του Creveliers, τον Σεπτέμβριο του 1679, είχε πληροφορηθεί κατά την άφιξή του στη Μήλο, στις 23 Οκτωβρίου του ίδιου έτους, και ο γάλλος οριενταλιστής Antoine Galland", "BSB, Cod. gall. 728, σ. 53, 56. Πρβ. BAUDEN 2000, 244."),
      },
    ],
  };

  function citationComplete(citation) {
    return !!(citation && citation.book && citation.page && citation.excerpt && citation.evidence_path);
  }

  function endpointComplete(place) {
    return !!(place && place.place_id && place.label && Number.isFinite(place.lon) && Number.isFinite(place.lat) && place.coordinate_source);
  }

  function drawableVoyages(data) {
    const source = data || DATA;
    const voyages = [];
    for (const voyage of source.voyages || []) {
      const segments = [];
      for (const segment of voyage.segments || []) {
        if (!citationComplete(segment.citation)) continue;
        if ((segment.also_cited || []).some(function (item) { return !citationComplete(item); })) continue;
        if (!endpointComplete(segment.from) || !endpointComplete(segment.to)) continue;
        if (segment.from.place_id === segment.to.place_id) continue;
        segments.push(segment);
      }
      if (segments.length) voyages.push(Object.assign({}, voyage, { segments: segments }));
    }
    return voyages;
  }

  window.NABOU_CITED_ROUTES = DATA;
  window.NABOU_drawableVoyages = drawableVoyages;
})();
