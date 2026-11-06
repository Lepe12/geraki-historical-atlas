#!/usr/bin/env python3
"""Tests for Greek research narrative (accepted facts only, article mold)."""
import unittest
from greek_narrative import build, validate_paragraphs, attach, research_path, build_events


def sample_answer(**extra):
    base = {
        "question": "Ιωάννης Καψής στη Μήλο;",
        "normalized_request": {
            "target": "Ιωάννης Καψής",
            "aliases": ["Ioannis Kapsis", "Κάψης"],
            "date_range": "1660-1680",
        },
        "review": {
            "supported_claim_ids": ["c1", "c2", "c3"],
            "flagged_claims": [],
            "contradictions": [
                {
                    "claim_ids": ["c1", "c2"],
                    "explanation": "Sources disagree on the end of his rule.",
                }
            ],
        },
        "answer_sections": [
            {"text": "Kapsis held Melos around 1677.", "claim_ids": ["c1"]},
            {"text": "Venetians later detained him.", "claim_ids": ["c2"]},
            {"text": "He kept three galleys.", "claim_ids": ["c3"]},
        ],
        "claims": [
            {
                "claim_id": "c1",
                "evidence_id": "e1",
                "statement": "Kapsis held Melos around 1677.",
                "quote": "Kapsis held Melos around 1677.",
                "kind": "source_statement",
                "passage_kind": "NARRATIVE_EVIDENCE",
                "dates": ["1677"],
                "places": ["Μήλος"],
                "actors": ["Kapsis"],
                "source_occurrences": [
                    {
                        "title": "Example Book",
                        "author": "Example",
                        "year": 1901,
                        "url": "https://example.org/a",
                        "locator": {"printed_page": 42, "start_line": 1, "end_line": 2},
                    }
                ],
            },
            {
                "claim_id": "c2",
                "evidence_id": "e2",
                "statement": "Venetians later detained him.",
                "quote": "Venetians later detained him.",
                "kind": "source_statement",
                "passage_kind": "NARRATIVE_EVIDENCE",
                "dates": ["1680"],
                "places": [],
                "actors": ["Kapsis"],
                "source_occurrences": [
                    {
                        "title": "Other Book",
                        "author": "Other",
                        "year": 1910,
                        "url": "https://example.org/b",
                        "locator": {"printed_page": 10},
                    }
                ],
            },
            {
                "claim_id": "c3",
                "evidence_id": "e3b",
                "statement": "He kept three galleys.",
                "quote": "He kept three galleys.",
                "kind": "source_statement",
                "passage_kind": "NARRATIVE_EVIDENCE",
                "dates": ["1678"],
                "places": ["Μήλος"],
                "actors": ["Kapsis"],
                "source_occurrences": [
                    {
                        "title": "Fleet Notes",
                        "author": "Notes",
                        "year": 1920,
                        "locator": {"printed_page": 3},
                    }
                ],
            },
            {
                "claim_id": "c-wrong",
                "evidence_id": "e3",
                "statement": "A different Kapsis in 1901.",
                "quote": "A different Kapsis in 1901.",
                "kind": "source_statement",
                "passage_kind": "NARRATIVE_EVIDENCE",
                "dates": ["1901"],
                "places": ["Athens"],
                "actors": ["Kapsis"],
                "identity_status": "DIFFERENT_PERSON",
                "source_occurrences": [
                    {"title": "Modern", "url": "https://example.org/c", "locator": {}}
                ],
            },
            {
                "claim_id": "c-off",
                "evidence_id": "e4",
                "statement": "Someone surnamed Kapsis appears in a parish list.",
                "quote": "Someone surnamed Kapsis appears in a parish list.",
                "kind": "source_statement",
                "passage_kind": "NARRATIVE_EVIDENCE",
                "relevance_status": "OFF_TOPIC",
                "dates": ["1670"],
                "places": [],
                "actors": ["Kapsis"],
                "source_occurrences": [
                    {"title": "Parish", "locator": {"printed_page": 1}}
                ],
            },
        ],
        "unknowns": ["Η ακριβής έκταση της εξουσίας του δεν τεκμηριώθηκε."],
    }
    base.update(extra)
    return base


