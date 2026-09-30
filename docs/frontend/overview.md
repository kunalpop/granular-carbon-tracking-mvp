# Frontend Overview

The frontend is an evidence-oriented React application that guides an operator
through the complete lifecycle of a product carbon passport. It begins by
registering the supply-chain participants and authorising the lifecycle stages
they are allowed to report. It then creates a product record and mints its
passport before allowing lifecycle events to be recorded.

During simulation, the interface presents one lifecycle stage at a time in a
horizontal Stage-card slider. Each stage displays its activity, emission factor,
reporting schema, responsible participant, calculated CO2e, and relationship to
the previous event. The authorised participant signs the event transaction, the
Emission Event Registry stores the event and its evidence hash, and the Carbon
Token contract mirrors positive emissions or negative credits. The next stage
is gated until the current event has been confirmed.

After all ten events are recorded, the Results page becomes available. It
provides three evaluation tabs: a Tampering Study for integrity threats, an
Aggregation Study for totals and fault checks, and a Performance Study for
validator throughput and latency comparisons. Participant, product, event, and
study results are persisted in localStorage so the workflow survives page
navigation and refreshes. Once all studies are complete, the operator can
clear the stored state and start a new simulation.

## User Flow

```text
Participants
    │
    ▼
Deployer registers participants and stage permissions
    │
    ▼
Product review
    │
    ├── Deployer sends product details to OEM
    ├── OEM reviews, edits, and confirms details
    └── Deployer mints the product NFT
    │
    ▼
Select product
    │
    ▼
Record lifecycle events in sequence
    │
    ├── Previous event confirmed on chain? ── No ──► Wait
    │                         │
    │                        Yes
    │                         ▼
    ├── Register the next event
    │                         │
    │                         └── Repeat until all 10 events are recorded
    │
    ▼
Audit and governance
    │
    ├── Auditor reviews event tasks
    │   ├── No correction required ──► Mark event audited
    │   └── Correction required ──► Submit proposal ──► Eligible accounts vote
    │                                      ├── Approved ──► Record correction
    │                                      └── Rejected ──► Mark event audited
    │
    └── Governor configures thresholds
        ├── Threshold exceeded ──► Raise escalation ──► Governor resolves
        └── No threshold breach ──► Continue monitoring
    │
    ▼
Results
    ├── Tampering Study
    ├── Aggregation Study
    └── Performance Study
    │
    ▼
All studies complete
    │
    ▼
Reset browser workflow state and return to Participants
```

### Register Participants

1. The deployer registers the configured supply-chain participants and
   authorises the lifecycle stages each participant can report. This opens
   access to the Product registration page in the website.

### Register the Product

1. The deployer sends the product details to the OEM for review.
2. The OEM reviews, edits, and confirms the product details.
3. The deployer mints the confirmed product as an NFT on chain.

### Multiple Products

1. The deployer selects an existing product or starts a new product
   registration from the product selector.
2. Each product has its own product ID, passport NFT, lifecycle-event chain,
   emission totals, corrections, escalations, and governance history.
3. The deployer completes product review and passport minting for the selected
   product before recording its lifecycle events.
4. Participants record events in the configured sequence for the selected
   product. Events from one product cannot be used to complete another
   product's lifecycle chain.
5. Before recording or reviewing data, confirm that the correct product is
   selected. Product-specific pages, audit records, governance actions, and
   evaluation results are loaded using the selected product ID.
6. Registering or selecting another product does not delete existing on-chain
   data for previously registered products. The reset control clears browser
   state only; it does not remove product records, events, or governance data
   from the blockchain.

### Record Lifecycle Events

**Registration order:** Events must be registered sequentially from the
first lifecycle stage to the last. An event is available for registration only
after the previous event has been recorded and confirmed on the on-chain event
chain.

**Event sequence:** Aluminium Casing (Smelter) → Circuit Board / PCB (PCB
Supplier) → Battery (Battery Maker) → Screen (Screen Supplier) → Assembly (OEM)
→ Packaging (OEM) → International Shipping (Logistics) → Use-phase Electricity
(Use-phase Agent) → Repair or Refurbishment (Repairer) → E-waste Recycling
(Recycler).

1. The responsible participant opens events and selects the current lifecycle
   stage.
2. The participant reviews the activity value, unit, emission factor, source,
   methodology, schema, and evidence information.
3. The participant records the event and confirms the wallet transaction.
4. The system calculates signed CO2e on chain, stores the event and evidence
   hash, and mirrors positive or negative carbon values in the Carbon Token
   contract.
5. The participant waits for confirmation before continuing to the next stage.

### Review Audit Records

1. The auditor selects the Auditor account and opens Audit.
2. The auditor uses event cards in the Tasks section to inspect correction
   proposals and their original event references.
3. The auditor either adds comment and submits the proposal if it needs emission
   correction or rejects it if it does not need emission corrections.
4. The submitted proposals undergo voting and the events corresponding to
   rejected proposals are marked "audtied" without any change.

### Voting on Proposals

**Eligible participants:** Only the governor (or deployer), the auditor, and
the original event owner are eligible to vote on correction proposals.

1. An eligible participant selects Voting tab and reviews the proposal's event
   details and reason.
2. The participant selects Accept or Reject and confirms the wallet transaction.
3. The decision is recorded on chain and the proposal status is updated in the
   frontend.
4. If 2/3 or 3/3 voters approve a proposal, it is recorded on chain as correction
   , and the changes are reflected on the particular event card in the Events tab. The
   event is marked "audited".
5. If 0/3 or 3/3 voters approve a proposal, it is recorded on chain as rejection,
   and the corresponding event is market "audited".
6. The history panel in the Audit tab is updated with voting results.

### Configure Emission Thresholds

**Governer role:** The deployer role is same as the governer role

1. The governor selects the Governor account and opens Governance.
2. The governor sets or updates the maximum allowed absolute CO2e threshold for
   each lifecycle stage.
3. The governor saves the threshold on chain; thresholds are stored in grams.
4. The governor uses the pending and history views to monitor escalations.
5. The governer set thresholds are automatically reflected in the events cards
   for comparison by the auditor.

### Raise and Resolve Escalations

1. An eligible user opens Escalations tab and enters a grievance.
2. The user submits a manual escalation when an issue requires attention.
3. The governor opens the escalation, adds a resolution comment, and selects
   Resolve.
4. The resolution transaction records the resolving account and timestamp on
   chain.
5. Upon resolution, the events is recorded in governance history.

### Run Evaluations

1. The operator opens Results and runs the Tampering Study.
2. The operator runs the Aggregation Study.
3. The operator runs the Performance Study.
4. The studies report their results and save them locally so they persist after
   navigation or refresh. They do not change blockchain data.

### Start a New Workflow

1. After all three studies are complete, the operator selects the reset control.
2. The application clears local selections, cached progress, comments, and
   study results from the browser.
3. The application returns to Participants. Products, events, corrections,
   votes, escalations, and other on-chain records are not deleted or modified.
