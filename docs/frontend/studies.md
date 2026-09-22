# Study Tabs

## Study A: Tampering

`studyTampering.ts` runs six browser-safe scenarios: naive and competent value
lowering, event deletion, and back-dating. It evaluates completeness, expected
CO2e, and event-hash presence using the cached frontend events. The right card
shows control status and detected/undetected scenario counts.

## Study B: Aggregation

`studyAggregation.ts` checks independent totals, per-stage agreement, event
hashes, traceability, and lifecycle completeness. It also reports browser-safe
fault checks for missing events, inconsistent totals, removed events, and
altered values. The right card shows the number of checks passed.

## Study C: Performance

`studyPerformance.ts` loads the committed four-validator and seven-validator
benchmark JSON files. The right card displays TPS in `tx/s`, average latency in
`ms`, and the latency percentage change. The browser does not run the original
Docker/Hardhat load driver.

Each study has visible idle, running, and completed labels. Results are stored
in localStorage and survive page refreshes.
