# Evaluation summary — what the three studies showed

*One-page plain-English summary for the evaluation chapter. Detailed methods,
full tables, and raw data: `evaluation/results/` and the tables in this
folder. All emission factors in the prototype are clearly-tagged placeholders
("SOURCE NEEDED"); none of the integrity, aggregation, or performance results
below depends on the factor values.*

## Study A — Tamper-evidence (the auditability claim)

Three systems held byte-identical emission records: a spreadsheet, a SQLite
database, and the permissioned Besu ledger. An insider applied three attacks
to each — lowering a past value, deleting an event, back-dating an event — at
two skill levels, since the file-based systems carry the same hash chains as
the ledger and a competent insider can recompute them.

**Result.** Every attack succeeded silently on the spreadsheet and the
database. A naive attacker is caught *if* someone re-runs integrity checks —
but nothing triggers that, and no attack is attributable to a person. A
competent attacker who rewrites the files' internal hashes produced forgeries
that pass every file-internal check: **hash chains without an external trust
anchor provide no protection against insiders**. On the ledger, no silent
alteration path exists at all: there is no update or delete interface,
unauthorised correction attempts were rejected in ~15 ms with the sender
identified, timestamps cannot be supplied by the caller, and every accepted
write is key-signed. The residual attack — rewriting finalised blocks on 3 of
4 validators simultaneously — is a Byzantine-quorum compromise outside the
insider threat model; single-node tampering is exposed by cross-node
comparison in under a second.

**Limitations.** Node-level storage tampering was argued from the BFT design
and demonstrated by cross-node comparison, not physically performed. The
completeness heuristic detects whole-stage deletion only. Latencies are
host-specific.

## Study B — Aggregation correctness and fault handling

**Result.** An off-chain recomputation of every product's footprint agreed
with the on-chain aggregate to the gram, on every product and every lifecycle
stage; every event traced to a named, registered actor. Injected faults were
flagged, never silently absorbed: a product missing stage 10 was reported
incomplete (naming the missing stage); a deliberate mismatch between the
token record and the event record raised a reconciliation error showing both
figures; an auditor fed doctored local data detected a removed event at the
exact break point and an altered value twice over (hash violation and
activity×factor violation). At no point did the system return a total
without the flag that disqualifies it.

**Limitations.** Fault-injection products remain on the ledger permanently
(by design) and are labelled as artefacts. Completeness is a business rule
(10 stages), not cryptography.

## Study C — Performance and environmental proportionality

**Result.** On a single laptop (AMD Ryzen 9 5900HX, 32 GB RAM — full spec in
the report), the 4-validator network sustained **40.2 TPS** of real emission
events (~407k gas each) with a **2.00 s block time** and **immediate
deterministic finality** (a QBFT transaction is final at inclusion; no
confirmation depth exists). With 7 validators: 21.9 TPS and 3.00 s blocks —
degradation reflecting both QBFT's quadratic messaging and CPU contention
among 12 co-located nodes, so it is an upper bound on the protocol effect.
A first-order energy model (measured container CPU × nominal TDP share) puts
the whole network at ~23 W under load, ≈ **0.6 J per transaction**: recording
a laptop's complete ten-stage carbon history costs a few joules against the
~hundreds of kg CO₂e being tracked — the environmental-proportionality claim
(DP9) with an empirical anchor. Published PoW figures sit ~8–9 orders of
magnitude higher; post-Merge PoS ~3 orders higher (order-of-magnitude
anchors; verify exact figures against Sedlmeir et al. 2020, Stoll et al.
2021, and current CCRI estimates before quoting).

**Limitations.** Hyperledger Caliper could not be used: the current release
has dropped EVM support and the legacy release fails on current
Node.js/Windows; a method-equivalent open-loop driver was used instead (same
metrics, documented in the report). Single-host figures are indicative, not
production benchmarks; one run per configuration (no variance estimate); the
energy model excludes RAM/SSD/network draw.

## One-sentence overall claim

Across identical data, the conventional systems allowed silent, unattributable
falsification while the permissioned ledger made every recorded fact
verifiable, every change visible and attributed, every total independently
recomputable, and did so at negligible energy cost — with the honest converse
that the ledger cannot vouch for data being *true at entry* (the oracle
boundary), only *unaltered after entry*.
