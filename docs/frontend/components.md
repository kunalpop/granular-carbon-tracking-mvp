# Components

## Application shell

- `App.tsx` renders the header, product selector, network indicator, account
  selector, role/workflow-aware sidebar, route gates, and local reset control.
  The header indicator polls the configured RPC endpoint every five seconds;
  it is green only when the endpoint responds with the configured chain ID and
  red when the check fails or a different chain is returned.
- `main.tsx` provides `BrowserRouter`, `React.StrictMode`, and a render error
  boundary.

## Audit and correction components

- `AccountControl.tsx` switches the active configured demo account and emits
  `control-account-change`.
- `Audit.tsx` supplies the auditor's correction-task/history tabs and the
  escalation view used by `/escalations`. Escalation event choices come from
  the selected product's registered events: auditors can choose any event,
  while other roles see the form only when they own at least one event and can
  choose only events recorded by their account. After an escalation is
  submitted, the button briefly confirms `Submitted` and then returns to
  `Submit` for another escalation.
- `Corrections.tsx` reads events and multisig proposals, and submits
  correction proposals through `submitCorrection.ts`. It marks a correction as
  pending vote only while its multisig transaction is open, unexecuted, and
  still has enough eligible event-owner votes available to reach the approval
  threshold. This also handles older multisig deployments whose status can
  remain pending after every eligible owner has voted. Proposal status refreshes
  every five seconds and when the page regains focus.
  Event-owner multisig proposals use a two-of-three outcome: two eligible
  approvals approve, and two eligible rejections reject. Existing deployments
  must be redeployed to apply the corrected on-chain status calculation.
  Audit cards show the latest on-chain stage threshold; when no threshold has
  been saved, they show the Governance page's demo-data suggestion without a
  separate configured/suggested label.
  The Audit card keeps the reported CO2e fixed and shows a separate Corrected
  CO2e value that recalculates live from the editable activity and factor.
- `AuditHistory.tsx` displays corrections and multisig proposal outcomes for
  the selected product.
- `submitCorrection.ts` encodes a `correctEvent` call, submits it to the
  consortium multisig, and marks the event audit status pending.

## Events

- `Events.tsx` loads the selected product's records from chain, presents the
  active stage to the lifecycle actor, calculates CO2e live from the current
  activity and factor inputs, and enforces upstream-stage completion in the UI.
- `registerEmissionEvent.ts` submits the event using the stage actor's signer,
  reads its chain-calculated CO2e, and mirrors positive/negative values to the
  carbon token using the deployer signer.

## Governance

- `Governance.tsx` presents stage-threshold, escalation, and history tabs.
  The escalation resolve button displays `Resolving...` while its transaction
  is pending, displays `Resolved` after confirmation, and then clears the card
  from the Escalations tab. History entries identify correction approvers and
  escalation raisers by their configured lowercase account role. Correction
  approvers are the owners whose on-chain multisig votes approved the matching
  executed correction; correction values are read by their tuple positions.
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
  used by the governance page, including its per-card resolving and resolved
  button states.
- `Stage.tsx` renders lifecycle event details, audit/threshold status, and
  optional record, correction, or discard controls.

---

[Frontend Page](../../README.md#frontend) · [Project Page](../../README.md)
