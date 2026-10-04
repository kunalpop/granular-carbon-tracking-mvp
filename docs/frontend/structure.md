# Repository and Frontend Structure

The repository is organised into smart contracts, the React frontend, network
configuration, evaluation assets, and project documentation.

```text
.
├── contracts/
│   ├── AggregationContract.sol
│   ├── CarbonToken.sol
│   ├── ConsortiumMultisig.sol
│   ├── EmissionEventRegistry.sol
│   ├── GovernanceModule.sol
│   ├── OntologyRegistry.sol
│   ├── ParticipantRegistry.sol
│   └── mocks/
│       ├── GovernanceModuleV2.sol
│       └── Imports.sol
├── frontend/
│   ├── public/
│   ├── src/
│   ├── dist/
│   └── package.json
├── network/
│   ├── accounts.json
│   ├── docker-compose.yml
│   ├── genesis.json
│   ├── permissions_config.toml
│   ├── qbftConfigFile.json
│   ├── network7/
│   └── nodes/
├── simulation/
│   ├── emission-factors.json
│   ├── evidence/
│   ├── schema/
│   ├── stages/
│   ├── synthetic/
│   └── output/
├── evaluation/
│   ├── results/
│   ├── study-a-tampering/
│   ├── study-b-aggregation/
│   └── study-c-performance/
├── artifacts/
├── typechain-types/
├── audit/
├── baselines/
├── data/
├── analysis/
├── dissertation-results/
├── test/
└── docs/frontend/
```

## Frontend source structure

```text
frontend/src/
├── App.css
├── App.tsx
├── index.css
├── main.tsx
├── assets/
│   ├── hero.png
│   ├── react.svg
│   └── vite.svg
├── components/
│   ├── audit/
│   │   ├── AccountControl.tsx
│   │   ├── Audit.tsx
│   │   ├── AuditHistory.tsx
│   │   ├── Corrections.tsx
│   │   └── submitCorrection.ts
│   ├── events/
│   │   ├── Events.tsx
│   │   └── registerEmissionEvent.ts
│   ├── governance/
│   │   ├── Governance.tsx
│   │   └── Voting.tsx
│   ├── participants/
│   │   ├── Participants.tsx
│   │   ├── getRegisteredParticipants.ts
│   │   └── registerParticipants.ts
│   ├── product/
│   │   ├── Product.tsx
│   │   ├── mintProduct.ts
│   │   └── registerProduct.ts
│   └── results/
│       ├── Results.tsx
│       ├── studyAggregation.ts
│       ├── studyPerformance.ts
│       └── studyTampering.ts
├── hooks/
│   └── useContracts.ts
├── services/
│   ├── contractAddresses.ts
│   ├── controlContracts.ts
│   ├── emissionFactors.ts
│   ├── getParticipants.ts
│   ├── getRegisteredProducts.ts
│   ├── getSigner.ts
│   ├── getTypes.ts
│   ├── networkConfig.ts
│   └── useContracts.ts
└── shared/
    ├── Button.tsx
    ├── Escalation.tsx
    └── Stage.tsx
```

## Frontend responsibilities

- `App.tsx` coordinates routes, account-based navigation, product selection,
  workflow gating, and reset behavior.
- `components/participants` handles participant registration and permissions.
- `components/product` handles product review, product registration, and
  passport minting.
- `components/events` records the selected product's sequential lifecycle
  events.
- `components/audit` provides audit history, account control, and correction
  submission views.
- `components/governance` manages thresholds, escalations, governance history,
  and correction voting.
- `components/results` runs the Tampering, Aggregation, and Performance studies.
- `hooks` and `services` provide contract factories, network configuration,
  signers, addresses, lifecycle metadata, and chain-data readers.
- `shared` contains reusable buttons, stage cards, and escalation controls.

## Documentation structure

```text
docs/frontend/
├── README.md
├── overview.md
├── pages.md
├── components.md
├── hooks.md
├── data.md
├── implementation.md
├── studies.md
└── structure.md
```

There is no `simulation` component folder in the current frontend source. The
simulation data directory remains the source of lifecycle factors, schema, and
supporting evidence used by the frontend and contracts.
