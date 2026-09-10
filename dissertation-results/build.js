// Rebuilds the dissertation-ready tables from the raw study outputs in
// evaluation/results/. Run after re-running any study (e.g. once real
// emission factors replace the placeholders):  npm run results:build
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "evaluation", "results");
const OUT = __dirname;

const read = (f) => JSON.parse(fs.readFileSync(path.join(SRC, f), "utf8"));
const A = read("study-a-results.json");
const B = read("study-b-results.json");
const C4 = read("study-c-raw-4-validators.json");
const C7 = read("study-c-raw-7-validators.json");

const csvEsc = (v) => (/[",\r\n]/.test(String(v)) ? `"${String(v).replaceAll(`"`, `""`)}"` : String(v));
function writeTable(name, header, rows) {
  const md = [
    `| ${header.join(" | ")} |`,
    `|${header.map(() => "---").join("|")}|`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
  fs.writeFileSync(path.join(OUT, `${name}.md`), md + "\n");
  fs.writeFileSync(path.join(OUT, `${name}.csv`),
    [header, ...rows].map((r) => r.map(csvEsc).join(",")).join("\r\n") + "\r\n");
  return md;
}

// ---------------- Study A ----------------
writeTable("table-study-a",
  ["System", "Threat", "Attacker level", "Alteration possible?", "Detected?", "Provable + culprit identified?", "Time to detect"],
  A.outcomes.map((o) => [o.system, o.threat, o.level, o.possible, o.detected, o.attributed, o.timeToDetect]));

// Condensed headline matrix (one row per system x threat, strongest attacker).
const strongest = A.outcomes.filter((o) => o.level !== "naive");
writeTable("table-study-a-headline",
  ["System", "T-a lower value", "T-b delete event", "T-c back-date"],
  ["Spreadsheet (CSV)", "SQLite DB", "Blockchain (Besu QBFT)"].map((sys) => {
    const cell = (threat) => {
      const o = strongest.find((x) => x.system === sys && x.threat.startsWith(threat));
      const possible = o.possible.toUpperCase().startsWith("YES");
      const detected = o.detected.toUpperCase().startsWith("YES");
      if (!possible) return "Not possible; attempts rejected + attributed";
      return detected ? "Possible; detected (heuristic), not attributable" : "Possible; UNDETECTED, not attributable";
    };
    return [sys, cell("T-a"), cell("T-b"), cell("T-c")];
  }));

// ---------------- Study B ----------------
writeTable("table-study-b",
  ["Check", "Description", "Result", "Detail"],
  B.checks.map((c) => [c.id, c.description, c.pass ? "PASS" : "FAIL", c.detail]));

// ---------------- Study C ----------------
const TDP = 45, CORES = 8;
const energy = (r) => {
  const w = (r.cpu.loadTotalCpuPct / 100) * (TDP / CORES);
  return { w, jPerTx: (w * r.wallClockSec) / r.totalTx };
};
const e4 = energy(C4), e7 = energy(C7);
writeTable("table-study-c",
  ["Configuration", "TPS", "Block time (s)", "TTF", "Latency avg / p95 (s, burst)", "Network power under load (W)", "Energy per tx (J)"],
  [
    ["4 validators + observer", C4.tps.toFixed(1), C4.blocks.avgBlockTimeSec.toFixed(2),
     "Immediate (deterministic at inclusion)",
     `${(C4.latencyMs.avg / 1000).toFixed(1)} / ${(C4.latencyMs.p95 / 1000).toFixed(1)}`,
     e4.w.toFixed(1), e4.jPerTx.toFixed(2)],
    ["7 validators", C7.tps.toFixed(1), C7.blocks.avgBlockTimeSec.toFixed(2),
     "Immediate (deterministic at inclusion)",
     `${(C7.latencyMs.avg / 1000).toFixed(1)} / ${(C7.latencyMs.p95 / 1000).toFixed(1)}`,
     e7.w.toFixed(1), e7.jPerTx.toFixed(2)],
  ]);

// Charts: copy the Study C chart page alongside the tables.
fs.copyFileSync(path.join(SRC, "study-c-report.html"), path.join(OUT, "charts-study-c.html"));

console.log("dissertation-results rebuilt: table-study-a(.md/.csv, + headline), table-study-b, table-study-c, charts-study-c.html");
console.log("summary.md is hand-written prose - review it manually after re-runs.");
