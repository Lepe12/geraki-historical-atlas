# NABOU Coding Agent — δικός μας agent ανάπτυξης λογισμικού

Αυτός είναι **δικός μας κώδικας** με λογική coding agent (διαβάζει → προτείνει → ελέγχει → δημιουργεί PR), όχι ο ιδιόκτητος κώδικας του GitHub Copilot. Δεν απαιτεί συνδρομή Copilot.

## Τι κάνει η πρώτη έκδοση (v0.1)

1. Δέχεται μία τεχνική εργασία και ένα εγκεκριμένο αρχείο του NABOU.
2. Στέλνει το περιεχόμενο σε τοπικό Qwen GGUF (ή σε ρητά ρυθμισμένο OpenAI-compatible endpoint).
3. Ζητά 1–5 περιορισμένες, ακριβείς αλλαγές κειμένου και ελέγχει ότι το αρχικό απόσπασμα εμφανίζεται μοναδικά.
4. Αρνείται προστατευμένα αρχεία του 3D χάρτη, backend, ερευνητικού μηχανισμού, WordPress, ασφαλείας και deployment.
5. Από προεπιλογή κάνει **μόνο προεπισκόπηση** χωρίς να αλλάζει αρχεία. Με ρητή επιλογή εφαρμόζει αλλαγές και εκτελεί `node --check` για JavaScript, με επαναφορά σε σφάλμα.
6. Αποθηκεύει ελεγκτική αναφορά με SHA-256 πριν/μετά. Στο GitHub Action η επιλογή εφαρμογής ανοίγει **draft Pull Request** για άνθρωπο, ποτέ merge ή deployment.

## Πώς εκτελείται

**Μετά την έγκριση και το merge του PR που εγκαθιστά αυτό το workflow**:

1. Άνοιξε [GitHub Actions](https://github.com/Lepe12/geraki-historical-atlas/actions/workflows/nabou-coding-agent.yml) και διάλεξε **Run workflow**.
2. Βάλε `task`: π.χ. «Improve NABOU left rail mobile spacing without changing its behavior».
3. Βάλε `target_file`: `jarvis-intelligence-chamber/navigation-rail.css`.
4. Κράτησε αρχικά `apply_changes=false`. Θα παραχθεί μόνο αναφορά χωρίς αλλαγή αρχείων.
5. Για προτεινόμενη αλλαγή, επανεκτέλεσε με `apply_changes=true`. Θα ανοίξει draft PR, εφόσον επιτρέπεται από τις ρυθμίσεις GitHub Actions του repository.

### Τοπικά

```sh
PYTHONPATH=tools python3 -m unittest -v tools/test_nabou_coding_agent.py
python3 tools/nabou_coding_agent.py --repo . --file jarvis-intelligence-chamber/nabou-shell.js --task 'Suggest one small safe code cleanup' --report agent_result.json
```

Το workflow προετοιμάζει το επιβεβαιωμένο Qwen2.5 3B GGUF στο GitHub runner με την υπάρχουσα `.github/actions/research-model`. Το `PCT_LOCAL_MODEL_PATH` ορίζεται αυτόματα από το βήμα προετοιμασίας. Για άλλο, ρητά ρυθμισμένο απομακρυσμένο πάροχο, όρισε `NABOU_CODE_ENDPOINT` ως πλήρη HTTPS διεύθυνση `/chat/completions`, `NABOU_CODE_MODEL` και `NABOU_CODE_API_KEY`. **Το GitHub Models καταργήθηκε στις 30 Ιουλίου 2026**· το `GITHUB_TOKEN` δεν προσφέρει πλέον πρόσβαση σε μοντέλο.

## Όρια / ασφάλεια

- Πρόκειται για **πρώτη λειτουργική έκδοση ενός αρχείου ανά αποστολή**, όχι για πλήρη ισοδύναμο του Copilot Coding Agent.
- Η ταχύτητα του site δεν έχει μετρηθεί και **δεν** υπάρχει ακόμη πραγματική επίδοση βελτιστοποίησης.
- Τοπικά unit tests ελέγχουν path safety, ακριβή patch, preview-only και rollback JavaScript. Δεν έχουν ακόμη πραγματοποιηθεί πραγματική κλήση GitHub Models και end-to-end GitHub Action/PR.
- Το ανοικτό Qwen δεν απαιτεί API συνδρομή αλλά η εκτέλεση σε GitHub Actions υπόκειται στα όρια χρόνου/πόρων Actions. Δεν χρησιμοποιούνται secrets μέσα στον browser.
- Οι αλλαγές σε CSS δεν έχουν ακόμη syntax validator· η έγκριση του PR πρέπει να περιλαμβάνει έλεγχο browser. Η επιτυχία JS syntax δεν αποδεικνύει σωστή συμπεριφορά.
- Το `GITHUB_TOKEN` ίσως χρειάζεται άδεια «Allow GitHub Actions to create and approve pull requests» στις ρυθμίσεις του repository.
- Κανένα επίσημο ερευνητικό τεκμήριο ή ελεγμένο στοιχείο της MariaDB δεν τροποποιείται.
