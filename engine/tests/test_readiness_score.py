"""Unit tests — operational readiness score (not credit)."""
from __future__ import annotations

import unittest

from services.readiness_score import (
    compute_readiness_score,
    normalize_hazard_level,
    sms_status_line,
    ussd_status_head,
)


class HazardLevelTests(unittest.TestCase):
    def test_compound_wins(self):
        self.assertEqual(
            normalize_hazard_level("watch", compound_active=True),
            "COMPOUND",
        )

    def test_safe_folds_to_watch(self):
        self.assertEqual(normalize_hazard_level("safe"), "WATCH")

    def test_farmer_flood_risk_compound(self):
        self.assertEqual(
            normalize_hazard_level("watch", farmer_flood_risk="compound"),
            "COMPOUND",
        )


class ScoreArchitectureTests(unittest.TestCase):
    def test_distinct_from_hazard(self):
        result = compute_readiness_score(
            checklist=[],
            hazard_level="SEVERE",
            event_phase="pre_risk",
        )
        self.assertEqual(result["hazardLevel"], "SEVERE")
        self.assertIn(result["preparednessState"], ("UNPREPARED", "MODERATE", "READY"))
        self.assertTrue(result["notCreditScore"])

    def test_weights(self):
        result = compute_readiness_score(checklist=[])
        self.assertEqual(result["weights"]["preEvent"], 0.40)
        self.assertEqual(result["weights"]["verification"], 0.35)
        self.assertEqual(result["weights"]["postEvent"], 0.25)

    def test_full_pre_event_moves_state(self):
        checklist = [
            {"id": "a:before:x", "eventPhase": "pre_risk", "completed": True},
            {"id": "b:before:x", "eventPhase": "pre_risk", "completed": True},
        ]
        result = compute_readiness_score(
            checklist=checklist,
            checks_sent=2,
            timely_responses=2,
            event_phase="pre_risk",
        )
        # 0.4*1 + 0.35*1 + 0.25*0.5(neutral post) = 0.875 → READY
        self.assertEqual(result["preparednessState"], "READY")
        self.assertGreaterEqual(result["scorePercent"], 70)

    def test_empty_checklist_unprepared(self):
        result = compute_readiness_score(checklist=[], event_phase="post_risk")
        # pre 0 + verify 0.5 + post 0 = 0.175 → UNPREPARED
        self.assertEqual(result["preparednessState"], "UNPREPARED")

    def test_verification_neutral_when_no_checks(self):
        result = compute_readiness_score(checklist=[], checks_sent=0)
        self.assertEqual(result["components"]["verification"], 0.5)

    def test_verification_ratio(self):
        result = compute_readiness_score(
            checklist=[],
            checks_sent=4,
            timely_responses=2,
        )
        self.assertEqual(result["components"]["verification"], 0.5)

    def test_sms_under_160(self):
        result = compute_readiness_score(
            checklist=[{"id": "x:before:y", "eventPhase": "pre_risk", "completed": True}],
            hazard_level="WATCH",
        )
        line = sms_status_line(result, "Clear drainage so crop roots do not drown and more words " * 8)
        self.assertLessEqual(len(line), 160)
        self.assertIn("WATCH", line)
        self.assertTrue(line.startswith("ALMA After:"))

    def test_ussd_head_separates_prep_and_hazard(self):
        result = {
            "preparednessState": "MODERATE",
            "scorePercent": 58,
            "hazardLevel": "COMPOUND",
        }
        head = ussd_status_head(result, 2, 5)
        self.assertIn("MODERATE", head)
        self.assertIn("COMPOUND", head)
        self.assertIn("2/5", head)


if __name__ == "__main__":
    unittest.main()
