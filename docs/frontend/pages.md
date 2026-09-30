# Pages

The frontend provides workflow pages for participant registration, product
management, lifecycle events, audit, governance, voting, escalations, and
results. Navigation is role-aware and later workflow pages are gated by the
selected account and product state.

## `/participants`

Displays the configured supply-chain participants and their assigned lifecycle
stages. The deployer registers participants through
`components/participants/registerParticipants.ts`, while
`Participants.tsx` verifies registration and stage permissions against the
participant registry. Confirmed participant details are cached in
`registered-actors-cache`.

This is the default entry page for a new workflow.

## `/product`

Displays product details and the product-review state. The deployer submits
product details for OEM review, the OEM confirms the details, and the deployer
registers the product and mints its passport through `registerProduct.ts` and
`mintProduct.ts`.

Each product has its own product ID, passport, event chain, audit records,
governance records, and evaluation context. The selected product ID is stored
in `selected-product-id`, and the confirmed product record is cached in
`registered-product-cache`.

## `/events`

Displays the selected product's lifecycle stages and records one emission event
at a time. `Events.tsx` uses `Stage.tsx` to show activity, emission factor,
schema, owner, CO2e, methodology, audit status, threshold status, and previous
event information.

Events must be recorded in sequence. The next event is available only after the
previous event has been confirmed in the selected product's on-chain event
chain. `registerEmissionEvent.ts` submits the event to
`EmissionEventRegistry`, which calculates signed CO2e on chain and mirrors
positive or negative values through `CarbonToken`.

Successful event progress is cached in
`registered-emission-events-cache`. Completing all ten stages enables Results.

## `/audit`

Available to the auditor account. `Audit.tsx` provides correction, escalation,
and history views. `Corrections.tsx` reads correction records and event
references from the chain, while `AuditHistory.tsx` combines correction and
escalation activity into a chronological review view.

The audit page is read-oriented: the blockchain remains the source of truth for
event hashes, evidence hashes, correction reasons, timestamps, and status
changes.

## `/voting`

Displays correction proposals for eligible voting accounts through `Voting.tsx`.
A voter reviews the original event, corrected values, reason, and supporting
evidence, then submits an accept or reject decision. The decision is recorded
on chain and a proposal cannot be decided twice by the same account.

## `/governance`

Available to governor accounts through `Governance.tsx`. The page manages
pending corrections, stage CO2e thresholds, escalation resolution, and
governance history. Thresholds are saved on chain in grams. Screening can raise
an escalation when an event exceeds its configured stage threshold.

## `/escalations`

Provides the escalation workflow for eligible accounts. Users can inspect the
selected product, event index, CO2e value, threshold, reason, and current
resolution state. Governors can add a resolution comment and resolve an
escalation through the on-chain governance contract.

Escalation status and resolution metadata are stored on chain. Resolution
comments are currently retained in localStorage under
`escalation-resolution-comments` for the interface.

## `/results`

Contains three local evaluation tabs for the selected product:

- **Tampering:** browser-safe Study A scenarios from `studyTampering.ts`.
- **Aggregation:** browser-safe Study B checks from `studyAggregation.ts`.
- **Performance:** committed Study C benchmark JSON loaded by
  `studyPerformance.ts`.

Each study has idle, running, and complete states. Results are stored in
localStorage under the study-specific keys and displayed in the summary card.
After all three studies complete, the reset control clears local browser state
and returns to `/participants`. It does not delete any on-chain records.
