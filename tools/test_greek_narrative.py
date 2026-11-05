#!/usr/bin/env python3
"""Tests for Greek research narrative (accepted facts only)."""
import unittest
from greek_narrative import build, validate_paragraphs, attach


def sample_answer(**extra):
    base = {
        "question": "Ιωάννης Καψής στη Μήλο;",
        "normalized_request": {"target": "Ιωάννης Καψής", "date_range": "1660-1680"},
        "review": {
            "supported_claim_ids": ["c1", "c2"],
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
                        "url": "https://example.org/b",
                        "locator": {"printed_page": 10},
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
        self.assertEqual(years, [1677, 1680])
        self.assertTrue(all("c-wrong" not in e["claim_ids"] for e in out["events"]))
        self.assertTrue(out["map_places"])
        self.assertEqual(out["map_places"][0]["label"], "Μήλος")
        self.assertIn("διαφων", out["paragraphs"][-1]["text_el"].casefold())

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
                    "text_el": "Το 1677: αποδεκτό γεγονός *(Example Book, σελ. 42)*",
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


if __name__ == "__main__":
    unittest.main()
