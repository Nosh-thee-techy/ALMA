---
name: ALMA
description: Field-dispatch early action surface for Omo–Turkana compound flood risk
colors:
  primary: "oklch(0.4 0.09 210)"
  act: "oklch(0.42 0.11 155)"
  background: "oklch(0.955 0.018 85)"
  foreground: "oklch(0.24 0.035 55)"
  card: "oklch(0.99 0.008 85)"
  dust: "oklch(0.91 0.025 80)"
  muted-foreground: "oklch(0.42 0.03 55)"
  border: "oklch(0.82 0.025 80)"
  risk-safe: "oklch(0.55 0.12 150)"
  risk-watch: "oklch(0.72 0.14 92)"
  risk-warning: "oklch(0.65 0.16 55)"
  risk-severe: "oklch(0.5 0.2 28)"
typography:
  body:
    fontFamily: "Atkinson Hyperlegible, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  headline:
    fontFamily: "Atkinson Hyperlegible, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.15
rounded:
  md: "0.5rem"
  xl: "0.75rem"
spacing:
  section: "2rem"
components:
  button-act:
    backgroundColor: "{colors.act}"
    textColor: "oklch(0.98 0.01 155)"
    rounded: "{rounded.md}"
    padding: "0.75rem 1.25rem"
---

# Design System: ALMA

## Overview

**Creative North Star: "The Field Dispatch Desk"**

ALMA is an Early Action Agent for county and NGO officers who open a laptop between radio calls. The surface must answer three questions before charts: what is wrong, why (rain + dam), what to do next. Visual language is dust-lit and hyperlegible—not a cool-gray SaaS console.

**Key Characteristics:**
- Atkinson Hyperlegible for maximum scan clarity
- Dust paper ground + charcoal ink + river teal system chrome
- Forage green reserved for act CTAs
- Risk ladder colors only for hazard meaning
- Situation banner owns the first viewport; map and trends are supporting

## Colors

Restrained chassis with committed severe banner when compound is elevated.

### Primary
- **River Teal** — nav active, brand tile, water/system meaning

### Act
- **Forage Green** — “What should each sector do?” and other next-step buttons

### Neutral
- **Dust / Ink / Card** — field-office paper, readable body, surfaces

### Risk ladder
Safe / Watch / Warning / Severe — never used as decoration

### Named Rules
**The Three-Question Rule.** First viewport must answer WHAT → WHY → WHAT TO DO before any chart.

**The Plain Lexicon Rule.** Keep domain terms (Compound Risk, Gibe III) but always pair with one plain sentence.

**The Honest Telemetry Rule.** Simulated dam data stays labeled; never imply live SCADA.

## Typography

**Body/Display:** Atkinson Hyperlegible (400/700). Bold for actions and levels; tabular nums for hours.

## Layout

`max-w-6xl` dispatch canvas. Section rhythm ~2rem. Situation banner full width; two-column trigger explainers; list before map.

## Elevation & Depth

Flat cards with hairline borders. Severe situation uses filled risk color, not decorative shadows.

## Shapes

`0.5rem` controls; `0.75rem` major panels. Pill badges for tiers only.

## Components

### Act buttons
Forage green, bold label, large touch target.

### Situation banner
Owns first viewport; contains level, ETA, plain explanation, three actions.

### Trigger explainers
Icon + level badge + plain paragraph + raw numbers as secondary line.

## Do's and Don'ts

### Do:
- **Do** lead with the human sentence, then the domain label.
- **Do** put sector playbooks / warn / verify on the situation itself.
- **Do** keep USSD `*384*96428#` visible in chrome.

### Don't:
- **Don't** present three equal gauge cards as the homepage.
- **Don't** use risk reds/ambers for charts or brand decoration.
- **Don't** bury compound below rainfall on any viewport.
