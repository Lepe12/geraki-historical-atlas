"""Historical names (16th–17th c.) for the pirate bases: data/toponyms.json.

Two kinds of entries, kept apart:
  msc    — Γουργουρίνη Μ. (2026), MSc thesis, Appendix A, Table 5: historical name ↔ present-day place,
           identified and checked by the researcher (ground truth of the thesis).
  claude — identifications made with Claude (Anthropic), following the thesis' prompt method
           (name variants, modern name, confidence); standard portolan / Venetian / Italian / Turkish forms.
           They are proposals for review, not research documentation.
"""
import json, sys

MSC = {  # (area, port) -> historical names from Table 5
    ("Αστυπάλαια", "Μαλτεζάνα"): ["Μαλτεζάνα", "Port de Bouches"],
    ("Αστυπάλαια", "Βαθύ"): [],
    ("Πάρος", "Νάουσα"): ["Άγουσα"],
    ("Σάμος", "Μουλά Μπραήμ"): ["Μουλά Μπραήμ"],
    ("Μονεμβάσια", "Κάβο Μαλέας"): [],
    ("Αιτωλοακαρνανία", "Ναύπακτος"): ["Lepando"],
    ("Κύθηρα", "Καψάλι"): ["Capsali"],
    ("Ζάκυνθος", "Κερί"): ["Ακρωτήρι Κερί", "Capo di Chieri"],
    ("Σούνιο Αττικής", "Κάβο Κολώνες"): ["Κάβο Κολώνες"],
    ("Λευκάδα", "Αγία Μαύρα"): ["Santa Maura", "Santa Mavra", "Sessola"],
}
MSC_MODERN = {("Αστυπάλαια", "Μαλτεζάνα"): "Ανάληψη", ("Πάρος", "Νάουσα"): "Νάουσα", ("Σάμος", "Μουλά Μπραήμ"): "Ποσειδώνιο",
              ("Αιτωλοακαρνανία", "Ναύπακτος"): "Ναύπακτος", ("Κύθηρα", "Καψάλι"): "Καψάλι", ("Ζάκυνθος", "Κερί"): "Ακρωτήρι Μαραθιάς",
              ("Σούνιο Αττικής", "Κάβο Κολώνες"): "Ακρωτήριο Σούνιο", ("Λευκάδα", "Αγία Μαύρα"): "Χώρα Λευκάδας"}
