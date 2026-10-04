# Data

This document summarises the on-chain state, frontend configuration, and browser cache used by the application. On-chain contract state remains the source of truth; localStorage is only UI and workflow state.

## On-chain data

### Participant registry

Source: `contracts/ParticipantRegistry.sol`

- Participant wallet address
- Organisation name and role
- Active/inactive status
- Registration timestamp
- Authorised lifecycle stages, from stage 1 to stage 10

Emits registration, activation, deactivation, stage-authorisation, and stage-revocation events. `Participants.tsx` and the helper files use this data to register accounts and verify permissions.

### Product and emission-event registry

Source: `contracts/EmissionEventRegistry.sol`

Each product stores:

- Product ID
- Product description
- Creator address
- Creation timestamp
- Existence flag

Each append-only emission event stores:

- Product ID and lifecycle stage ID
- Authorised actor address
- Activity data at 1,000x fixed-point scale
- Activity unit such as `kWh`, `tkm`, or `kg`
- Emission factor at 1,000x fixed-point scale
- Emission-factor source
- Signed CO2e in grams, calculated on chain
- Methodology or reporting standard
- Evidence-file hash
- Previous event hash
- Block timestamp
- Ontology schema version
- Event hash

Positive CO2e values represent carbon minting and negative values represent carbon burning. The previous-event and event hashes form a tamper-evident chain. Each event also has an audit status: `Unaudited`, `Pending`, or `Audited`. The frontend reads these values using `eventAt`, `getEvents`, `eventCount`, and `verifyChain`, and reads corresponding contract events for history and audit views.

### Carbon token data

Source: `contracts/CarbonToken.sol`

The ERC-1155 token contract stores:

- Passport-token existence for each product
- Carbon-credit balances
- Total carbon grams minted per product
- Total carbon grams burned per product
- Net carbon balance per product

It emits passport-mint, carbon-mint, and carbon-burn events. Passport IDs and carbon IDs are derived from the product ID.

### Governance data

Source: `contracts/GovernanceModule.sol`

Correction records contain:

- Product ID and original event index
- Original event hash
- Corrected activity data
- Corrected emission factor
- Recalculated corrected CO2e
- Correction reason
- Supporting evidence hash
- Correcting account
- Timestamp
- Previous correction ID when superseding an earlier correction

The module stores the latest correction per event and whether a correction task was discarded.

Escalation records contain:

- Product ID and event index
- Event CO2e
- Threshold used, or zero for manual escalation
- Escalation reason
- Raising account
- Timestamp
- Resolved status and resolution timestamp

The module stores stage thresholds in grams and emits correction, escalation, resolution, threshold, and discarded-task events. `Governance.tsx`, `Voting.tsx`, `Corrections.tsx`, and `AuditHistory.tsx` read this data from the chain.

### Aggregation data

Source: `contracts/AggregationContract.sol`

Aggregation is derived from public registry and token state rather than stored as a separate ledger. The contract exposes:

- Product-level total CO2e
- Per-stage CO2e totals
- Presence of events for each of the ten stages
- Product completeness status
- Cross-checks between event totals and net carbon-token totals

### Ontology/schema data

Source: `contracts/OntologyRegistry.sol`

The ontology registry stores versioned schemas with:

- Semantic schema version
- Schema-document hash
- Off-chain schema URI
- Registration timestamp
- Deprecated status
- Current schema version

Emission events store the schema version used when recorded. Schema registration, deprecation, and current-version changes are emitted on chain.

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

It emits transaction-submitted, transaction-voted, and transaction-executed events. These records provide the on-chain approval history for multi-party administrative actions.

## Frontend configuration and derived data

- `frontend/src/services/emissionFactors.ts` defines lifecycle stage names, actor roles, activity units, emission factors, sources, and methodologies used by the event forms and display cards.
- `network/accounts.json` provides the configured demo participant accounts and addresses.
- `frontend/src/services/contractAddresses.ts` and deployment artifacts provide the addresses used to read and write each contract.
- `evaluation/study-c-performance/results/*.json` contains committed benchmark data for the browser Performance Study.
- `studyTampering.ts` and `studyAggregation.ts` derive evaluation results from cached events and lifecycle metadata; these results are not written on chain.

## LocalStorage data

Browser cache is used for UI state, workflow progress, and study results. It is not authoritative; on-chain state and events remain the source of truth for registered participants, products, emission events, corrections, escalations, and governance actions.

- `selected-control-account` — active demo account role used to choose the signer.
- `selected-product-id` — current product ID, or `new` during product creation.
- `registered-actors-cache` — registered participant details, roles, addresses, and assigned stages.
- `registered-product-cache` — registered product ID, description, and OEM address.
- `registered-emission-events-cache` — recorded event stage IDs, CO2e values, and event hashes used for progress and study gating.
- `product-review-status-v2` — product-review state: `draft`, `sent`, or `confirmed`.
- `product-review-data-v2` — serialized product-review details and timestamps.
- `escalation-resolution-comments` — locally entered resolution comments keyed by escalation index.
- `tampering-study-result` — serialized Tampering Study result and scenario outcomes.
- `aggregation-study-result` — serialized Aggregation Study checks and results.
- `performance-study-result` — serialized Performance Study benchmark metrics.
- `evaluation-studies-complete` — completion flag set after all three studies finish; controls visibility of the sidebar reset button.

The application reset control clears localStorage. Clearing the browser cache does not remove or modify any on-chain data.
