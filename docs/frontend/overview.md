# Frontend Overview

This frontend is a role-aware React workflow for tracking a product carbon footprint from participant registration through lifecycle recording, governance review, and evaluation studies.

The user flow is:

1. Register the configured participants and their allowed lifecycle stages.
2. Select or create a product and mint its passport.
3. Record the product lifecycle events in order.
4. Review audit, voting, threshold, and escalation state.
5. Run the Tampering, Aggregation, and Performance studies.
6. Clear local browser state to start a new simulation.

## Application flow

Use the account switcher in the top bar to select a role before you start each workflow step.

```text
Deployer / Governance
  -> Register participants and assign lifecycle roles
  -> Select or create the product and mint the passport
Lifecycle actors
  -> smelter, pcbSupplier, batteryMaker, screenSupplier, oem,
     logistics, usePhaseAgent, repairer, recycler
  -> Record their assigned lifecycle events in sequence
Auditor
  -> Review correction and escalation history
Eligible voters
  -> Accept or reject correction proposals
Deployer / Governance
  -> Review thresholds and resolve escalations
All roles
  -> Open Results after all 10 stages are complete
  -> Reset the browser state when the study workflow is complete
```

## Select Product

1. Open the product selector in the top bar of the app.
2. If you want to continue an existing product, choose it from the dropdown list of registered products.
3. If you want to start a new lifecycle, select `New Product` from the same dropdown.
4. After selecting `New Product`, continue to the Product page to enter the product details and mint the passport.
5. Once a product is selected, the app stores the product ID in localStorage and enables the relevant workflow pages.
6. The selected product is used for all subsequent event recording, audit, governance, and evaluation actions.

## Product and event flow

- The deployer sets up the participants and chooses the active product.
- The OEM and lifecycle actors operate the product and event workflow.
- The selected product is tracked with a product ID stored in localStorage.
- Lifecycle events must be recorded sequentially by the correct role for each stage.
- Each event stores activity, factor, method, schema version, evidence hash, and previous event linkage.
- CO2e is calculated on chain and positive/negative balances are mirrored through the carbon token.
- Once all 10 stages are recorded, the Results page becomes available.

## Governance and review flow

- The auditor reviews correction and escalation history.
- Eligible accounts, including the auditor and original event owner, can vote on correction proposals.
- The deployer manages stage thresholds and governance state.
- Any non-deployer role may raise an escalation when a lifecycle record or threshold issue requires attention.
- The deployer or governor resolves escalations and records the outcome on chain.

## Results flow

The Results page runs three browser-safe studies and is intended for the full product workflow once all stages are complete:

- Tampering Study: integrity-threat checks against cached event data.
- Aggregation Study: totals, traceability, completeness, and fault checks.
- Performance Study: benchmark throughput and latency comparisons.

All study outputs are stored in localStorage. They do not modify on-chain state.

## Reset flow

When all studies are marked complete, the sidebar reset control clears local browser state and returns the app to the participant workflow. On-chain records remain intact. The deployer or operator can then start a fresh simulation with a different product or role selection.
