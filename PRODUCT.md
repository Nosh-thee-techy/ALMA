# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary / Operational:** County disaster management officers, ICPAC/CEWARN regional analysts, and NGO emergency response teams who need an instant, cross-border view of compound riverine risks between rapid field deployments.

**Secondary / Last-Mile:** Feature-phone-reliant pastoralists, flood-plain farmers, and Lake Turkana fishers who need localized, sector-specific survival guidance rather than raw data.

## Product Purpose

ALMA (Automated Land & Moisture Action) is a dual-trigger flood early warning system for the Omo River–Lake Turkana basin. It turns upstream rainfall runoff and Gibe III dam spillway release signals into a single compound-risk picture and actionable sector playbooks, so responders and communities can act within a 24-hour arrival window rather than react to generic flood alerts.

Success means operators can see compound risk clearly across the basin, and last-mile recipients get sector-specific guidance (Agriculture, Livestock, Fisheries, Health) they can act on—including over SMS/USSD when there is no internet.

## Positioning

**True Dual-Trigger Compound Risk Intelligence:** Neighboring systems typically monitor either upstream rainfall or static reservoir levels. ALMA models the spatial and temporal collision of upstream rainfall runoff and Gibe III dam spillway releases into a single 24-hour arrival window.

**Detect-to-Action Pipeline:** Instead of broadcasting generic panic warnings ("Floods coming"), ALMA calculates safe, high-ground grazing corridors (via satellite NDVI) and delivers sector-specific, multi-lingual action playbooks directly over zero-internet SMS/USSD.

## Operating Context

- Cross-border Omo–Turkana pilot (Kenya / Ethiopia sides), with expansion zones signaled for Tana River System and Northern Arid Lands.
- Operator workflows: Dashboard compound-risk overview, Alerts Log with verification loop, Communities status, Simulator for alert fan-out rehearsal, Sector Guidance playbooks.
- Last-mile channels: SMS, USSD (`*384*96428#`), dashboard, and radio-oriented delivery in the alert model.
- Prototype / hackathon deployment: mock rainfall modeled on CHIRPS-style estimates; dam reservoir levels are simulated/estimated, not live telemetry.

## Capabilities and Constraints

- Dual-trigger compound risk tiers (Safe / Watch / Warning / Severe / Compound) shared across Dashboard, Communities, and Sector Guidance.
- Sector playbooks for Agriculture, Livestock, Fisheries, and Health, driven by the same compound-risk source of truth.
- Alert simulator with demo SMS dispatch (Africa's Talking sandbox when credentials exist; otherwise clearly labeled demo/simulation mode).
- Alerts Log verification states: Unconfirmed (model estimate), Confirmed (field report), False alarm.
- Domain terminology that must remain precise: Compound Risk, Hydrograph, Propagation Delay, NDVI Forage Index, Sector Playbooks.
- Constraint: do not invent live dam telemetry access; keep mock vs real feeds visually and copy-wise distinct.

## Brand Commitments

- Name: **ALMA** — Automated Land & Moisture Action.
- Persona: active AI Early Action Agent (not a passive monitoring dashboard brand).
- Secondary line: Omo River – Lake Turkana flood EWS.
- Low-bandwidth first: USSD/SMS feature-phone accessibility (`*384*96428#`) must stay front and center alongside the web dashboard.

## Evidence on Hand

- Working web prototype with Dashboard, Alerts Log, Communities, Simulator, and Sector Guidance.
- Mock basin data and compound-risk logic in `src/lib/turkana-data.ts`.
- Demo SMS path via Africa's Talking sandbox (`AT_API_KEY` / `AT_USERNAME`) or simulated confirmation without credentials.
- No live Gibe III telemetry, no production field testimonials, and no verified multi-lingual SMS corpora in-repo—future work must not fabricate those as proven facts.

## Product Principles

1. **Compound truth over single-signal noise** — always show rainfall + dam collision, not isolated gauges.
2. **Detect to action** — every risk view should connect to a sector playbook or last-mile channel, not stop at a chart.
3. **Honest telemetry** — label simulations and mocks explicitly; never imply live dam feeds the prototype does not have.
4. **Low-bandwidth parity** — feature-phone SMS/USSD is a first-class surface, not a footnote to the dashboard.
5. **Domain language stays precise** — keep Compound Risk, Hydrograph, Propagation Delay, NDVI Forage Index, and Sector Playbooks intact.

## Accessibility & Inclusion

Last-mile users are often feature-phone-reliant with intermittent or no internet; SMS/USSD (`*384*96428#`) and clear, sector-specific guidance are accessibility requirements for the product, not optional extras. Multi-lingual playbook delivery is a stated product direction; exact languages and copy sets are not yet locked as production assets in this repo.
