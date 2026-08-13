"""Sector branching for My Readiness checklists."""
from __future__ import annotations

import unittest

from services.farmer_readiness import generate_checklist, resolve_sector_roles


class SectorRoleTests(unittest.TestCase):
    def test_explicit_roles(self):
        self.assertEqual(
            resolve_sector_roles(sector_roles=["fisher", "farmer"]),
            ["fisher", "farmer"],
        )

    def test_inferred_from_assets(self):
        self.assertEqual(
            resolve_sector_roles(
                crop_types=["maize"],
                livestock_types=["cattle"],
                fishery_types=["boats"],
            ),
            ["farmer", "herder", "fisher"],
        )

    def test_default_farmer(self):
        self.assertEqual(resolve_sector_roles(), ["farmer"])


class ChecklistBranchTests(unittest.TestCase):
    def _base(self, **kwargs):
        args = {
            "crop_types": [],
            "livestock_types": [],
            "climate_state": "wet_trend",
            "tier": "warning",
            "compound_active": False,
            "rain_eta_h": 12,
            "event_phase": "pre_risk",
        }
        args.update(kwargs)
        return generate_checklist(**args)

    def test_farmer_has_drainage_and_seed(self):
        items = self._base(crop_types=["maize"], sector_roles=["farmer"])
        ids = " ".join(i["id"] for i in items)
        tasks = " ".join(i["task"].lower() for i in items)
        self.assertIn("farmer:drain", ids)
        self.assertIn("drain", tasks)
        self.assertIn("seed", tasks)

    def test_herder_has_route_and_fodder(self):
        items = self._base(livestock_types=["goats"], sector_roles=["herder"])
        tasks = " ".join(i["task"].lower() for i in items)
        self.assertIn("grazing", tasks)
        self.assertIn("fodder", tasks)

    def test_fisher_has_tether_gear_bank(self):
        items = self._base(fishery_types=["boats"], sector_roles=["fisher"])
        tasks = " ".join(i["task"].lower() for i in items)
        self.assertIn("tether", tasks)
        self.assertIn("nets", tasks)
        self.assertIn("bank", tasks)
        self.assertTrue(any(i.get("sector") == "fisheries" for i in items))

    def test_tasks_sms_clipped(self):
        items = self._base(fishery_types=["boats"], sector_roles=["fisher"])
        for item in items:
            self.assertLessEqual(len(item["task"]), 90)


if __name__ == "__main__":
    unittest.main()
