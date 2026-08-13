"""Unit tests — Gemma / Alma readiness guardrail."""
from __future__ import annotations

import unittest

from services.readiness_guardrail import (
    bounded_advice,
    expert_script,
    structured_context,
    validate_context,
)


class GuardrailTests(unittest.TestCase):
    def test_malformed_context_falls_back(self):
        out = bounded_advice("what should I do?", {})
        self.assertFalse(out["used_llm"])
        self.assertEqual(out["source"], "script_malformed_input")
        self.assertTrue(out["text"])

    def test_empty_question_falls_back(self):
        ctx = structured_context(hazard_level="WATCH", sector="farmer", lang="en")
        out = bounded_advice("  ", ctx)
        self.assertEqual(out["fallback_reason"], "empty_question")

    def test_low_confidence_falls_back(self):
        ctx = structured_context(hazard_level="WATCH", sector="herder", lang="en")

        def llm(_q, _ctx):
            return {"text": "Move the herd tonight.", "confidence": 0.2}

        out = bounded_advice("where do I graze?", ctx, llm_fn=llm)
        self.assertEqual(out["source"], "script_low_confidence")
        self.assertEqual(out["text"], expert_script("herder", "pre_risk", "en"))

    def test_invented_hazard_rejected(self):
        ctx = structured_context(hazard_level="WATCH", sector="farmer", lang="en")

        def llm(_q, _ctx):
            return {"text": "Evacuate now, severe flood is in your field.", "confidence": 0.99}

        out = bounded_advice("is it flooding?", ctx, llm_fn=llm)
        self.assertEqual(out["source"], "script_invented_hazard")
        self.assertEqual(out["text"], expert_script("farmer", "pre_risk", "en"))

    def test_bounded_llm_accepted(self):
        ctx = structured_context(
            hazard_level="WATCH",
            sector="fisher",
            lang="en",
            event_phase="pre_risk",
        )

        def llm(_q, _ctx):
            return {"text": "Tether boats and lift nets. Hazard is WATCH.", "confidence": 0.9}

        out = bounded_advice("what about my boat?", ctx, llm_fn=llm)
        self.assertEqual(out["source"], "llm_bounded")
        self.assertIn("Tether", out["text"])

    def test_fisher_post_script(self):
        text = expert_script("fisher", "post_risk", "en")
        self.assertIn("boats", text.lower())
        self.assertLessEqual(len(text), 160)

    def test_validate_requires_hazard(self):
        ok, reason = validate_context({"sector": "farmer", "lang": "en"})
        self.assertFalse(ok)
        self.assertEqual(reason, "missing_hazard_level")


if __name__ == "__main__":
    unittest.main()
