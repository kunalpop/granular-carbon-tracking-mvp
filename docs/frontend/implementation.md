# Implementation

## Application shell and entry point

`frontend/src/main.tsx` creates the React root, wraps the application in
`React.StrictMode`, `BrowserRouter`, and an error boundary, and imports the
global stylesheet. `App.tsx` renders the header, product selector, Besu
network indicator, account selector, sidebar, workflow navigation, and routed
page content. The header indicator checks `eth_chainId` at the configured RPC
endpoint when the application loads. It displays green only when the RPC
response matches the configured chain ID, and red when the endpoint is
unavailable, returns an error, or reports a different chain. Workflow pages
refresh from their mounted state, account/product events, and explicit user
actions rather than continuously reloading the Participants page.

## Routes and workflow gates

The route table is in `App.tsx`:

- `/participants` is always available.
- `/product` requires the app's participant-ready flag. That flag currently
  checks whether the OEM is registered; the Participants page separately
  checks all configured accounts before displaying them as registered.
- `/events` requires the participant-ready flag and a registered selected
  product.
- `/results` requires at least ten events on the selected product.
- `/governance` is restricted to the deployer role.
- `/audit` is restricted to the auditor role.
- `/voting` is routable for any role; `Voting.tsx` filters correction proposals
  to eligible multisig owners.
- `/escalations` redirects the deployer away. The auditor can manually escalate
  any registered event for the selected product; an event owner sees the form
  only if that account recorded an event for the product, and the event
  dropdown is limited to records from that account. The contract independently
  enforces that the submitter is the auditor or selected event's actor. The
  page lists escalations raised by the active account.
- Any other path redirects to `/participants`.

Sidebar visibility follows the selected role and workflow state, but page
components enforce or apply their own action-level checks as well.

## Signers, provider, and contracts

`services/supplyChainIpfs.ts` retrieves supply-chain JSON from `/api/documents/by-name/.../plain`, with direct fresh reads and a browser local-storage fallback. `services/getSigner.ts` loads demo accounts from `network/accounts.json`,
provides a wallet for each configured role, and stores the selected role under
`selected-control-account`. The account selector dispatches
`control-account-change` so components can refresh their role state.

The RPC endpoint is `http://127.0.0.1:8545` and the configured chain ID is
2026 (`services/networkConfig.ts`). `services/contractAddresses.ts` reads
deployed addresses from `simulation/deployed-addresses.json`.
`hooks/useContracts.ts` and `services/useContracts.ts` create ethers contracts
from those addresses. Workflow files supply function-signature ABI fragments
in TypeScript; the frontend does not import generated Hardhat artifacts.

## Workflow behavior

1. `Participants.tsx` reads registration state from `ParticipantRegistry` and,
   as deployer, registers configured actor accounts and stage permissions.
2. `Product.tsx` holds the deployer/OEM description review in browser storage.
   After confirmation, `registerProduct.ts` creates the product using the OEM
   wallet and mints the passport using the deployer wallet.
3. `Events.tsx` fetches records for the selected product. A lifecycle actor
   writes its assigned event in sequence via `registerEmissionEvent.ts`;
   positive/negative chain-calculated CO2e is mirrored to the carbon token.
4. `Audit.tsx`, `Corrections.tsx`, `Voting.tsx`, and `Governance.tsx` read and
   submit correction, vote, threshold, and escalation operations through the
   registry, governance module, and consortium multisig.
5. `Results.tsx` runs the browser-compatible study functions or loads
   committed benchmark JSON. Study results and the completion flag are saved
   locally.

## State and reset behavior

The chain is authoritative for participant registrations and authorisations,
products, passports, events, correction proposals/records, votes, thresholds,
escalations, and token balances. Browser storage contains account/product
selection, local product-review fields, escalation resolution comments, study
results, and the all-studies-complete flag. It does not cache registered
participants, product records, or lifecycle events.

After all three study results exist, the sidebar exposes **Start New
Simulation**. It calls `localStorage.clear()` and navigates to
`/participants`. This resets browser-side workflow state only; it does not
remove chain data.

---

[Frontend Page](../../README.md#frontend) · [Project Page](../../README.md)
