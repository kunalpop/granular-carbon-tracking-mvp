# Components

## Application shell

- `App.tsx` renders the header, network indicator, gated sidebar navigation,
  route guards, and the sidebar reset button.
- `Button.tsx` provides primary and secondary button variants.

## Workflow components

- `Participants.tsx` displays and registers participants and restores their
  registration state.
- `Product.tsx` displays product metadata, registers the product, mints its
  passport, and restores its registration state.
- `Simulation.tsx` manages the current stage, slider navigation, recording
  state, local event cache, totals, and threshold reporting.
- `Stage.tsx` renders one event card with activity, emission factor, schema,
  owner, CO2e, reporting standard, previous event, status dot, and record button.

- `Results.tsx` provides Tampering, Aggregation, and Performance tabs, study
  buttons, status dots, persistence, and right-card summaries.
- `studyTampering.ts` runs browser-safe Study A scenarios against cached events.
- `studyAggregation.ts` runs browser-safe Study B aggregation and fault checks.
- `studyPerformance.ts` loads the committed Study C benchmark JSON files and
  calculates TPS and latency changes.

The original evaluation scripts remain Node/Hardhat programs and are not
imported into browser components.

## LocalStorage cache

The frontend uses these localStorage keys to preserve workflow progress across
page navigation and refreshes:

- `registered-actors-cache` — registered participant details, roles, addresses,
  and assigned stages.
- `registered-product-cache` — registered product ID, description, and OEM
  address.
- `registered-emission-events-cache` — recorded event stage IDs, CO2e values,
  and event hashes.
- `tampering-study-result` — completed Tampering Study result and scenario
  outcomes.
- `aggregation-study-result` — completed Aggregation Study checks and results.
- `performance-study-result` — completed Performance Study benchmark metrics.
- `evaluation-studies-complete` — completion flag set after all three studies
  finish; controls visibility of the sidebar reset button.