MSC_EXTRA = {  # other historical names in Table 5 that point to places in the atlas without a base row of their own
    "Λιμένας Αστουπαλιάς": ("Αστυπάλαια", "Πέρα Γιαλός"), "Λιμένας Σταμπάλιας": ("Αστυπάλαια", "Πέρα Γιαλός"), "Porto Marmora": ("Αστυπάλαια", "Πέρα Γιαλός"),
    "Μαλβαζία": ("Μονεμβάσια", "Μονεμβασιά"), "Χάνδακας": ("Κρήτη", "Ηράκλειο"),
}
# Claude: island / area level names in the sources of the period (Italian portolans, Venetian and Ottoman usage)
CLAUDE_AREA = {
    "Κύθηρα": (["Cerigo", "Τσιρίγο"], "high"), "Αντικύθηρα": (["Cerigotto", "Τσιριγκότο"], "high"),
    "Ζάκυνθος": (["Zante", "Zacinto"], "high"), "Κεφαλλονιά": (["Cefalonia"], "high"),
    "Λευκάδα": (["Santa Maura", "Αγία Μαύρα"], "high"), "Στροφάδες": (["Strivali", "Strofadi"], "high"),
    "Σαπιέντζα": (["Sapienza"], "high"),
    "Μονεμβάσια": (["Malvasia", "Napoli di Malvasia", "Μαλβαζία"], "high"), "Ελαφόνησος": (["Cervi", "Isola dei Cervi"], "high"),
    "Μάνη": (["Maina", "Brazzo di Maina"], "high"), "Αργολίδα": (["Napoli di Romania (Ναύπλιο)"], "medium"),
    "Ύδρα": (["Sidra", "Idra"], "medium"), "Σούνιο Αττικής": (["Capo Colonne", "Κάβο Κολώνες"], "high"),
    "Μακρόνησος": (["Isola Longa", "Μακρονήσι"], "medium"), "Κέα (Τζιά)": (["Zea", "Τζια"], "high"),
    "Κύθνος": (["Thermia", "Θερμιά"], "high"), "Σέριφος": (["Serfo", "Serfanto"], "high"), "Σίφνος": (["Sifanto", "Siphanto"], "high"),
    "Μήλος": (["Milo"], "high"), "Κίμωλος": (["Argentiera", "Αργεντιέρα"], "high"), "Φολέγανδρος": (["Policandro", "Πολύκανδρος"], "high"),
    "Πάρος": (["Paro", "Pario"], "high"), "Αντίπαρος": (["Antiparo", "Oliaros"], "high"), "Νάξος": (["Nixia", "Nasso", "Naxia"], "high"),
    "Ίος": (["Nio", "Νιό"], "high"), "Αμοργός": (["Amorgo", "Morgo"], "high"), "Ανάφη": (["Nanfio", "Namfio", "Ανάφι"], "high"),
    "Αστυπάλαια": (["Stampalia", "Αστουπαλιά"], "high"), "Σύρος": (["Sira", "Syra"], "high"),
    "Μύκονος": (["Micone", "Miconi"], "high"), "Δήλος": (["Sdille", "Delo", "Δήλι"], "high"), "Ρηνεία": (["Sdille grande", "Μεγάλη Δήλος"], "medium"),
    "Σάμος": (["Samo", "Susam Adası"], "high"), "Ικαρία": (["Nicaria", "Nikaria"], "high"), "Φούρνοι": (["Furni", "Fourni"], "high"),
    "Πάτμος": (["Patino", "Palmosa"], "high"), "Στενό Χίου": (["Scio", "Sakız"], "high"),
    "Μυτιλήνη": (["Metelino", "Midilli"], "high"), "Θάσος": (["Thaso", "Taşoz"], "high"), "Σκιάθος": (["Sciato"], "high"), "Σκύρος": (["Schiro", "Sciro"], "high"),
    "Εύβοια": (["Negroponte", "Eğriboz"], "high"), "Ρόδος": (["Rodi", "Rodos"], "high"), "Κάρπαθος": (["Scarpanto", "Σκάρπαντο"], "high"),
    "Κρήτη": (["Candia", "Regno di Candia", "Kandiye"], "high"), "Γαύδος": (["Gozzo di Candia", "Gozo"], "high"),
    "Πρέβεζα": (["Prevesa"], "high"), "Αυλώνα": (["Valona", "Avlonya"], "high"), "Αυλώνα, Αλβανία": (["Valona"], "high"),
    "Δυρράχιο": (["Durazzo", "Dıraç"], "high"), "Μοσχονήσια": (["Musconisi", "Cunda"], "medium"),
    "Κονάκ, Παράλια Μικράς Ασίας": (["Smirne", "İzmir"], "high"), "Φώκαια, Παράλια Μικράς Ασίας": (["Foglia Nuova", "Foça"], "high"),
    "Παράλια Μικράς Ασίας": (["Vourla", "Urla"], "medium"), "Σεφεριχισάρ, Παράλια Μικράς Ασίας": (["Sığacık", "Seferihisar"], "medium"),
    "Αττάλεια, Παράλια Μικράς Ασίας": (["Satalia", "Antalya"], "high"), "Τυνησία": (["Tunisi", "Tunis"], "high"),
    "Λιβύη": (["Tripoli di Barberia", "Trablusgarp"], "high"), "Αίγυπτος": (["Alessandria", "İskenderiye"], "high"),
    "Μάλτα": (["Malta"], "high"), "Σικελία": (["Sicilia"], "high"), "Απουλία, Ιταλία": (["Otranto"], "high"),
    "Καμπανία, Ιταλία": (["Napoli"], "high"), "Λιβόρνο, Ιταλία": (["Livorno", "Leghorn"], "high"),
}
CLAUDE_PORT = {
    ("Μεσσηνία", "Μεθώνη"): (["Modon", "Modone"], "high"), ("Μεσσηνία", "Κορώνη"): (["Coron", "Corone"], "high"),
    ("Μάνη", "Οίτυλο"): (["Vitulo", "Βίτυλο"], "high"), ("Μάνη", "Πόρτο Κάγιο"): (["Porto Quaglio", "Porto Caglio"], "high"),
    ("Μονεμβάσια", "Κάβο Μαλέας"): (["Capo Malio", "Capo Sant'Angelo", "Κάβο Μαλιάς"], "high"),
    ("Κύθηρα", "Καψάλι"): (["Capsali"], "high"), ("Αντικύθηρα", "Ποταμός"): ([], ""),
    ("Πάρος", "Δρυός"): (["Porto Drio", "Δρυό"], "low"), ("Πάρος", "Τρυπητή"): ([], ""),
    ("Μύκονος", "Πάνορμος"): (["Πάνορμος Μυκόνου"], "low"), ("Ρόδος", "Μανδαράκι"): (["Mandracchio"], "high"),
    ("Πάτμος", "Σκάλα"): (["Scala di Patmo"], "medium"), ("Κρήτη", "Σφακιά"): (["Sfachia", "Sfakiá"], "high"),
    ("Κάρπαθος", "Σκαρπάντο"): (["Scarpanto"], "high"), ("Λευκάδα", "Αγία Μαύρα"): (["Santa Maura"], "high"),
    ("Πρέβεζα", "Πάργα"): (["Parga"], "high"), ("Αυλώνα, Αλβανία", "Χειμάρρα"): (["Cimarra", "Chimara"], "high"),
    ("Εύβοια", "Χαλκίδα"): (["Negroponte", "Eğriboz"], "high"), ("Αιτωλοακαρνανία", "Ναύπακτος"): (["Lepanto", "İnebahtı"], "high"),
    ("Αιτωλοακαρνανία", "Αντίρριο"): (["Castello di Romelia", "Καστέλι της Ρούμελης"], "medium"),
    ("Κεφαλλονιά", "Αργοστόλι"): (["Argostoli"], "high"), ("Σκύρος", "Λιναριά"): ([], ""),
    ("Σάμος", "Τηγάνι"): (["Τηγάνι (σημ. Πυθαγόρειο)"], "high"), ("Σάμος", "Μουλά Μπραήμ"): (["Μουλά Μπραήμ"], "high"),
    ("Κέα (Τζιά)", "Βουρκάρι"): (["Porto San Nicolò", "Άγιος Νικόλας Τζιας"], "medium"),
    ("Σούνιο Αττικής", "Κάβο Κολώνες"): (["Capo Colonne"], "high"),
}

