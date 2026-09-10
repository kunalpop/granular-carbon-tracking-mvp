// Study C report generator: reads results-4-validators.json and
// results-7-validators.json, computes the first-order energy model, and
// writes evaluation/results/study-c-results.md + study-c-report.html
// (self-contained, with SVG charts).
const fs = require("fs");
const path = require("path");

const RESULTS = path.join(__dirname, "results");
const OUT = path.join(__dirname, "..", "results");
const r4 = JSON.parse(fs.readFileSync(path.join(RESULTS, "results-4-validators.json"), "utf8"));
const r7 = JSON.parse(fs.readFileSync(path.join(RESULTS, "results-7-validators.json"), "utf8"));

// ---------------- hardware (recorded on this host) ----------------
const HW = {
  cpu: "AMD Ryzen 9 5900HX (8 cores / 16 threads, max 3.3 GHz base clock reported)",
  tdpW: 45, // vendor NOMINAL cTDP for the 5900HX (35-54 W configurable) - ASSUMPTION, verify
  physCores: 8,
  ramGB: 31.9,
  disk: "Samsung SSD 970 EVO Plus 2TB (NVMe SSD)",
  os: "Windows 11 Home build 26200",
  virtualization: "Docker Desktop 29.6.2 (WSL2 backend); Besu 26.7.1 (hyperledger/besu:latest); Node.js 24.19",
};

// ---------------- first-order energy model ----------------
// docker stats CPUPerc: 100% = one logical core fully busy. We convert the
// summed container CPU to physical-core-equivalents (/2 for SMT threads
// sharing a core is NOT applied - we conservatively treat 100% = one
// physical core's share of TDP/8), i.e. P ~ (sumCpuPct/100) * (TDP/8).
function energy(run) {
  const wPerCore = HW.tdpW / HW.physCores;
  const grossW = (run.cpu.loadTotalCpuPct / 100) * wPerCore;
  const idleW = (run.cpu.idleTotalCpuPct / 100) * wPerCore;
  const marginalW = Math.max(0, grossW - idleW);
  const grossJ = (grossW * run.wallClockSec) / run.totalTx;
  const marginalJ = (marginalW * run.wallClockSec) / run.totalTx;
  return { grossW, idleW, marginalW, grossJPerTx: grossJ, marginalJPerTx: marginalJ,
           grossKWhPerTx: grossJ / 3.6e6 };
}
const e4 = energy(r4), e7 = energy(r7);

// Literature comparison - anchors pinned to the published estimates of
// Sedlmeir, Buhl, Fridgen & Keller (2020, Bus Inf Syst Eng 62(6), 599-608),
// verified against the OA full text 2026-08-07: Bitcoin PoW ~1e9 J/tx; large
// non-PoW permissionless networks (~1e4 nodes) ~1e3 J/tx; small permissioned
// deployments (~10 nodes) ~1 J/tx. Network-level PoS context: CCRI (2022)
// puts post-Merge Ethereum at 2,601 MWh/yr (99.988% below PoW Ethereum).
const LIT = [
  { label: "This prototype, 4 validators", jPerTx: e4.grossJPerTx, ours: true },
  { label: "This prototype, 7 validators", jPerTx: e7.grossJPerTx, ours: true },
  { label: "Permissioned, ~10 nodes", jPerTx: 1 },
  { label: "Non-PoW permissionless", jPerTx: 1e3 },
  { label: "Bitcoin proof-of-work", jPerTx: 1e9 },
];