class GreekNarrativeTests(unittest.TestCase):
    def test_chronological_events_drop_different_person(self):
        out = build(sample_answer(), use_llm=False)
        self.assertEqual(out["schema"], "pct-greek-narrative-v1")
        self.assertEqual(out["status"], "NARRATIVE_PENDING_HUMAN_REVIEW")
        years = [e["year"] for e in out["events"]]
        self.assertEqual(years, [1677, 1678, 1680])
        self.assertTrue(all("c-wrong" not in e["claim_ids"] for e in out["events"]))
        self.assertTrue(out["map_places"])
        self.assertEqual(out["map_places"][0]["label"], "Μήλος")
        self.assertTrue(out["map_bounds"])
        self.assertIn("διαφων", out["paragraphs"][-1]["text_el"].casefold())

    def test_article_covers_all_accepted_facts_no_length_cap(self):
        out = build(sample_answer(), use_llm=False)
        event_paras = [p for p in out["paragraphs"] if p.get("kind") == "event"]
        self.assertEqual(len(event_paras), 3)
        joined = " ".join(p["text_el"] for p in event_paras)
        self.assertIn("1677", joined)
        self.assertIn("galleys", joined.casefold())
        self.assertIn("detained", joined.casefold())
        # No machine framing
        self.assertNotIn("τα αρχεία δείχνουν", joined.casefold())
        self.assertNotIn("σύμφωνα με τα ευρήματα", joined.casefold())
        self.assertTrue(out["sources"])
        self.assertTrue(out["sources_el"].startswith("Πηγές:"))
        self.assertIn("Κάψης", out["title_el"])

    def test_research_path_groups_cuts(self):
        out = build(sample_answer(), use_llm=False)
        path = out["research_path"]
        self.assertEqual(path["found"], 5)
        self.assertEqual(path["passed"], 3)
        self.assertGreaterEqual(path["cut"], 2)
        keys = {g["key"] for g in path["groups"]}
        self.assertIn("namesakes_or_later_people", keys)
        self.assertIn("unrelated_surname_only", keys)
        self.assertIn("Βρέθηκαν", path["summary_el"])

    def test_no_usable_evidence_is_honest(self):
        out = build(
            {
                "question": "Άγνωστος πειρατής;",
                "claims": [],
                "review": {},
                "answer_sections": [],
            },
            use_llm=False,
        )
        self.assertEqual(out["status"], "NO_USABLE_EVIDENCE")
        text = out["paragraphs"][0]["text_el"]
        self.assertIn("δεν σημαίνει", text)
        self.assertTrue(out["not_found"])
        self.assertTrue(
            all(r["reason"] != "NEVER_HAPPENED" for r in out["not_found"])
        )

    def test_validation_rejects_invented_year_and_unknown_claim(self):
        events = build(sample_answer(), use_llm=False)["events"]
        allowed = {cid for e in events for cid in e["claim_ids"]}
        bad = validate_paragraphs(
            [
                {
                    "text_el": "Το 1599 έγινε βασιλιάς της Ευρώπης.",
                    "claim_ids": ["c1"],
                    "kind": "event",
                },
                {
                    "text_el": "Κάτι χωρίς παραπομπή.",
                    "claim_ids": ["missing"],
                    "kind": "event",
                },
                {
                    "text_el": "Το 1677: αποδεκτό γεγονός *(Example, σ. 42)*",
                    "claim_ids": ["c1"],
                    "kind": "event",
                },
            ],
            allowed,
            events,
        )
        self.assertEqual(len(bad), 1)
        self.assertEqual(bad[0]["claim_ids"], ["c1"])

    def test_attach_sets_status_on_answer(self):
        answer = sample_answer()
        attach(answer, caller=None)
        self.assertIn("greek_narrative", answer)
        self.assertEqual(
            answer["greek_translation_status"], "GENERATED_PENDING_HUMAN_REVIEW"
        )
        self.assertIn("research_path", answer["greek_narrative"])

    def test_finished_title_strips_search_command(self):
        from greek_narrative import _title_from, build
        answer = {
            "question": "ψάξε για πετρο λάνζτα τον κερκυραίο κορσάρο",
            "normalized_request": {
                "target": "πετρο λάνζτα τον κερκυραιο κορσάρο",
                "aliases": [],
                "purpose": "ψάξε για πετρο λάνζτα τον κερκυραίο κορσάρο",
            },
            "claims": [],
            "review": {},
            "answer_sections": [],
            "coverage": {"unique_passages": 0, "reading_batches": 0},
        }
        title = _title_from(answer)
        self.assertNotRegex(title.casefold(), r"ψ[άα]ξε")
        import unicodedata
        folded = "".join(
            c for c in unicodedata.normalize("NFD", title.casefold())
            if not unicodedata.combining(c) and c.isalpha()
        )
        self.assertTrue("λανζ" in folded or "lantz" in folded, title)
        out = build(answer, use_llm=False)
        self.assertEqual(out["status"], "NO_USABLE_EVIDENCE")
        self.assertEqual(out["generation"]["method"], "SOURCES_UNREAD")
        body = out["paragraphs"][0]["text_el"].casefold()
        self.assertIn("δεν μπόρεσα να διαβάσω", body)
        self.assertNotIn("τεκμηριωμένη βιογραφία", body)

    def test_honest_empty_when_sources_were_read_but_no_events(self):
        from greek_narrative import build
        answer = {
            "question": "Άγνωστος πειρατής;",
            "normalized_request": {"target": "Άγνωστος πειρατής", "aliases": []},
            "claims": [],
            "review": {},
            "answer_sections": [],
            "coverage": {"unique_passages": 3, "reading_batches": 1},
            "evidence": [{"evidence_id": "e1"}],
        }
        out = build(answer, use_llm=False)
        self.assertEqual(out["generation"]["method"], "HONEST_EMPTY")
        self.assertIn("τεκμηριωμένη βιογραφία", out["paragraphs"][0]["text_el"].casefold())



if __name__ == "__main__":
    unittest.main()
