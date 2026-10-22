# Pages and routes

`App.tsx` defines the routes and returns unknown paths to `/participants`.
Sidebar links are also conditionally shown, but route access is determined by
the gates below.

| Route | Access and behavior |
| --- | --- |
| `/participants` | Always routable. Shows configured lifecycle participants; only the deployer can register them. The page checks all configured accounts, but the app's separate workflow-ready gate currently checks only whether the OEM is registered. |
| `/product` | Requires participant registration. The deployer/OEM complete the description review; the deployer creates the product and mints its passport after OEM confirmation. |
| `/events` | Requires participant registration and a selected registered product. Lifecycle actors can record only their assigned stage, in order. Deployer and auditor can inspect existing events only. |
| `/results` | Requires at least 10 events on the selected product. Runs the three browser-side study tabs. |
| `/governance` | Deployer role only. Manages stage thresholds, displays escalation/correction history, and resolves escalations. |
| `/voting` | Route is available to every selected role. Only eligible multisig owners receive correction proposal cards and can vote. |
| `/escalations` | Route is available to every role except deployer. The contract accepts manual escalation submissions only from the auditor or the actor who recorded that event; the page lists escalations raised by the active account. |
| `/audit` | Auditor role only. Shows correction tasks and history. |

## Participants

`Participants.tsx` lists the lifecycle stages from `simulation/emission-factors.json`
and the matching configured actor. The deployer registers participants and
stage authorisations through the participant registry. The auditor is a
configured governance account, not a lifecycle-stage actor.

There is a current setup mismatch: the default authorisations are generated
from each account's position in the actor list rather than all matching stage
IDs in the stage metadata. For example, OEM defaults to stage 5 even though it
owns stages 5 and 6; later actors are shifted by one, and the auditor defaults
to stage 10. The page's stage rows are based on metadata and may not reflect
the authorisations the registration helper submits.

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
- The `/escalations` route is broader than the contract's manual-escalation
  permission: a submission succeeds only for the auditor or the actor
  associated with the selected event.

## Results

`Results.tsx` offers Tampering, Aggregation, and Performance tabs. The first
two read the selected product's events from chain when run. Performance loads
committed benchmark JSON. Each result is persisted in `localStorage`; the
reset control in the sidebar becomes visible after all three results exist.

---

[Frontend Page](../../README.md#frontend) · [Project Page](../../README.md)
