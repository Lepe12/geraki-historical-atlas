#!/usr/bin/env python3
"""Generates learning-fixture.pdf: a 12-page Greek text-layer PDF with a running header, page numbers,
a table of contents with dot leaders and repeated entities/dates. Needs reportlab (dev only)."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, PageBreak
import os, sys

pdfmetrics.registerFont(TTFont("DV", "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"))
pdfmetrics.registerFont(TTFont("DVB", "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "learning-fixture.pdf")
body = ParagraphStyle("b", fontName="DV", fontSize=10.5, leading=15, spaceAfter=14)
h = ParagraphStyle("h", fontName="DVB", fontSize=14, leading=20, spaceAfter=12)
toc = ParagraphStyle("t", fontName="DV", fontSize=10.5, leading=16)

def deco(c, d):
    c.setFont("DV", 8.5)
    c.drawString(60, 810, "ΝΑΥΤΙΚΗ ΙΣΤΟΡΙΑ ΤΟΥ ΑΙΓΑΙΟΥ — Δοκίμιο")
    c.drawRightString(535, 28, "Σελίδα %d" % d.page)

doc = BaseDocTemplate(out, pagesize=A4, title="Fixture")
doc.addPageTemplates([PageTemplate(id="p", frames=[Frame(60, 50, 475, 740, id="f")], onPage=deco)])

P = [
 "Το 1770 ο στόλος του Λάμπρου Κατσώνη έδρασε στο Αιγαίο, ενώ ο Ορλόφ διέταξε τις ρωσικές δυνάμεις να αποφύγουν τη σύγκρουση στο ανοιχτό πέλαγος. Οι πηγές της εποχής περιγράφουν τα πλοία, τα πληρώματα και τους λιμένες, αλλά διαφωνούν στις λεπτομέρειες των ημερομηνιών και των θέσεων. Η μελέτη των ναυτικών ημερολογίων δείχνει ότι οι κινήσεις ήταν συχνά αποτέλεσμα τοπικών συνθηκών και όχι κεντρικού σχεδίου, κάτι που εξηγεί τις αντιφάσεις.",
 "Η συνθήκη του Κιουτσούκ Καϊναρτζή το 1774 άλλαξε το καθεστώς των ελληνικών πλοίων στη Μαύρη Θάλασσα. Οι έμποροι της Ύδρας και των Σπετσών επωφελήθηκαν από τη νέα ρύθμιση, και τα λιμάνια της Οδησσού άνοιξαν σταδιακά στο εμπόριο σιτηρών. Παρ' όλα αυτά, οι τοπικοί διοικητές εφάρμοζαν τους όρους με μεγάλες διαφορές, και οι πρόξενοι κατέγραφαν συνεχείς διαμαρτυρίες για τους δασμούς.",
 "Στη Μάνη τα πλοία των Μαυρομιχαλαίων προστάτευαν τα παράλια από τις επιδρομές, και οι καταγραφές του 1821 αναφέρουν ότι μικρά σκάφη μετέφεραν τρόφιμα και πολεμοφόδια. Ο Λάμπρος Κατσώνης παραμένει σημείο αναφοράς για τη ναυτική παράδοση, αν και πολλές διηγήσεις του 1790 έχουν μυθολογικά στοιχεία που δεν επιβεβαιώνονται από τα αρχεία των ευρωπαϊκών προξενείων.",
 "Οι χάρτες του Αιγαίου που σχεδίασαν Γάλλοι και Βενετοί υδρογράφοι τον δέκατο όγδοο αιώνα περιέχουν ονόματα νησιών σε διαφορετικές γραφές. Η σύγκριση των πορτολάνων του 1760 με τους χάρτες του 1800 αποκαλύπτει ότι πολλά τοπωνύμια άλλαξαν, ενώ άλλα παρέμειναν σταθερά. Η ταύτιση προϋποθέτει προσεκτική ανάγνωση των πηγών και δεν μπορεί να βασιστεί μόνο στην ομοιότητα των ονομάτων.",
 "Ο Γεώργιος Σαχτούρης διοικούσε τα πλοία της Ύδρας το 1821 και συντόνισε τις επιχειρήσεις στον Εύριπο, σύμφωνα με τα απομνημονεύματα που γράφτηκαν δεκαετίες αργότερα. Η μαρτυρία αυτή πρέπει να διαβάζεται με επιφύλαξη, καθώς οι αφηγητές αναπαρήγαγαν συχνά προφορικές παραδόσεις και ενίοτε αναδιατύπωναν γεγονότα ώστε να ταιριάζουν στις εθνικές αφηγήσεις της εποχής τους.",
]
story = [Paragraph("Δοκίμιο ναυτικής ιστορίας", ParagraphStyle("T", fontName="DVB", fontSize=24, leading=30, spaceAfter=30)),
         Paragraph("Πειραματικό αρχείο δοκιμής για την ανάλυση PDF.", body), PageBreak()]
story.append(Paragraph("Περιεχόμενα", h))
for i, t in enumerate(["Εισαγωγή", "Ο στόλος του Αιγαίου", "Η συνθήκη του 1774", "Η Μάνη και οι ναυτικοί", "Χάρτες και πορτολάνοι", "Μαρτυρίες και μνήμη", "Συμπεράσματα", "Βιβλιογραφία", "Παράρτημα", "Ευρετήριο"]):
    story.append(Paragraph("%s . . . . . . . . . . . . . . . . . . . . . . . . %d" % (t, 3 + i), toc) if i % 2 else Paragraph("%s ............................................ %d" % (t, 3 + i), toc))
story.append(PageBreak())
for pg in range(3, 13):
    story.append(Paragraph("Κεφάλαιο %d" % (pg - 2), h))
    n = 2 + (pg % 2)
    for k in range(n):
        story.append(Paragraph(P[(pg + k) % len(P)], body))
    story.append(PageBreak())
doc.build(story[:-1])
print(out)
