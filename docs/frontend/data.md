# Data

This document describes the data used by each phase of the frontend workflow.

## 1. Participant registration

Source files:

- `frontend/src/services/getActors.ts` — configured participant names and roles.
- `network/accounts.json` — participant wallet accounts and addresses.
- `frontend/src/services/emissionFactors.ts` — lifecycle stages used to assign
  stage permissions.

The participant registration flow builds participant records containing:

- Numeric participant ID
- Organisation name
- Organisation role
- Wallet address
- Assigned lifecycle stage

`registerParticipants.ts` uses the participant registry contract to register
each account and authorise its stages. `Participants.tsx` verifies the result
against the chain before treating registration as complete.

## 2. Product registration

Source files:

- `simulation/emission-factors.json` — reference product and product ID
  configuration.
- `frontend/src/services/emissionFactors.ts` — frontend access to the factor
  configuration.
- `frontend/src/services/getSigner.ts` — signer used for product operations.

The product record contains:

- Product ID
- Product description
- OEM/passport-holder address

`registerProduct.ts` creates the product in the emission event registry and
mints the passport NFT through the carbon token contract. `Product.tsx`
restores and verifies the product before displaying it as registered.

## 3. Event registration

Each lifecycle stage in `simulation/emission-factors.json` provides:

- `stageId` and `name`
- `actorRole`
- `activityValue` and `activityUnit`
- `emissionFactor_gCO2ePerUnit`
- `efSource`
- `methodology`

`registerEmissionEvent.ts` converts activity and emission-factor values to the
contract's x1000 fixed-point representation, hashes compact evidence, and calls
`EmissionEventRegistry.recordEvent`. The contract calculates signed `co2eGrams`
from activity and emission factor. Positive values are mirrored with
`CarbonToken.mintCarbon`; negative values are mirrored with
`CarbonToken.burnCarbon`.

`Simulation.tsx` displays the returned event data in `Stage.tsx` and stores the
stage ID, CO2e in kilograms, and event hash for progress and Results gating.

## 4. Evaluation data

### Tampering study

`studyTampering.ts` uses the cached frontend events to evaluate six browser-safe
scenarios: naive and competent value lowering, event deletion, and back-dating.
It reports control status, findings, and detected/undetected scenario counts.

### Aggregation study

`studyAggregation.ts` uses cached events and the lifecycle factor data to check
independent totals, per-stage totals, event hashes, traceability, completeness,
and fault cases for missing, inconsistent, removed, and altered events.

### Performance study

`studyPerformance.ts` loads the committed benchmark files:

- `evaluation/study-c-performance/results/results-4-validators.json`
- `evaluation/study-c-performance/results/results-7-validators.json`

It compares throughput in transactions per second and average latency in
milliseconds, and calculates the percentage change between configurations.
The browser does not execute the original Docker/Hardhat benchmark driver.

## LocalStorage keys

- `registered-actors-cache` — registered participant details.
- `registered-product-cache` — product ID, description, and OEM address.
- `registered-emission-events-cache` — recorded stage IDs, CO2e values, and
  event hashes.
- `tampering-study-result` — Tampering Study result object.
- `aggregation-study-result` — Aggregation Study result object.
- `performance-study-result` — Performance Study result object.
- `evaluation-studies-complete` — flag indicating all three studies completed.
