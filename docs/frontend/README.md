# Frontend documentation

This documentation describes the React application in `frontend/src` as it is
currently implemented. The frontend is a local Besu demo console: contract
records are read from and written to the configured chain, while browser
storage keeps selections, the in-progress product review, study outputs, and
the reset gate.

## Contents

- [User guide](guide.md) — role-by-role workflow and product/event lifecycle
- [Pages](pages.md) — routes, page behavior, and access gates
- [Components](components.md) — page and shared component responsibilities
- [Hooks and services](hooks.md) — contract clients, signers, and metadata
- [Data](data.md) — on-chain records and browser storage
- [Implementation](implementation.md) — shell, routing, integrations, and state
- [Studies](studies.md) — what the browser study tabs actually calculate
- [Structure](structure.md) — current source and documentation layout

## Application at a glance

The app lets a user switch among configured demo accounts, register
participants, complete a deployer/OEM product-description review, record
sequential lifecycle events, propose and vote on corrections, review
governance/escalations, and inspect three study tabs.

The implemented routes are `/participants`, `/product`, `/events`, `/results`,
`/governance`, `/voting`, `/escalations`, and `/audit`. Unknown paths redirect
to `/participants`. Access gates and role-specific controls are described in
[Pages](pages.md).

## Source of truth

- Participant, product, event, correction, escalation, threshold, vote, and
  token records are read from the deployed contracts.
- `simulation/emission-factors.json` supplies the frontend's stage metadata and
  default activity/factor values.
- `simulation/deployed-addresses.json` supplies the deployed contract
  addresses; workflow helpers pass function-signature ABIs to ethers.
- `localStorage` is not a replacement for chain state. It stores selected
  account/product, the local product review, escalation comments, study
  outputs, and whether all studies have completed.

The browser study calculations are simplified display/evaluation workflows.
They do not alter chain state or run the original Docker/Hardhat evaluation
drivers. See [Studies](studies.md) for their exact inputs and limitations.

---

[Frontend Page](../../README.md#frontend) · [Project Page](../../README.md)
