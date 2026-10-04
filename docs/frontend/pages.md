# Pages

The frontend provides role-aware workflow pages for participant registration, product management, event recording, governance review, and study results. Page access is gated by registration state and the selected account role.

## `/participants`

Displays the configured participants and their assigned lifecycle stages. `Participants.tsx` verifies registration status and access against the participant registry. Confirmed participant state is cached in `registered-actors-cache`.

This is the default entry page for a new workflow.

## `/product`

Displays the selected product and review state. Product registration and passport minting are handled through `registerProduct.ts` and `mintProduct.ts`.

The selected product ID is persisted in `selected-product-id`, and the product record is cached in `registered-product-cache`.

## `/events`

Displays the selected product's lifecycle events. `Events.tsx` renders one stage at a time and records a new event through `registerEmissionEvent.ts`.

Events must be recorded sequentially. The next event is only enabled after the previous event is confirmed on chain. Successful progress is cached in `registered-emission-events-cache`.

## `/audit`

Available to the auditor role. `Audit.tsx` shows correction history and escalation review state, while `Corrections.tsx` and `AuditHistory.tsx` read data from chain and present it in a review view.

## `/voting`

Displays correction proposals for eligible voting accounts. A user reviews the event, corrected values, reason, and supporting evidence before accepting or rejecting the proposal on chain.

## `/governance`

Available to the deployer/governance role. `Governance.tsx` manages stage thresholds, pending governance work, and the governance history.

## `/escalations`

Provides the escalation workflow. Users can inspect the selected event, reason, threshold, and current resolution state. The governor can add a resolution comment and resolve the escalation on-chain.

## `/results`

Contains the three browser-safe study tabs:

- Tampering (`studyTampering.ts`)
- Aggregation (`studyAggregation.ts`)
- Performance (`studyPerformance.ts`)

Each study has idle, running, and complete states. Results are persisted locally and the reset control clears browser state without deleting on-chain records.
