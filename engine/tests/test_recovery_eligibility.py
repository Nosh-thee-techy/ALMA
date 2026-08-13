"""Unit tests — parametric recovery eligibility (not payment/credit)."""
from __future__ import annotations

import unittest

from services.recovery_eligibility import (
    pre_event_log_active,
    resolve_parametric_flag,
    sms_eligibility_line,
)


class PreEventLogTests(unittest.TestCase):
    def test_completed_pre_event_counts(self):
        self.assertTrue(
            pre_event_log_active(
                [{"id": "farmer:drain:before:wet", "eventPhase": "pre_risk", "completed": True}]
            )
        )

    def test_post_event_only_does_not_count(self):
        self.assertFalse(
            pre_event_log_active(
                [{"id": "farmer:inspect:after:x", "eventPhase": "post_risk", "completed": True}]
            )
        )

    def test_incomplete_does_not_count(self):
        self.assertFalse(
            pre_event_log_active(
                [{"id": "a:before:x", "eventPhase": "pre_risk", "completed": False}]
            )
        )


class ParametricFlagTests(unittest.TestCase):
    def test_all_criteria_yes(self):
        audit = resolve_parametric_flag(
            presence_verified=True,
            region_hazard_hours=6.0,
            pre_event_log_active=True,
        )
        self.assertTrue(audit["recovery_eligibility_flag"])
        self.assertTrue(audit["not_credit"])
        self.assertTrue(audit["not_payment"])
        self.assertEqual(audit["deny_reasons"], [])

    def test_hours_below_threshold(self):
        audit = resolve_parametric_flag(
            presence_verified=True,
            region_hazard_hours=5.9,
            pre_event_log_active=True,
        )
        self.assertFalse(audit["recovery_eligibility_flag"])
        self.assertIn("parametric_hours_below_threshold", audit["deny_reasons"])

    def test_missing_pre_event_log(self):
        audit = resolve_parametric_flag(
            presence_verified=True,
            region_hazard_hours=12,
            pre_event_log_active=False,
        )
        self.assertFalse(audit["recovery_eligibility_flag"])
        self.assertIn("no_pre_event_readiness_log", audit["deny_reasons"])

    def test_presence_required(self):
        audit = resolve_parametric_flag(
            presence_verified=False,
            region_hazard_hours=12,
            pre_event_log_active=True,
        )
        self.assertFalse(audit["recovery_eligibility_flag"])
        self.assertIn("presence_not_verified", audit["deny_reasons"])

    def test_sms_lines_under_160(self):
        yes = resolve_parametric_flag(
            presence_verified=True,
            region_hazard_hours=8,
            pre_event_log_active=True,
        )
        no = resolve_parametric_flag(
            presence_verified=True,
            region_hazard_hours=1,
            pre_event_log_active=False,
        )
        self.assertLessEqual(len(sms_eligibility_line(yes)), 160)
        self.assertLessEqual(len(sms_eligibility_line(no)), 160)
        self.assertIn("YES", sms_eligibility_line(yes))
        self.assertIn("NO", sms_eligibility_line(no))


if __name__ == "__main__":
    unittest.main()
