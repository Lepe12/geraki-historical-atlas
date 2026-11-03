# NABOU Coding Agent v0.3 — Coder 7B και ασφαλείς μικρές διορθώσεις

Πρόκειται για **δικό μας κώδικα** που προσομοιώνει την πρακτική ροή ενός coding agent (AI πρόταση → αυστηρή επαλήθευση → draft PR). Δεν χρησιμοποιεί ή αντιγράφει τον ιδιόκτητο κώδικα GitHub Copilot.

## Αναβάθμιση μοντέλου (χωρίς συνδρομή Copilot)

- Επίσημο μοντέλο: Qwen/Qwen2.5-Coder-7B-Instruct-GGUF, quantization Q4_K_M, περίπου 4,68 GB.
- Σταθερό Git revision: 13fb94b (η οριστική 40-χαρακτήρων ταυτότητα ελέγχεται μέσω HF API).
- Απαιτούμενο SHA-256 GGUF: 509287f78cb4d4cf6b3843734733b914b2c158e43e22a7f4bf5e963800894d3c.
- Νέο, ανεξάρτητο από την ερευνητική υποδομή, action: .github/actions/nabou-coder-model/action.yml.
- Τοπικό CPU inference μέσω llama-cpp-python, με μειωμένο context (6144 tokens) και κοινή φόρτωση του μοντέλου σε διαδοχικές κλήσεις του ίδιου Python process.
- Δεν μεταβάλλεται ο υπάρχων provider των ερευνητικών agents.
- Το μοντέλο καταλαμβάνει περίπου 4,68 GB μόνο ως GGUF· η πλήρης χρήση RAM μπορεί να είναι μεγαλύτερη. Ο περιορισμός πόρων του runner πρέπει να επιβεβαιωθεί πραγματικά.

## Νέο patch engine

Το tools/nabou_patch_engine.py υποστηρίζει JSON με 1–5 περιορισμένες αλλαγές:

~~~json
{"edits":[{"op":"replace","old":"exact original text","new":"replacement"}]}
~~~

ή

~~~json
{"edits":[{"op":"insert_after","anchor":"unique exact substring","text":"short addition"}]}
~~~

Υποστηρίζεται και insert_before. Οι περιορισμοί είναι ρητοί: ακριβώς μία εμφάνιση anchor/old, μέγιστο μέγεθος ανά edit και συνολικά, **καμία fuzzy αντιστοίχιση**, απορρίπτονται άγνωστες εντολές. Ο v0.2 συντονιστής εξακολουθεί να ελέγχει τα επιτρεπόμενα αρχεία, την άθροιση αλλαγών, τη σύνταξη JavaScript/τη βασική δομή CSS και το rollback σε όλα τα αρχεία όταν αποτύχει ο έλεγχος.

Η νέα προσέγγιση μειώνει το πρόβλημα όπου το μοντέλο αντιγράφει ολόκληρα CSS blocks λανθασμένα. **Δεν αποτελεί εγγύηση ορθότητας JavaScript ή συμπεριφοράς browser.** Κάθε αλλαγή πρέπει να εξετάζεται ως προς το runtime και τα πραγματικά UI/functional tests.

## Διαδικασία παραγωγής

Η .github/workflows/nabou-coder-v03.yml διαθέτει χειροκίνητη αποστολή ενός task για 2–3 εγκεκριμένα frontend paths:
1. Offline safety tests.
2. Λήψη και πλήρης SHA-256 επαλήθευση του Coder7B.
3. Preview: JSON αναφορά και αναγνώσιμο diff χωρίς καμία αλλαγή αρχείων.
4. Με ρητή επιλογή apply: έλεγχος επιτρεπόμενων αρχείων και regression tests.
5. Δημιουργία **draft Pull Request**, αν επιτραπεί από τα repository Actions permissions. Δεν γίνεται ποτέ merge/deploy αυτόματα.

## Τρεις ανεξάρτητες πραγματικές δοκιμές

Το tools/nabou_coder_trial_suite.py τρέχει τρεις **διαφορετικές** πραγματικές αποστολές με το τοπικό Qwen2.5-Coder 7B: υψηλή αντίθεση forced-colors, prefers-contrast, reduced transparency. Κάθε αποστολή εκτελείται από καθαρό προσωρινό αντίγραφο των δύο αρχείων navigation-rail.css και photon-windows.css, ώστε οι δοκιμές να είναι ανεξάρτητες.