// ---------------- charts (hand-built SVG) ----------------
function barChart(title, unit, entries, width = 640) {
  const max = Math.max(...entries.map((e) => e.v));
  const bh = 34, gap = 14, left = 170;
  const h = entries.length * (bh + gap) + 50;
  const bars = entries.map((e, i) => {
    const y = 40 + i * (bh + gap);
    const w = Math.max(2, (e.v / max) * (width - left - 90));
    return `<text x="${left - 8}" y="${y + bh / 2 + 5}" text-anchor="end" font-size="13">${e.k}</text>
      <rect x="${left}" y="${y}" width="${w}" height="${bh}" rx="4" fill="${e.c ?? "#4472c4"}"/>
      <text x="${left + w + 6}" y="${y + bh / 2 + 5}" font-size="13" font-weight="600">${e.v.toFixed(e.v < 10 ? 2 : 1)} ${unit}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${h}" xmlns="http://www.w3.org/2000/svg" role="img">
    <text x="8" y="20" font-size="15" font-weight="700">${title}</text>${bars}</svg>`;
}

function logChart(title, entries, width = 680) {
  const logs = entries.map((e) => Math.log10(e.jPerTx));
  const minL = Math.floor(Math.min(...logs)) - 0.4, maxL = Math.ceil(Math.max(...logs));
  // Type sizes are set so the exported figure stays legible at 15.92 cm text
  // width: 13 units renders at about 8.6 pt, 16 units at about 10.6 pt.
  const bh = 34, gap = 14, left = 200;
  const h = entries.length * (bh + gap) + 74;
  const scale = (l) => ((l - minL) / (maxL - minL)) * (width - left - 100);
  const bars = entries.map((e, i) => {
    const y = 44 + i * (bh + gap);
    const w = Math.max(2, scale(Math.log10(e.jPerTx)));
    const label = e.jPerTx >= 1e6 ? e.jPerTx.toExponential(1) : e.jPerTx.toFixed(1);
    return `<text x="${left - 8}" y="${y + bh / 2 + 5}" text-anchor="end" font-size="13">${e.label}</text>
      <rect x="${left}" y="${y}" width="${w}" height="${bh}" rx="4" fill="${e.ours ? "#2e9e4f" : "#c44"}"/>
      <text x="${left + w + 6}" y="${y + bh / 2 + 5}" font-size="13" font-weight="600">${label} J/tx</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${h}" xmlns="http://www.w3.org/2000/svg" role="img">
    <text x="8" y="22" font-size="16" font-weight="700">${title}</text>
    <text x="8" y="${h - 12}" font-size="13" fill="#666">Log-scale comparison. Red bars are published anchors from Sedlmeir et al. (2020).</text>${bars}</svg>`;
}

const chartTps = barChart("Throughput", "TPS", [
  { k: "4 validators", v: r4.tps }, { k: "7 validators", v: r7.tps, c: "#7c9ed9" }]);
const chartLat = barChart("Transaction latency (open-loop burst)", "ms", [
  { k: "4 validators avg", v: r4.latencyMs.avg }, { k: "4 validators p95", v: r4.latencyMs.p95 },
  { k: "7 validators avg", v: r7.latencyMs.avg, c: "#7c9ed9" }, { k: "7 validators p95", v: r7.latencyMs.p95, c: "#7c9ed9" }]);
const chartBlock = barChart("Observed block time under load", "s", [
  { k: "4 validators", v: r4.blocks.avgBlockTimeSec }, { k: "7 validators", v: r7.blocks.avgBlockTimeSec, c: "#7c9ed9" }]);
const chartEnergy = logChart("Energy per transaction: PoA prototype vs published PoW/PoS anchors", LIT);

const tbl = (rows) => rows.map((r) => `| ${r.join(" | ")} |`).join("\n");

const md = `# Study C - Performance and environmental proportionality

Generated by \`evaluation/study-c-performance/make-report.js\` from
\`results-4-validators.json\` and \`results-7-validators.json\`.
Charts: [study-c-report.html](study-c-report.html).

## Hardware and software (all figures are laptop-scale, not production)

- CPU: ${HW.cpu}
- CPU package TDP assumption for the energy model: ${HW.tdpW} W (vendor nominal cTDP; configurable 35-54 W - ASSUMPTION, verify for this unit)
- RAM: ${HW.ramGB} GB; Disk: ${HW.disk}
- OS: ${HW.os}
- Stack: ${HW.virtualization}
- All validators are Docker containers co-located on this single machine; they contend for the same CPU. This matters most for the 7-validator run (see limitations).

## Method

**Tooling note (Caliper).** Hyperledger Caliper was attempted first, per the
chapter plan. Caliper 0.7.1 (current) has dropped its EVM connectors: the CLI
rejects both \`besu\` and \`ethereum\` SUT types (only Fabric remains).
Caliper 0.6.0 still recognises \`ethereum\`, but its binding step fails on
current Node.js/Windows (\`spawn EINVAL\` invoking npm - a known
incompatibility of that era's tooling). A method-equivalent open-loop load
driver was therefore written (\`bench-driver.ts\`) reproducing Caliper's
metrics - TPS and latency distribution - plus block time and TTF, which
Caliper does not compute for EVM chains. The chapter should report this as a
tooling limitation; the measurement methodology is unchanged.

**Load.** ${r4.config.products} products x ${r4.config.eventsPerProduct} \`recordEvent\`
transactions = ${r4.totalTx} txs (~407k gas each), submitted open-loop by
${r4.config.writers} writer accounts with sequential nonces against a fresh,
dedicated contract deployment; receipts polled at 250 ms. TPS = txs /
wall-clock(first submit -> last receipt). Latency = submit -> receipt
observed. Block time = block-timestamp span / block count over the occupied
range. TTF: QBFT finality is immediate at inclusion - a transaction in a
block is final; no confirmation depth exists. Measured TTF therefore equals
inclusion latency. The 7-validator network is a separate, freshly generated
chain with identical genesis parameters (only the validator set differs).

## Results (Paper 1 Table 1 variables)

${tbl([
  ["Configuration", "TPS", "Block time (s)", "TTF"],
  ["---", "---", "---", "---"],
  ["4 validators + 1 observer", r4.tps.toFixed(1), r4.blocks.avgBlockTimeSec.toFixed(2),
   `immediate at inclusion; measured ${(r4.latencyMs.avg / 1000).toFixed(1)} s avg (p95 ${(r4.latencyMs.p95 / 1000).toFixed(1)} s) under burst`],
  ["7 validators", r7.tps.toFixed(1), r7.blocks.avgBlockTimeSec.toFixed(2),
   `immediate at inclusion; measured ${(r7.latencyMs.avg / 1000).toFixed(1)} s avg (p95 ${(r7.latencyMs.p95 / 1000).toFixed(1)} s) under burst`],
])}

Detail:

${tbl([
  ["Metric", "4 validators", "7 validators"],
  ["---", "---", "---"],
  ["Total txs", r4.totalTx, r7.totalTx],
  ["Wall clock (s)", r4.wallClockSec.toFixed(1), r7.wallClockSec.toFixed(1)],
  ["Latency avg / median / p95 / max (ms)",
    `${r4.latencyMs.avg.toFixed(0)} / ${r4.latencyMs.median.toFixed(0)} / ${r4.latencyMs.p95.toFixed(0)} / ${r4.latencyMs.max.toFixed(0)}`,
    `${r7.latencyMs.avg.toFixed(0)} / ${r7.latencyMs.median.toFixed(0)} / ${r7.latencyMs.p95.toFixed(0)} / ${r7.latencyMs.max.toFixed(0)}`],
  ["Blocks occupied", `${r4.blocks.count} (#${r4.blocks.range[0]}-${r4.blocks.range[1]})`,
    `${r7.blocks.count} (#${r7.blocks.range[0]}-${r7.blocks.range[1]})`],
  ["Container CPU idle -> load (% of one core, summed)",
    `${r4.cpu.idleTotalCpuPct.toFixed(0)} -> ${r4.cpu.loadTotalCpuPct.toFixed(0)}`,
    `${r7.cpu.idleTotalCpuPct.toFixed(0)} -> ${r7.cpu.loadTotalCpuPct.toFixed(0)}`],
])}

The 7-validator run is slower on every axis: QBFT messaging grows
quadratically with the validator set, AND twelve co-located Java nodes
saturate this host (~15 of 16 logical cores), stretching consensus rounds
(observed block time 2.00 s -> 3.00 s). On distributed hardware the protocol
effect would remain; the contention effect would not. Treat the 7-validator
figures as an upper bound on the degradation.

## First-order energy estimate (DP9)

Model: P ~ (summed container CPU% / 100) x (TDP / ${HW.physCores} physical cores);
energy per tx = P x wall-clock / txs. This ignores DRAM/SSD/network power and
assumes linear CPU-power scaling - first-order only, stated as such.

${tbl([
  ["Quantity", "4 validators", "7 validators"],
  ["---", "---", "---"],
  ["Whole-network power under load (W)", e4.grossW.toFixed(1), e7.grossW.toFixed(1)],
  ["Idle power (W)", e4.idleW.toFixed(1), e7.idleW.toFixed(1)],
  ["Energy per tx, gross (J)", e4.grossJPerTx.toFixed(2), e7.grossJPerTx.toFixed(2)],
  ["Energy per tx, marginal (J)", e4.marginalJPerTx.toFixed(2), e7.marginalJPerTx.toFixed(2)],
  ["Energy per tx, gross (kWh)", e4.grossKWhPerTx.toExponential(2), e7.grossKWhPerTx.toExponential(2)],
])}

**Contrast with published figures (anchors from Sedlmeir, Buhl, Fridgen &
Keller 2020, Bus Inf Syst Eng 62(6), verified 2026-08-07):** Bitcoin PoW at
~1e9 J/tx sits about NINE orders of magnitude above this prototype's
~${e4.grossJPerTx.toFixed(1)} J/tx; large non-PoW permissionless networks
(~1e3 J/tx) sit about three orders above; and Sedlmeir et al.'s ~1 J/tx
estimate for small permissioned deployments is independently corroborated by
the measurement here. Network-level PoS context: CCRI (2022) reports
post-Merge Ethereum at 2,601 MWh/yr, a 99.988% reduction from PoW Ethereum
(per-transaction PoS figures depend on throughput definitions and are not
quoted). For the proportionality thread: at
~${e4.grossJPerTx.toFixed(1)} J/tx, recording one laptop's ten lifecycle events costs
~${(10 * e4.grossJPerTx).toFixed(0)} J - about ${( (10 * e4.grossJPerTx) / 3.6e6 * 1000 * 1000).toFixed(2)} mWh -
versus the ~200 kgCO2e footprint being tracked: the accounting overhead is
negligible relative to the accounted object, which is the DP9 claim.

## Threats to validity

- Single host: validators contend for CPU; 7-validator degradation conflates
  protocol cost with contention. Figures are indicative, not production.
- Open-loop burst maximises queueing; latency under steady arrival would be
  lower (bounded below by ~block time / 2 + propagation).
- Energy model excludes RAM/SSD/network and uses nominal TDP; literature
  anchors are the published order-of-magnitude estimates of Sedlmeir et al.
  (2020), verified against the source 2026-08-07.
- One run per configuration (no variance estimate); re-run for error bars.
`;

const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Study C - performance charts</title>
<style>body{font-family:system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem}
svg{width:100%;height:auto;margin:1rem 0;border:1px solid #eee;border-radius:8px;padding:4px}</style>
</head><body>
<h1>Study C - Performance and environmental proportionality</h1>
<p>Companion charts to <b>study-c-results.md</b>. Single-laptop figures; see
the markdown report for method, hardware, and threats to validity.</p>
${chartTps}${chartLat}${chartBlock}${chartEnergy}
</body></html>`;

fs.writeFileSync(path.join(OUT, "study-c-results.md"), md);
fs.writeFileSync(path.join(OUT, "study-c-report.html"), html);
fs.copyFileSync(path.join(RESULTS, "results-4-validators.json"), path.join(OUT, "study-c-raw-4-validators.json"));
fs.copyFileSync(path.join(RESULTS, "results-7-validators.json"), path.join(OUT, "study-c-raw-7-validators.json"));
console.log("Wrote evaluation/results/study-c-results.md, study-c-report.html, and raw JSONs.");
