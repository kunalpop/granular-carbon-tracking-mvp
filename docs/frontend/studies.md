# Browser study tabs

The Results page exposes browser-side Tampering, Aggregation, and Performance
studies. These are not the original evaluation drivers in
`evaluation/study-a-tampering`, `evaluation/study-b-aggregation`, and
`evaluation/study-c-performance`. They do not submit transactions or change
chain state. Tampering and Aggregation fetch event records for the currently
selected product; Performance uses committed JSON benchmark results.

## Study A: Tampering

`studyTampering.ts` returns six conceptual outcomes: naive and competent
variants of value lowering, event deletion, and back-dating. Its input is the
selected product's stage ID, on-chain CO2e, and event hash, read by
`Results.tsx`. It compares these values with the static stage metadata and
reports control completeness, formula mismatch, or hash presence.

This browser calculation does not mutate a chain event, recompute a chain,
verify the contract's `verifyChain` result, or perform a real timestamp attack.
Competent-attack outcomes are scenario assumptions, not an executed attack.

## Study B: Aggregation

`studyAggregation.ts` produces nine checks from the selected product's fetched
events and `simulation/emission-factors.json`: five checks cover totals,
per-stage expected values, hash presence, stage-ID traceability, and
completeness; four additional browser-side fault checks report on missing,
altered, or inconsistent data.

The browser implementation does not call `AggregationContract`, compare the
on-chain token balance, or actually inject each fault into a separate product.
The fault-check outcomes are local checks/assumptions and should not be
interpreted as the full contract-level Study B experiment.

## Study C: Performance

`studyPerformance.ts` imports
`evaluation/study-c-performance/results/results-4-validators.json` and
`results-7-validators.json`. It calculates throughput and average-latency
percentage changes from those committed results. The UI displays each
configuration's TPS and average latency plus the average-latency change.

The browser does not run the Docker/Hardhat benchmark driver.

## Persistence

Each completed result is serialized to `localStorage`; the results survive
refreshes in the same browser profile. The sidebar reset control is enabled
after all three results exist. Clearing browser storage removes these results
but leaves chain state and benchmark files untouched.

---

[Frontend Page](../../README.md#frontend) · [Project Page](../../README.md)
