# Components

## Application shell

- `App.tsx` renders the header, product selector, network indicator, account
  selector, role/workflow-aware sidebar, route gates, and local reset control.
- `main.tsx` provides `BrowserRouter`, `React.StrictMode`, and a render error
  boundary.

## Audit and correction components

- `AccountControl.tsx` switches the active configured demo account and emits
  `control-account-change`.
- `Audit.tsx` supplies the auditor's correction-task/history tabs and the
  escalation view used by `/escalations`.
- `Corrections.tsx` reads events and multisig proposals, and submits
  correction proposals through `submitCorrection.ts`.
- `AuditHistory.tsx` displays corrections and multisig proposal outcomes for
  the selected product.
- `submitCorrection.ts` encodes a `correctEvent` call, submits it to the
  consortium multisig, and marks the event audit status pending.

## Events

- `Events.tsx` loads the selected product's records from chain, presents the
  active stage to the lifecycle actor, and enforces upstream-stage completion
  in the UI.
- `registerEmissionEvent.ts` submits the event using the stage actor's signer,
  reads its chain-calculated CO2e, and mirrors positive/negative values to the
  carbon token using the deployer signer.

## Governance

- `Governance.tsx` presents stage-threshold, escalation, and history tabs.
- `Voting.tsx` decodes multisig correction transactions and offers vote
  actions only for eligible owners.

## Participants

- `Participants.tsx` lists the lifecycle actors represented in
  `simulation/emission-factors.json`; the deployer can register configured
  accounts and stage permissions.
- `getRegisteredParticipants.ts` reads registration state and participant
  names/roles from the registry, then derives displayed stage IDs from the
  local stage metadata; it does not read on-chain stage authorisations.
- `registerParticipants.ts` submits participant registrations and stage
  authorisations.

The account configuration includes an auditor. The page renders rows from the
stage metadata, so the auditor is not shown as a lifecycle stage. The current
participant form builds its submitted stage defaults by account-list position
instead of matching all stage IDs for each role: OEM defaults to stage 5
(although it owns stages 5 and 6), logistics to 6 (not 7), use-phase to 7 (not
8), repairer to 8 (not 9), recycler to 9 (not 10), and auditor to 10. The
stage rows shown in the form are based on metadata and can therefore differ
from the authorisations the registration helper submits.

## Product

- `Product.tsx` holds the deployer/OEM product-description review in
  `localStorage`, then allows the deployer to register after OEM confirmation.
- `registerProduct.ts` creates the product with the OEM signer and mints its
  passport with the deployer signer.
- `mintProduct.ts` is a separate helper, but it is not imported by the current
  Product page.

## Results

- `Results.tsx` presents Tampering, Aggregation, and Performance tabs, stores
  results locally, and updates the reset gate after all three have results.
- `studyTampering.ts` evaluates six conceptual tampering scenarios using the
  selected product's fetched event records and configured stage values.
- `studyAggregation.ts` calculates event/configuration checks and browser-side
  fault-check outcomes; it does not call the deployed aggregation contract.
- `studyPerformance.ts` loads committed four- and seven-validator benchmark
  JSON and calculates percentage changes.

The original Node/Hardhat evaluation drivers are separate from these browser
components.

## Shared components

- `Button.tsx` provides primary and secondary button variants.
- `Escalation.tsx` renders escalation information and the resolution controls
  used by the governance page.
- `Stage.tsx` renders lifecycle event details, audit/threshold status, and
  optional record, correction, or discard controls.

---

[Frontend Page](../../README.md#frontend) · [Project Page](../../README.md)
