# Hooks, Services, and Shared Components

This section documents the reusable contract, data, and UI helpers used by the React frontend.

## Hooks

The `hooks` directory contains one contract-client helper:

```text
frontend/src/hooks/useContracts.ts
```

### `useContracts.ts`

This file does not define a React hook in the standard sense. It provides ethers
contract factory functions used by workflow helpers.

The provider uses `http://127.0.0.1:8545` and the chain ID from
`frontend/src/services/networkConfig.ts`. When a factory is called without a
signer, it returns a contract bound to the JSON-RPC provider.

### Contract address configuration

The shared contract factories read deployed addresses from
`frontend/src/services/contractAddresses.ts`, which loads
`simulation/deployed-addresses.json`. The address mapping covers:

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

Each factory accepts an ABI and an optional signer. Without a signer, calls use
the JSON-RPC provider; with a signer, the contract can submit transactions.
ABIs are provided by workflow modules as function-signature arrays rather than
loaded from generated Hardhat artifacts.

## Services

The frontend relies on these service files in `frontend/src/services`:

- `networkConfig.ts` provides the RPC URL and chain ID.
- `contractAddresses.ts` provides deployed contract addresses.
- `emissionFactors.ts` imports lifecycle metadata from
  `simulation/emission-factors.json`.
- `getSigner.ts` provides wallets for the roles in `network/accounts.json` and
  account-selection helpers.
- `getTypes.ts` provides shared lifecycle stage types.
- `controlContracts.ts` provides contract access for governance controls.
- `useContracts.ts` provides the ABI-backed contract helpers used by workflow
  code.
- `getParticipants.ts` provides configured actor display names.
- `getRegisteredProducts.ts` reads registered product data.
- `supplyChainIpfs.ts` loads cached/fresh supplier maps and emission-factor JSON through the document API and reads uploaded document metadata.
- Storage helpers under `frontend/src/storage` encrypt files, upload them to Pinata/IPFS, record proofs, retrieve them, and verify hashes/evidence.

Participant, product, event, audit, governance, and study state are managed by
page components and workflow helpers rather than custom React hooks. The
similarly named `services/useContracts.ts` contains contract ABI fragments and
control-signer helpers; it is distinct from the contract factories in
`hooks/useContracts.ts`. Participant registry reads are implemented in
`components/participants/getRegisteredParticipants.ts`.

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

---

[Frontend Page](../../README.md#frontend) · [Project Page](../../README.md)
