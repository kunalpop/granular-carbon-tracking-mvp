# Hooks, Services, and Shared Components

This section documents the reusable contract, data, and UI helpers used by the React frontend.

## Hooks

The active hook helper is:

```text
frontend/src/hooks/useContracts.ts
```

### `useContracts.ts`

This file does not define a React hook in the standard sense, but it does provide the shared ethers contract factory functions used across the app.

The provider created in this file uses the local Besu endpoint `http://127.0.0.1:8545` and the chain ID from `frontend/src/services/networkConfig.ts`. When a factory is called without a signer, it returns a read-only contract bound to the JSON-RPC provider.

### Contract address configuration

The shared contract factories read deployed addresses from `frontend/src/services/contractAddresses.ts`. The address mapping covers:

- Participant Registry
- Emission Event Registry
- Carbon Token
- Aggregation Contract
- Ontology Registry
- Consortium Multisig
- Governance Module

### Contract factories

The file exports these factory helpers:

- `getParticipantRegistryContract(abi, signer?)`
- `getEmissionEventRegistryContract(abi, signer?)`
- `getCarbonTokenContract(abi, signer?)`
- `getAggregationContract(abi, signer?)`
- `getOntologyRegistryContract(abi, signer?)`
- `getConsortiumMultisigContract(abi, signer?)`
- `getGovernanceModuleContract(abi, signer?)`

Each factory accepts an ABI and an optional signer. Without a signer, the contract is read-only; with a signer, it can submit transactions to the corresponding contract.

## Services

The frontend relies on these service files in `frontend/src/services`:

- `networkConfig.ts` provides the RPC URL and chain ID.
- `contractAddresses.ts` provides deployed contract addresses.
- `emissionFactors.ts` provides lifecycle stages, actor roles, activity units, emission factors, sources, and methodologies.
- `getSigner.ts` provides role-based wallets and account-selection helpers.
- `getTypes.ts` provides shared lifecycle stage types.
- `controlContracts.ts` provides contract access for governance controls.
- `useContracts.ts` provides the ABI-backed contract helpers used by workflow code.
- `getParticipants.ts` reads registered participant data.
- `getRegisteredProducts.ts` reads registered product data.

Participant, product, event, audit, governance, and study state are managed by page components and workflow helpers rather than custom React hooks.

## Shared components

The reusable UI components live in `frontend/src/shared`:

```text
frontend/src/shared/
  Button.tsx
  Escalation.tsx
  Stage.tsx
```

- `Button.tsx` provides primary and secondary button variants, shared button props, and a default button type.
- `Escalation.tsx` renders escalation details, comments, and resolution controls.
- `Stage.tsx` renders an emission-event card with activity, emission factor, schema, owner, CO2e, reporting standard, previous event, audit status, threshold status, and record or discard controls.
