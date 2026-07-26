# ALMA Build Tasks (for Cursor)

Context: this is the exported codebase from the Lovable project 
"Turkana Watch" — a dual-trigger (rainfall + Gibe III dam) flood early 
warning dashboard for the Omo River–Lake Turkana basin. Existing pages: 
Dashboard, Alerts Log, Communities, Simulator. Keep all existing 
functionality and mock data intact — these tasks ADD to the app, they 
don't replace anything.

Work through tasks in order. Each task should be a small, reviewable 
commit. Add clear comments explaining WHY a section exists, not just 
what it does — this matters for the hackathon judging on technical depth.

---

## Task 1 — Rebrand to ALMA

- [x] Find the site title/header component (likely a shared layout/nav 
  component used across all pages)
- [x] Change displayed name from "Turkana Watch" to "ALMA", with 
  subtitle "Automated Land & Moisture Action"
- [x] Keep "Omo River – Lake Turkana flood EWS" as a secondary line
- [x] Update the footer/data-source note to read something like:
  "Rainfall data modeled on CHIRPS satellite estimates. Dam reservoir 
  levels are simulated/estimated for this prototype, not live telemetry."
  — this is a factual accuracy fix, not just branding. Do not imply 
  live dam data access.
- [x] Update page <title> tags and any meta description strings to say 
  ALMA instead of Turkana Watch

## Task 2 — Region/Pilot Select Dropdown

- [ ] Add a dropdown to the nav bar (next to Dashboard/Alerts Log/
  Communities/Simulator links)
- [ ] Options: "Omo–Turkana (Active Pilot)" [default, functional], 
  "Tana River System (Coming Soon)", "Northern Arid Lands (Coming Soon)"
- [ ] Selecting a "Coming Soon" option should NOT navigate away — show 
  a simple placeholder card/modal instead:
  - Tana River: "Expansion zone — Seven Forks Hydro-Dam overflow 
    monitoring coming soon"
  - Northern Arid Lands: "Expansion zone — NDVI/soil-moisture drought 
    and grazing risk monitoring coming soon"
- [ ] This is a scalability signal for judges — keep it lightweight, 
  no need to build real logic for the other two regions

## Task 3 — New Page: Sector Guidance

- [ ] Add a new route/page: `/sector-guidance` (or match existing 
  routing convention in the repo, e.g. `/sectors`)
- [ ] Add it to the nav bar after Simulator
- [ ] Build a tab bar or toggle: Agriculture | Livestock | Fisheries | Health
- [ ] Each tab pulls the CURRENT compound risk tier from the same mock 
  data source already used on the Dashboard page (do not create a 
  second source of truth for risk data)
- [ ] Each tab displays one action card with sector-specific guidance, e.g.:
  - Agriculture: "Harvest mature crops within 36h. Clear drainage 
    channels near Omorate and Kalam."
  - Livestock: "Move herds to higher-ground corridor. Safe forage 
    available for 8 days at [named corridor]."
  - Fisheries: "Upstream surge arriving at Lake Delta in 18h. Anchor 
    boats above the 5m waterline."
  - Health: "Elevated waterborne disease risk in 3-5 days post-flood. 
    Prep water purification at affected health posts."
- [ ] Below the tabs, add a matrix/table view: rows = severity tiers 
  (Safe/Watch/Warning/Severe/Compound), columns = the 4 sectors, 
  cells = one-line action summary. This is the "at a glance" view for 
  a disaster manager reviewing all sectors at once.
- [ ] Reuse existing severity color coding (Safe/Watch/Warning/Severe) 
  already established on the Dashboard/Communities pages for consistency

## Task 4 — Simulator: Send Demo SMS

- [ ] On the existing Simulator page, below the sample alert message 
  output, add:
  - A phone number input field
  - A "Send Demo SMS to This Number" button
- [ ] Implement using Africa's Talking sandbox API:
  - If an API key/env var is present (e.g. `AT_API_KEY`, `AT_USERNAME`), 
    make a real POST request to their SMS sandbox endpoint
  - If no credentials are configured yet, show a toast/confirmation: 
    "Demo mode: SMS simulated" — so the UI flow works end-to-end even 
    before credentials are added
  - Add a code comment marking exactly where the real API call goes, 
    so it's a one-line swap once credentials exist
- [ ] Reference: Africa's Talking sandbox docs — 
  https://developers.africastalking.com/docs/sms/sending

## Task 5 — Alerts Log: Verification Column

- [ ] Add a new column "Verification" to the existing alerts table
- [ ] Values: "Unconfirmed (model estimate)", "Confirmed (field report)", 
  "False alarm"
- [ ] Color coding: gray = unconfirmed, green = confirmed, muted red = 
  false alarm
- [ ] Extend the existing mock alert data objects with a `verification` 
  field (don't restructure the existing table, just add the field + column)
- [ ] This represents the two-way verification loop concept — ground 
  truth feeding back into system confidence over time

---

## Notes for whoever's building this
- Keep component/file naming consistent with what's already in the repo 
  — check existing folder structure before creating new files
- Comment the "why" for sector guidance and compound risk logic 
  specifically — these are the pieces judges will ask about
- Don't touch the core compound risk calculation logic unless a task 
  explicitly says to — it's already working correctly