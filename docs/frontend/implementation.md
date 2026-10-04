# Implementation

## Application shell

### `App.tsx`

`App.tsx` is the main application shell and route coordinator. It:

- renders the top bar, product selector, network status, sidebar, and main content
- defines the route set used by the app
- gates access to later workflow steps using participant registration, product selection, and event completion state
- tracks the selected role and product ID in localStorage
- exposes the reset flow that clears browser state and returns the user to `/participants`

### `main.tsx`

`main.tsx` is the browser entry point. It imports the global stylesheet, creates the React root, wraps the app in `React.StrictMode`, and provides `BrowserRouter` for navigation.

## Current route structure

The active route set in the app is:

- `/participants`
- `/product`
- `/events`
- `/results`
- `/audit`
- `/voting`
- `/governance`
- `/escalations`

The route guards in `App.tsx` enforce access based on the selected role and whether the workflow has progressed far enough.

## Smart-contract integration

The frontend uses ethers to read and write the deployed contracts on the local Besu network. Contract addresses come from `frontend/src/services/contractAddresses.ts`, while the ABIs are supplied by the compiled contract artifacts and the control ABI helpers.

The main contracts used by the app are:

- `ParticipantRegistry.sol`
- `EmissionEventRegistry.sol`
- `CarbonToken.sol`
- `GovernanceModule.sol`
- `AggregationContract.sol`
- `OntologyRegistry.sol`
- `ConsortiumMultisig.sol`

Read-only calls use the JSON-RPC provider. Transactional calls use the wallet selected by `getSigner.ts` and the current account role.

## Component layout

The `frontend/src/components` tree is organised by workflow area:

### `audit`

- `AccountControl.tsx` switches the active demo role.
- `Audit.tsx` provides the audit and escalation review pages.
- `AuditHistory.tsx` combines correction and escalation history.
- `Corrections.tsx` reads chain correction records for review.
- `submitCorrection.ts` submits correction proposals.

### `events`

- `Events.tsx` records lifecycle events and tracks updates.
- `registerEmissionEvent.ts` submits events to the registry.

### `governance`

- `Governance.tsx` manages thresholds and governance activity.
- `Voting.tsx` handles accept/reject decisions for proposals.

### `participants`

- `Participants.tsx` displays and registers participant accounts.
- `registerParticipants.ts` registers participants and their stage permissions.
- `getRegisteredParticipants.ts` reads participant state from the registry.

### `product`

- `Product.tsx` handles product review and registration state.
- `registerProduct.ts` registers the product.
- `mintProduct.ts` mints the product passport.

### `results`

- `Results.tsx` provides the study tabs and summary views.
- `studyTampering.ts` runs the tampering scenarios.
- `studyAggregation.ts` checks totals and fault conditions.
- `studyPerformance.ts` loads benchmark data and compares metrics.

## Shared and service layers

- `frontend/src/shared/Button.tsx` provides button variants.
- `frontend/src/shared/Escalation.tsx` renders escalation details and resolution actions.
- `frontend/src/shared/Stage.tsx` renders the event card with status information.
- `frontend/src/hooks/useContracts.ts` provides the contract factory methods.
- `frontend/src/services/*` provides network config, signers, contract addresses, lifecycle metadata, and chain readers.

## Current workflow behavior

1. Participant registration sets the authorised actors and stage permissions.
2. Product registration creates a product and mints its passport.
3. The events workflow records one lifecycle event at a time in stage order.
4. Event data is stored on chain and mirrored through the carbon token where relevant.
5. Auditor, governance, and escalation pages read the on-chain records and provide review actions.
6. The Results page runs the three browser-safe evaluation studies.
7. The reset control clears only local browser state; on-chain records remain unchanged.

## State and persistence

On-chain state remains authoritative for participants, products, emission events, corrections, escalations, thresholds, token balances, and governance actions.

LocalStorage stores UI selections, workflow caches, review state, and study results. Clearing the browser cache does not remove blockchain data or deployed contracts.
