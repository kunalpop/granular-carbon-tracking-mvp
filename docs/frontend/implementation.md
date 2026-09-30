# Implementation

## Application shell

### `App.tsx`

`App.tsx` is the application shell and route coordinator. It:

- Renders the top bar, network status, sidebar navigation, and main content.
- Provides routes for participant registration, product registration, event
  recording, audit, governance, and evaluation results.
- Gates later workflow pages based on the selected product, registered data,
  recorded events, and evaluation completion state.
- Tracks participant, product, event, and study completion through browser
  events and localStorage.
- Provides product selection and the application reset control.
- Clears localStorage and returns the user to the participant workflow when a
  new run is started.

### `main.tsx`

`main.tsx` is the browser entry point. It:

- Imports the global stylesheet.
- Finds the root DOM element.
- Wraps the application in `React.StrictMode`.
- Provides `BrowserRouter` for route navigation.
- Mounts the React application with `createRoot`.

The file is named `main.tsx`; there is no `Main.tsx` file.

## Smart-contract implementation

The frontend uses ethers to read and write the deployed contracts on the local
Besu network. Contract addresses are loaded from
`frontend/src/services/contractAddresses.ts` and ABIs are supplied by the
compiled contract artifacts.

- `ParticipantRegistry.sol` stores participant identities, active status, and
  lifecycle-stage permissions.
- `EmissionEventRegistry.sol` stores products and the append-only,
  hash-linked emission-event chains. CO2e is calculated on chain.
- `CarbonToken.sol` stores product passports and positive or negative carbon
  balances mirrored from event records.
- `GovernanceModule.sol` stores corrections, stage thresholds, escalations, and
  escalation resolutions.
- `AggregationContract.sol` derives product and stage totals, completeness, and
  cross-checks from registry and token state.
- `OntologyRegistry.sol` stores versioned event schemas and their document
  hashes.
- `ConsortiumMultisig.sol` stores multi-party administrative transactions and
  confirmations.

Read-only calls use the shared JSON-RPC provider. Transactional operations use
role-selected wallets from `getSigner.ts`.

## Components folder

The `frontend/src/components` folder is organised by workflow area.

### `audit`

- `Audit.tsx` provides correction, escalation, and audit-history views.
- `AccountControl.tsx` switches the active demo account role.
- `Corrections.tsx` reads on-chain correction events and presents records for
  review.
- `AuditHistory.tsx` combines correction and escalation records into a history
  view.
- `submitCorrection.ts` submits correction proposals on chain.

### `events`

- `Events.tsx` records lifecycle emission events one stage at a time, restores
  cached progress, calculates display values, and reports threshold status.
- `registerEmissionEvent.ts` converts frontend values to the contract's fixed-
  point representation, hashes compact evidence, and submits the event.

### `governance`

- `Governance.tsx` manages pending corrections, escalation resolution, stage
  thresholds, and governance history.
- `Voting.tsx` loads correction proposals and submits accept or reject
  decisions for the active account.

### `participants`

- `Participants.tsx` displays configured participants, registers them, and
  restores confirmed registration state.
- `registerParticipants.ts` registers accounts and authorises lifecycle stages
  on chain.
- `getRegisteredParticipants.ts` reads and formats participant state from the
  participant registry.

### `product`

- `Product.tsx` displays product metadata, manages the product-review state,
  registers the product, mints its passport, and restores confirmed state.
- `registerProduct.ts` creates the product on chain.
- `mintProduct.ts` mints the product passport through the carbon-token
  contract.

### `result`

- `Results.tsx` provides Tampering, Aggregation, and Performance evaluation
  tabs and persists their results.
- `studyTampering.ts` runs browser-safe tampering scenarios against cached
  event data.
- `studyAggregation.ts` checks totals, stage coverage, hashes, traceability,
  completeness, and fault cases.
- `studyPerformance.ts` loads committed benchmark JSON files and calculates
  throughput and latency comparisons.

## Shared components and services

- `frontend/src/shared/Button.tsx` provides primary and secondary button
  variants.
- `frontend/src/shared/Escalation.tsx` renders escalation details, comments,
  and resolution controls.
- `frontend/src/shared/Stage.tsx` renders event details, audit and threshold
  status, and record or discard controls.
- `frontend/src/hooks/useContracts.ts` provides ethers contract factories for
  read-only providers or role-selected signers.
- `frontend/src/services/controlContracts.ts` provides contract access for
  governance controls.
- `frontend/src/services/emissionFactors.ts` provides lifecycle-stage metadata
  and emission-factor configuration.
- `frontend/src/services/getParticipants.ts` and
  `getRegisteredProducts.ts` read registered chain data.

## Current workflow behavior

The implemented workflow proceeds as follows:

1. **Participant registration** — the participant page registers configured
   accounts and authorises their lifecycle stages on chain.
2. **Product registration** — the product page creates a product and mints its
   passport. Product-review status is maintained locally while registration is
   confirmed on chain.
3. **Event registration** — the events page records one lifecycle event at a
   time. The authorised participant submits activity data, emission factors,
   methodology, schema version, and an evidence hash.
4. **On-chain calculation** — the event registry calculates signed CO2e. The
   carbon-token contract mints positive carbon values and burns negative values.
5. **Audit and governance** — users can inspect correction records, submit or
   review corrections, configure thresholds, raise or resolve escalations, and
   view the resulting history. Governance records are read from contract state
   and events.
6. **Evaluation** — the Results page runs the Tampering, Aggregation, and
   Performance studies. Results are cached locally for persistence and gating.
7. **Reset** — the application reset control clears localStorage and starts the
   workflow again without changing on-chain records.

## State and persistence

Blockchain state is authoritative for participants, products, emission events,
corrections, escalations, thresholds, token balances, and governance actions.
localStorage stores UI selections, workflow caches, product-review state, local
resolution comments, and evaluation results. Clearing localStorage does not
remove deployed contracts or blockchain data.