Κάθε αποτέλεσμα έχει audit JSON και, όταν περάσει, patch αρχείου. Το πρώτο αποδεκτό patch επιτρέπεται να χρησιμοποιηθεί για draft PR, χωρίς επέμβαση στην παραγωγή. Αστοχία μίας δοκιμής καταγράφεται και δεν αποκρύπτεται.

Πηγή/προδιαγραφές μοντέλου: https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF

**Επαλήθευση 03/11/2026:** 32 offline tests PASS, το Qwen2.5-Coder 7B Q4_K_M προετοιμάστηκε επιτυχώς με SHA-256 verification. Στις [τρεις πραγματικές δοκιμές](https://github.com/Lepe12/geraki-historical-atlas/actions/runs/41702543182), **2/3 εργασίες πέρασαν**: η #1 forced-colors απορρίφθηκε επειδή δεν τηρήθηκε η απαιτούμενη συνθήκη, η #2 prefers-contrast πέρασε με ένα edit ανά αρχείο, και η #3 prefers-reduced-transparency πέρασε με μία επιτρεπτή διόρθωση μοντέλου. Οι πλήρεις αναφορές και τα patches διατηρούνται στο artifact `nabou-coder7b-three-real-trials-41702543182`. Το [draft PR #156](https://github.com/Lepe12/geraki-historical-atlas/pull/156) περιέχει την ελεγμένη πρόταση #2 και δημιουργήθηκε μέσω της σύνδεσης GitHub, επειδή η αυτόματη δημιουργία PR από το workflow δεν είχε ακόμη ολοκληρωθεί κατά τον έλεγχο. **Δεν ισχυριζόμαστε αυτοματοποιημένο end-to-end PR έως ότου επαληθευτεί.**

**Απαραβίαστα:** δεν τροποποιούνται 3D, canvas, camera, renderer, backend, WordPress, MariaDB, API, auth, ιστορικά στοιχεία ή production deployment. Όλα τα PR είναι draft, χωρίς αυτόματο merge.


## Επαληθευμένος περιορισμός αυτόματου PR

Στις 03/11/2026 ο ανεξάρτητος [έλεγχος GitHub Actions](https://github.com/Lepe12/geraki-historical-atlas/actions/runs/41706685130) απέδειξε ότι το `GITHUB_TOKEN` **δημιουργεί και ανεβάζει επιτυχώς review branch**, αλλά το REST API αρνείται το επόμενο βήμα με HTTP 403: `GitHub Actions is not permitted to create or approve pull requests.`

Αυτό είναι **ρύθμιση του αποθετηρίου**, όχι σφάλμα του Qwen ή του προγραμματιστικού μηχανισμού. Για πλήρως αυτόματη δημιουργία draft PR ο διαχειριστής του repository χρειάζεται να ενεργοποιήσει **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests**. Μετά την αλλαγή, απαιτείται νέα end-to-end δοκιμή του workflow `nabou-coder-v03.yml`. Η πρόσβαση GitHub App του ChatGPT δεν μπορεί να μεταβάλει αυτή τη διαχειριστική ρύθμιση.

Μέχρι τότε ο agent αποθηκεύει τα patches και ανεβάζει τον review branch, ενώ το workflow παραθέτει στο GitHub Step Summary σύνδεσμο σύγκρισης προς δημιουργία PR. **Δεν θεωρείται πλήρως αυτόνομη παράδοση PR πριν από επιτυχημένη νέα δοκιμή.**

## Ζωντανή δοκιμή του εξειδικευμένου μοντέλου

Το πραγματικό [GitHub Actions run #41702543182](https://github.com/Lepe12/geraki-historical-atlas/actions/runs/41702543182) κατέγραψε **δύο επιτυχημένες και μία απορριφθείσα** πολυαρχειακές εργασίες. Η επιτυχία αφορά τα ελεγμένα CSS patches και τη δοκιμαστική εκτέλεσή τους, όχι πλήρη αυτονομία του agent ή πραγματική επιτάχυνση συνολικού ιστοτόπου. Οι αλλαγές παρουσιάστηκαν για έλεγχο στο [PR #156](https://github.com/Lepe12/geraki-historical-atlas/pull/156).