def main(bases_path, out_path):
    bases = json.load(open(bases_path))["bases"]
    out = []
    for b in bases:
        a, p = b["area"], b.get("port") or b["area"]
        e = {"base": b["id"], "area": a, "port": p, "names": []}
        for n in MSC.get((a, p), []):
            e["names"].append({"name": n, "src": "msc"})
        if (a, p) in MSC_MODERN:
            e["modern"] = MSC_MODERN[(a, p)]
        pn, pc = CLAUDE_PORT.get((a, p), ([], ""))
        for n in pn:
            if not any(x["name"] == n for x in e["names"]):
                e["names"].append({"name": n, "src": "claude", "conf": pc, "level": "port"})
        an, ac = CLAUDE_AREA.get(a, ([], ""))
        for n in an:
            if not any(x["name"] == n for x in e["names"]):
                e["names"].append({"name": n, "src": "claude", "conf": ac, "level": "area"})
        if e["names"] or e.get("modern"):
            out.append(e)
    extra = [{"name": n, "src": "msc", "area": a, "modern": m} for n, (a, m) in MSC_EXTRA.items()]
    json.dump({"schema": "nabou-toponyms/v1",
               "sources": {"msc": "Γουργουρίνη Μ., «Εξαγωγή γεωχωρικής πληροφορίας με χρήση LLMs και τεχνικών σχεδιασμού προτροπών», μεταπτυχιακή διπλωματική, ΠΑΔΑ & Univ. Limoges, 2026, Παράρτημα Α (Πίνακας 5)",
                           "claude": "Ταυτίσεις με το Claude (Anthropic) κατά τη μέθοδο της παραπάνω εργασίας: καθιερωμένες ονομασίες πορτολάνων και βενετικής/οθωμανικής χρήσης. Προτάσεις προς έλεγχο, όχι τεκμηρίωση."},
               "notes": ["Σπαλμαντόρι: κατά τον ερευνητή (20/11/2026) το ορμητήριο της διατριβής είναι της Μυτιλήνης· η μεταπτυχιακή (Πίνακας 5) το ταυτίζει με τις Οινούσσες. Στον Άτλαντα κρατείται η θέση της Μυτιλήνης."],
               "bases": out, "extra": extra}, open(out_path, "w"), ensure_ascii=False, indent=1)
    print(len(out), "bases with names;", sum(len(e["names"]) for e in out), "names")

main(sys.argv[1], sys.argv[2])
