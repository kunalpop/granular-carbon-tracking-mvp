# Data

This document describes the data stored on chain, read by the frontend from
contract state and events, and cached in browser localStorage.

## On-chain data

### Participant registry

Source: `contracts/ParticipantRegistry.sol`

The participant registry stores the consortium identities and stage permissions:

- Participant wallet address
- Organisation name
- Organisation role
- Active/inactive status
- Registration timestamp
- Authorised lifecycle stages, from stage 1 to stage 10

The contract emits registration, activation, deactivation, stage-authorisation,
and stage-revocation events. `Participants.tsx` and the participant helper files
use this data to register accounts and verify their permissions.

### Product and emission-event registry

Source: `contracts/EmissionEventRegistry.sol`

Each product contains:

- Product ID
- Product description
- Creator address
- Creation timestamp
- Existence flag

Each product's append-only emission-event chain contains:

- Product ID and lifecycle stage ID
- Authorised actor address
- Activity data, stored with a 1,000x fixed-point scale
- Activity unit, such as `kWh`, `tkm`, or `kg`
- Emission factor, stored with a 1,000x fixed-point scale
- Emission-factor source
- On-chain calculated signed CO2e in grams
- Methodology or reporting standard
- Evidence-file hash
- Previous event hash
- Block timestamp
- Ontology schema version
- Event hash

The contract calculates CO2e on chain. Positive values are mirrored as carbon
minting and negative values as carbon burning. The previous-event and event
hashes create a tamper-evident chain.

The registry also stores per-event audit status: `Unaudited`, `Pending`, or
`Audited`. The frontend reads products and events using `eventAt`, `getEvents`,
`eventCount`, and `verifyChain`, and reads the corresponding contract events for
history and audit views.

### Carbon token data

Source: `contracts/CarbonToken.sol`

The ERC-1155 token contract stores:

- Passport token existence for each product
- Carbon-credit token balances
- Total carbon grams minted per product
- Total carbon grams burned per product
- Net carbon balance per product

The contract emits passport-mint, carbon-mint, and carbon-burn events. Passport
IDs and carbon IDs are derived from the product ID.

### Governance data

Source: `contracts/GovernanceModule.sol`

Correction records contain:

- Product ID and original event index
- Original event hash
- Corrected activity data
- Corrected emission factor
- On-chain recalculated corrected CO2e
- Correction reason
- Supporting evidence hash
- Correcting account
- Timestamp
- Previous correction ID, when superseding an earlier correction

The module also stores the latest correction per event and whether a correction
task was discarded.

Escalation records contain:

- Product ID and event index
- Event CO2e
- Threshold used, or zero for a manual escalation
- Escalation reason
- Raising account
- Timestamp
- Resolved status and resolution timestamp

The module stores stage thresholds in grams and emits correction, escalation,
resolution, threshold, and discarded-task events. `Governance.tsx`, `Voting.tsx`,
`Corrections.tsx`, and `AuditHistory.tsx` read this data from the chain.

### Aggregation data

Source: `contracts/AggregationContract.sol`

Aggregation is calculated from public registry and token state rather than
stored as a separate ledger. The contract exposes:

- Product-level total CO2e
- Per-stage CO2e totals
- Presence of events for each of the ten stages
- Product completeness status
- Cross-checks between event totals and net carbon-token totals

### Ontology/schema data

Source: `contracts/OntologyRegistry.sol`

The ontology registry stores versioned event schemas:

- Semantic schema version
- Schema-document hash
- Off-chain schema URI
- Registration timestamp
- Deprecated status
- Current schema version

Emission events store the schema version used when they were recorded. Schema
registration, deprecation, and current-version changes are emitted on chain.

### Consortium multisig data

Source: `contracts/ConsortiumMultisig.sol`

The multisig stores:

- Owner addresses and owner membership
- Required confirmation count
- Submitted transaction target and calldata
- Optional event owner
- Execution status
- Vote count
- Per-owner vote decisions

It emits transaction-submitted, transaction-voted, and transaction-executed
events. These records provide the on-chain approval history for multi-party
administrative actions.

## Frontend configuration and derived data

- `frontend/src/services/emissionFactors.ts` provides the lifecycle stage names,
  actor roles, activity units, emission factors, sources, and methodologies used
  by the event forms and display cards.
- `network/accounts.json` provides the configured demo participant accounts and
  addresses.
- `frontend/src/services/contractAddresses.ts` and the deployment artifacts
  provide the addresses used to read and write each contract.
- `evaluation/study-c-performance/results/*.json` contains committed benchmark
  data used by the browser Performance Study.
- `studyTampering.ts` and `studyAggregation.ts` derive evaluation results from
  cached events and lifecycle metadata; these results are not written on chain.

## LocalStorage data

The browser cache is used for UI state, workflow progress, and study results.
It is not the authoritative record; on-chain contract state and events are the
source of truth for registered participants, products, emission events,
corrections, escalations, and governance actions.

- `selected-control-account` — active demo account role used to choose the signer.
- `selected-product-id` — currently selected product ID, or `new` during product
  creation.
- `registered-actors-cache` — registered participant details, roles, addresses,
  and assigned stages.
- `registered-product-cache` — registered product ID, description, and OEM
  address.
- `registered-emission-events-cache` — recorded event stage IDs, CO2e values,
  and event hashes used for progress and study gating.
- `product-review-status-v2` — product-review state: `draft`, `sent`, or
  `confirmed`.
- `product-review-data-v2` — serialized product-review details and timestamps.
- `escalation-resolution-comments` — locally entered resolution comments keyed
  by escalation index.
- `tampering-study-result` — serialized Tampering Study result and scenario
  outcomes.
- `aggregation-study-result` — serialized Aggregation Study checks and results.
- `performance-study-result` — serialized Performance Study benchmark metrics.
- `evaluation-studies-complete` — completion flag set after all three studies
  finish; controls visibility of the sidebar reset button.

The application reset control clears localStorage. Clearing the browser cache
does not remove or modify any on-chain data.
