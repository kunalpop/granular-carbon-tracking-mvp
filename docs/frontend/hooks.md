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

`useContracts.ts` creates one `JsonRpcProvider` using the local Besu endpoint
`http://127.0.0.1:8545` and the chain ID from
`frontend/src/services/networkConfig.ts`. This provider is used when a factory
is called without a signer.

### Contract address configuration

The shared contract factory reads deployed addresses from
`frontend/src/services/contractAddresses.ts`. The address mapping includes:

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

Each factory receives an ABI and optionally a signer. Without a signer, the
returned ethers contract is read-only and uses the JSON-RPC provider. With a
signer, it can submit transactions to the corresponding contract.

## Services

The hooks and workflow components rely on these files in
`frontend/src/services`:

- `networkConfig.ts` provides the RPC URL and chain ID.
- `contractAddresses.ts` provides deployed contract addresses.
- `emissionFactors.ts` provides lifecycle stages, actor roles, activity units,
  emission factors, sources, and methodologies.
- `getSigner.ts` provides role-based wallets and account-selection helpers.
- `getTypes.ts` provides shared lifecycle stage types.
- `controlContracts.ts` provides contract access used by governance controls.
- `useContracts.ts` provides the service-level contract factory used by some
  workflow helpers.
- `getParticipants.ts` reads registered participant data.
- `getRegisteredProducts.ts` reads registered product data.

Participant, product, event, audit, governance, and study state is managed by
page components and workflow helpers rather than custom React hooks.

## Shared components

The frontend keeps reusable UI components in `frontend/src/shared`:

```text
frontend/src/shared/
  Button.tsx
  Escalation.tsx
  Stage.tsx
```

- `Button.tsx` provides primary and secondary button variants, standard button
  props, and a default button type.
- `Escalation.tsx` renders escalation details, comments, and resolution
  controls.
- `Stage.tsx` renders an emission-event card with activity, emission factor,
  schema, owner, CO2e, reporting standard, previous event, audit status,
  threshold status, and record or discard controls.
