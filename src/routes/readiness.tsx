/**
 * Farmer After app on its own host (after.localhost / after.*).
 * Not part of the operator desk.
 */
import { createFileRoute } from "@tanstack/react-router";
import { FarmerAfterApp } from "@/components/turkana/FarmerAfterApp";

export const Route = createFileRoute("/readiness")({
  head: () => ({
    meta: [
      { title: "After — My Readiness — ALMA" },
      {
        name: "description",
        content: "Farmer After app: what to do after the flood. Same SMS tips as USSD 7 and voice 6.",
      },
    ],
  }),
  component: FarmerAfterApp,
});
