# Data

This document summarises the on-chain state, frontend configuration, and
browser storage used by the application. On-chain contract state remains the
source of truth; `localStorage` is only UI and workflow state.

## On-chain data

### Participant registry

Source: `contracts/ParticipantRegistry.sol`

- Participant wallet address
- Organisation name and role
- Active/inactive status
- Registration timestamp
- Authorised lifecycle stages, from stage 1 to stage 10

Emits registration, activation, deactivation, stage-authorisation, and stage-revocation events. `Participants.tsx` and the helper files use this data to register accounts.
The registration helper checks and sets stage authorisations; the page's
registered-participant reader does not verify them.

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
- Evidence hash (the event form hashes a generated JSON payload; it does not
  upload an evidence file)
- Previous event hash
- Block timestamp
- Ontology schema version
- Event hash

Positive CO2e values represent carbon minting and negative values represent
carbon burning. The previous-event and event hashes form a tamper-evident
chain. Each event also has an audit status: `Unaudited`, `Pending`, or
`Audited`. Audit status is separate mutable metadata; it does not alter the
append-only event record or its hash. Only accounts enabled by the registry's
status admin can change it. The frontend reads event records with `eventAt`,
counts them with `eventCount`, and reads `auditStatus`. The current frontend
does not call the registry's `getEvents` or `verifyChain`; the browser
Tampering Study checks hash presence but does not verify the on-chain hash
chain.

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

The correction form currently hashes its entered correction fields and reason
as evidence metadata; it does not upload a supporting file.

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

It emits transaction-submitted, transaction-voted, and transaction-executed
events. These records provide the on-chain approval history for multi-party
administrative actions. A transaction is approved as soon as its required
number of approvals is reached, and rejected once the remaining uncast votes
cannot reach that number; it does not need to wait for every owner to vote.

## Frontend configuration and derived data

- `frontend/src/services/emissionFactors.ts` imports
  `simulation/emission-factors.json`, which defines lifecycle stages, actor
  roles, units, default activities/factors, sources, and methodologies.
- `network/accounts.json` provides configured demo wallets, role names, and
  addresses. It includes lifecycle actors and governance accounts.
- `frontend/src/services/contractAddresses.ts` reads deployed addresses from
  `simulation/deployed-addresses.json`.
- `evaluation/study-c-performance/results/*.json` contains committed benchmark
  data loaded by the browser Performance Study.
- The Results page fetches event records from the selected product's registry
  before running the Tampering and Aggregation browser calculations. They are
  not read from an event localStorage cache and are not written on chain.

## LocalStorage data

Browser `localStorage` is used for selections, the in-progress product review,
escalation comments, study results, and the study-completion reset gate. It is
not authoritative; on-chain state and events remain the source of truth for
registered participants, products, emission events, corrections, escalations,
and governance actions.

- `selected-control-account` — active demo account role used to choose the signer.
- `selected-product-id` — current product ID, or `new` during product creation.
- `product-review-status-v2` — product-review state: `draft`, `sent`, or `confirmed`.
- `product-review-data-v2` — serialized product-review status and deployer/OEM descriptions; it contains no timestamps.
- `escalation-resolution-comments` — locally entered resolution comments keyed by escalation index.
- `tampering-study-result` — serialized Tampering Study result and scenario outcomes.
- `aggregation-study-result` — serialized Aggregation Study checks and results.
- `performance-study-result` — serialized Performance Study benchmark metrics.
- `evaluation-studies-complete` — completion flag set after all three studies finish; controls visibility of the sidebar reset button.

Participant, product, and event data are fetched from contracts rather than
cached under separate actor, product, or event keys. The application reset
control calls `localStorage.clear()`, clearing all browser storage for the
origin. Clearing browser storage does not remove or modify any on-chain data.

---

[Frontend Page](../../README.md#frontend) · [Project Page](../../README.md)
