# Components

## Application shell

- `App.tsx` renders the header, network indicator, gated sidebar navigation,
  route guards, and the sidebar reset button.

## Audit components

- `Audit.tsx` provides corrections, escalations, and history audit views.
- `AccountControl.tsx` switches the active demo account role.
- `AuditHistory.tsx` combines correction and escalation records into a history
  view.
- `Corrections.tsx` reads on-chain correction events for review.
- `submitCorrection.ts` submits a correction proposal on chain.

## Events components

- `Events.tsx` records lifecycle emission events by stage, calculates CO2e,
  restores cached events, and reports threshold status.
- `registerEmissionEvent.ts` submits an emission event to the contracts.

## Governance components

- `Governance.tsx` manages pending corrections, escalation resolution,
  threshold settings, and governance history.
- `Voting.tsx` displays correction proposals and submits accept or reject
  decisions for the active account.

## Participants components

- `Participants.tsx` displays and registers participants, including their
  roles and assigned stages.
- `getRegisteredParticipants.ts` reads registered participant data from the
  contracts.
- `registerParticipants.ts` registers participant data on chain.

## Product components

- `Product.tsx` displays product metadata, manages product review status,
  registers the product, mints its passport, and restores its state.
- `registerProduct.ts` registers product metadata and returns registered
  product details.
- `mintProduct.ts` mints the product passport.

## Results components

- `Results.tsx` provides Tampering, Aggregation, and Performance tabs, study
  buttons, status dots, persistence, and right-card summaries.
- `studyTampering.ts` runs browser-safe Study A scenarios against cached events.
- `studyAggregation.ts` runs browser-safe Study B aggregation and fault checks.
- `studyPerformance.ts` loads the committed Study C benchmark JSON files and
  calculates TPS and latency changes.

The original evaluation scripts remain Node/Hardhat programs and are not
imported into browser components.

## Shared components

- `Button.tsx` provides primary and secondary button variants.
- `Escalation.tsx` renders escalation details, comments, and resolution
  controls.
- `Stage.tsx` renders one event card with activity, emission factor, schema,
  owner, CO2e, reporting standard, previous event, status dot, and record
  button.
