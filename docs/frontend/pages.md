# Pages and routes

`App.tsx` defines the routes and returns unknown paths to `/participants`.
Sidebar links are also conditionally shown, but route access is determined by
the gates below.

| Route | Access and behavior |
| --- | --- |
| `/participants` | Always routable. The OEM can upload supplier/role and emission-factor JSON to IPFS-backed document storage. The deployer reviews the resulting stages and can register participants. Only the deployer can register them. |
| `/product` | Requires participant registration. The deployer/OEM complete the description review; the deployer creates the product and mints its passport after OEM confirmation. |
| `/events` | Requires participant registration and a selected registered product. Lifecycle actors can record only their assigned stage, in order. Deployer and auditor can inspect existing events only. |
| `/results` | Requires at least 10 events on the selected product. Runs the three browser-side study tabs. |
| `/governance` | Deployer role only. Manages stage thresholds, displays escalation/correction history, and resolves escalations. |
| `/voting` | Route is available to every selected role. Only eligible multisig owners receive correction proposal cards and can vote. |
| `/escalations` | Deployer is redirected away. The auditor can choose any registered event on the selected product; an event owner sees the escalation form only when that account recorded an event on the product and can choose only events recorded by that account. The page lists escalations raised by the active account. |
| `/audit` | Auditor role only. Shows correction tasks and history. |

## Participants

`Participants.tsx` lists the lifecycle stages from `simulation/emission-factors.json`
and the matching configured actor. The deployer registers participants and
stage authorisations through the participant registry. The auditor is a
configured governance account, not a lifecycle-stage actor.

Stage rows are built from the uploaded role map and emission-factor library.
The deployer must verify editable Name, Role, and Stage values before
registration. The registration helper normalises comma-separated stage IDs and
submits the configured participant and stage authorisations; participant data
from the chain and configuration data are refreshed on registration, focus, and
supply-chain configuration changes rather than by a page reload timer.

## Product

`Product.tsx` implements a deployer-to-OEM review (`draft` → `sent` →
`confirmed`) stored in `localStorage`. After confirmation, the deployer action
creates the product and mints its passport. Existing products are loaded from
chain; product selection is persisted as `selected-product-id`.

## Events

`Events.tsx` reads the selected product's event count and event records from
the registry. Participants record their assigned stage only after every
upstream stage has been recorded. Deployer and auditor views are read-only.
Events, audit status, corrections, and thresholds are fetched from chain, not
cached in `localStorage`.

## Audit, voting, governance, and escalations

- `Audit.tsx` provides the auditor's correction-task and history tabs. Its
  escalation view is reused by the `/escalations` route for non-deployer
  accounts.
- `Voting.tsx` decodes correction proposals from multisig transactions and
  filters them for the active eligible owner. The vote state is on chain.
- `Governance.tsx` presents threshold, escalation, and history tabs for the
  deployer role.
- Escalations are chain records; resolution comments are kept locally, while
  the deployer's resolution transaction is recorded on chain.
- Manual escalation submission is limited in the frontend to the auditor and
  owners of recorded events. The event-index dropdown is populated from the
  selected product's on-chain records and filtered by the active account for
  non-auditors; the contract also enforces that the caller is the auditor or
  the selected event's actor.

## Results

`Results.tsx` offers Tampering, Aggregation, and Performance tabs. The first
two read the selected product's events from chain when run. Performance loads
committed benchmark JSON. Each result is persisted in `localStorage`; the
reset control in the sidebar becomes visible after all three results exist.

---

[Frontend Page](../../README.md#frontend) · [Project Page](../../README.md)
