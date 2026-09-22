# Hooks, Services, and Shared Components

## Hooks

The current `frontend/src/hooks` folder contains:

```text
frontend/src/hooks/useContracts.ts
```

### `useContracts.ts`

Despite its filename, this file does not define a React hook. It provides
factory functions for creating ethers contract instances connected to the
configured local Besu network.

### Provider

`useContracts.ts` creates a `JsonRpcProvider` using the URL and chain ID from
`frontend/src/services/networkConfig.ts`.

### Contract address configuration

It reads contract addresses from `frontend/src/services/contractAddresses.ts`.
The address mapping includes:

- Participant Registry
- Emission Event Registry
- Carbon Token
- Aggregation Contract
- Ontology Registry
- Consortium Multisig
- Governance Module

### Contract factories

The file exports these factory functions:

- `getParticipantRegistryContract(abi, signer?)`
- `getEmissionEventRegistryContract(abi, signer?)`
- `getCarbonTokenContract(abi, signer?)`
- `getAggregationContract(abi, signer?)`
- `getOntologyRegistryContract(abi, signer?)`
- `getConsortiumMultisigContract(abi, signer?)`
- `getGovernanceModuleContract(abi, signer?)`

Each function receives an ABI and optionally a signer. If no signer is
provided, the contract uses the read-only JSON-RPC provider. When a signer is
provided, the returned contract can submit transactions.

## Services

The hooks and workflow components rely on these files in
`frontend/src/services`:

- `services/networkConfig.ts` for the RPC URL and chain ID.
- `services/contractAddresses.ts` for deployed contract addresses.
- `services/emissionFactors.ts` for the lifecycle factor data imported from
  `simulation/emission-factors.json`.
- `services/getActors.ts` for configured participant names and roles.
- `services/getSigner.ts` for role-based wallets used by registration helpers.
- `services/getTypes.ts` for shared lifecycle stage types.

These service files provide configuration, deployed contract addresses,
emission-factor data, actor names, signer wallets, and shared TypeScript types.

Participant, product, event, and study state is managed inside their page or
study components rather than through custom React hooks.

## Shared Components

The frontend keeps reusable UI components in `frontend/src/shared`:

```text
frontend/src/shared/
  Button.tsx
  Stage.tsx
  StageCard.tsx
```

- `Button.tsx` provides the shared button element with primary and secondary
  variants, standard button props, and a default button type.
- `Stage.tsx` renders one simulation event card, including activity, emission
  factor, schema, owner, CO2e, reporting standard, previous event, recording
  state, threshold status, and its Record Event button.
- `StageCard.tsx` renders a compact lifecycle stage marker with its stage ID,
  name, actor role, and pending or complete state. The current simulation page
  uses `Stage.tsx` for event recording.
