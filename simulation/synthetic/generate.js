// SYNTHETIC emission-data generator.
// Activity data (masses, kWh, tonne-km) is SYNTHETIC: drawn from truncated
// normal distributions with documented parameters and a FIXED SEED, so every
// run reproduces byte-identical data. CO2e = synthetic activity x factor,
// where factors come from factors-table.json - published+cited where
// available (status CITED), or composed from cited components with documented
// synthetic composition assumptions (status DERIVED_FROM_CITED). No factor
// value is invented here.
//
// Outputs (simulation/synthetic/output/):
//   reference-laptop.json   one detailed reference laptop (deterministic
//                           central parameters), in the lifecycle-file shape
//                           the chain simulation consumes
//   fleet-SYNTHETIC.csv     N product instances x 10 stages (default 300)
//   fleet-summary.json      distribution statistics + realism-check results
//
// Run:  node simulation/synthetic/generate.js [fleetSize] [seed]
const fs = require("fs");
const path = require("path");

const FLEET_SIZE = Number(process.argv[2] ?? 300);
const SEED = Number(process.argv[3] ?? 20260806); // fixed default: reproducible
const OUT = path.join(__dirname, "output");
const table = JSON.parse(fs.readFileSync(path.join(__dirname, "factors-table.json"), "utf8"));
const factorOf = Object.fromEntries(table.factors.map((f) => [f.stageId, f]));

// ---------------- seeded RNG (mulberry32) + truncated normal ----------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function truncNormal(rng, mean, sd, min, max) {
  for (let i = 0; i < 100; i++) {
    const u1 = Math.max(rng(), 1e-12), u2 = rng();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const x = mean + sd * z;
    if (x >= min && x <= max) return x;
  }
  return Math.min(max, Math.max(min, mean)); // clamp fallback
}

// -------- SYNTHETIC activity model per stage (parameters documented in
// data-dictionary.md; all ASSUMPTIONS, chosen for a generic 14-inch laptop) --
const ACTIVITY_MODEL = {
  1:  { mean: 1.15,  sd: 0.15,  min: 0.8,   max: 1.6,   round: 3, actorRole: "smelter",        methodology: "GHG Protocol Scope 3 Cat 1 (purchased goods)" },
  2:  { mean: 0.35,  sd: 0.05,  min: 0.25,  max: 0.5,   round: 3, actorRole: "pcbSupplier",    methodology: "GHG Protocol Scope 3 Cat 1 (purchased goods)" },
  3:  { mean: 0.060, sd: 0.008, min: 0.045, max: 0.080, round: 4, actorRole: "batteryMaker",   methodology: "GHG Protocol Scope 3 Cat 1 (purchased goods)" },
  4:  { mean: 0.058, sd: 0.006, min: 0.048, max: 0.075, round: 4, actorRole: "screenSupplier", methodology: "GHG Protocol Scope 3 Cat 1 (purchased goods)" },
  5:  { mean: 25,    sd: 5,     min: 12,    max: 40,    round: 1, actorRole: "oem",            methodology: "GHG Protocol Scope 1+2 at supplier / Cat 1 to buyer" },
  6:  { mean: 0.9,   sd: 0.15,  min: 0.5,   max: 1.4,   round: 2, actorRole: "oem",            methodology: "GHG Protocol Scope 3 Cat 1 (purchased goods)" },
  7:  { mean: 65,    sd: 10,    min: 35,    max: 95,    round: 1, actorRole: "logistics",      methodology: "GHG Protocol Scope 3 Cat 4 (upstream transport)" },
  8:  { mean: 175,   sd: 40,    min: 80,    max: 300,   round: 0, actorRole: "usePhaseAgent",  methodology: "GHG Protocol Scope 3 Cat 11 (use of sold products)" },
  9:  { mean: 0.060, sd: 0.008, min: 0.045, max: 0.080, round: 4, actorRole: "repairer",       methodology: "GHG Protocol Scope 3 Cat 11 extension (repair)" },
  10: { mean: 2.0,   sd: 0.2,   min: 1.5,   max: 2.6,   round: 2, actorRole: "recycler",       methodology: "GHG Protocol Scope 3 Cat 12 (end-of-life)" },
};
const round = (x, dp) => Number(x.toFixed(dp));

function efSourceString(f) {
  const tag =
    f.status === "CITED" ? `CITED: ${f.citation.split(" - ")[0].split(":")[0]}`
    : f.status === "DERIVED_FROM_CITED" ? "DERIVED from cited components (see factors-table.json)"
    : "PLACEHOLDER SOURCE NEEDED";
  return `SYNTHETIC activity; factor ${tag}`;
}

function makeStages(activityFor) {
  return Object.entries(ACTIVITY_MODEL).map(([sid, m]) => {
    const f = factorOf[sid];
    const activity = activityFor(Number(sid), m);
    return {
      stageId: Number(sid),
      name: `${f.stage} [SYNTHETIC]`,
      actorRole: m.actorRole,
      activityValue: activity,
      activityUnit: f.unit,
      emissionFactor_gCO2ePerUnit: f.value_gCO2ePerUnit,
      factorStatus: f.status,
      efSource: efSourceString(f),
      methodology: m.methodology,
      co2e_kg: round((activity * f.value_gCO2ePerUnit) / 1000, 3),
      notes: "SYNTHETIC activity data (seeded model, see data-dictionary.md)",
    };
  });
}

function realismCheck(totalKg, stages) {
  const [lo, hi] = table.realismAnchor.acceptableRange_kgCO2e;
  const manufacturing = stages.filter((s) => s.stageId <= 6).reduce((a, s) => a + s.co2e_kg, 0);
  const usePhase = stages.find((s) => s.stageId === 8).co2e_kg;
  return {
    totalKg: round(totalKg, 2),
    anchorRange: [lo, hi],
    withinPublishedRange: totalKg >= lo && totalKg <= hi,
    manufacturingKg: round(manufacturing, 2),
    usePhaseKg: round(usePhase, 2),
    manufacturingDominates: manufacturing > usePhase,
  };
}

// ---------------- 1. the reference laptop (deterministic central values) ----
fs.mkdirSync(OUT, { recursive: true });
const refStages = makeStages((sid, m) => round(m.mean, m.round));
const refTotal = refStages.reduce((a, s) => a + s.co2e_kg, 0);
const refCheck = realismCheck(refTotal, refStages);

const reference = {
  _DATA_STATUS: "SYNTHETIC DATA - activity values are model-generated, not measured. Factors: see factorStatus per stage (CITED = published source, verified; DERIVED_FROM_CITED = composed from cited components with documented synthetic composition assumptions). No footprint figure herein may be presented as a real product measurement.",
  generator: { script: "simulation/synthetic/generate.js", seed: SEED, mode: "reference = deterministic central parameters" },
  referenceProduct: "SYNTHETIC generic 14-inch laptop (reference instance)",
  schemaVersion: "1.0.0",
  realismCheck: refCheck,
  stages: refStages,
};
fs.writeFileSync(path.join(OUT, "reference-laptop.json"), JSON.stringify(reference, null, 2));

// ---------------- 2. the fleet ----------------
const csvRows = [[
  "data_status", "product_instance", "stage_id", "stage_name",
  "synthetic_activity_value", "activity_unit",
  "emission_factor_gCO2e_per_unit", "factor_status", "co2e_kg",
].join(",")];
const totals = [];
for (let p = 1; p <= FLEET_SIZE; p++) {
  const rng = mulberry32(SEED + p * 7919); // per-instance stream, reproducible
  const stages = makeStages((sid, m) => round(truncNormal(rng, m.mean, m.sd, m.min, m.max), m.round));
  totals.push(stages.reduce((a, s) => a + s.co2e_kg, 0));
  for (const s of stages) {
    csvRows.push([
      "SYNTHETIC", p, s.stageId, `"${s.name}"`,
      s.activityValue, `"${s.activityUnit}"`,
      s.emissionFactor_gCO2ePerUnit, s.factorStatus, s.co2e_kg,
    ].join(","));
  }
}
fs.writeFileSync(path.join(OUT, "fleet-SYNTHETIC.csv"), csvRows.join("\r\n") + "\r\n");

totals.sort((a, b) => a - b);
const q = (p) => totals[Math.min(totals.length - 1, Math.floor(p * totals.length))];
const [lo, hi] = table.realismAnchor.acceptableRange_kgCO2e;
const outside = totals.filter((t) => t < lo || t > hi).length;
const summary = {
  _DATA_STATUS: "SYNTHETIC fleet summary",
  seed: SEED,
  fleetSize: FLEET_SIZE,
  totalKg: {
    min: round(totals[0], 1), p05: round(q(0.05), 1), median: round(q(0.5), 1),
    p95: round(q(0.95), 1), max: round(totals[totals.length - 1], 1),
    mean: round(totals.reduce((a, b) => a + b, 0) / totals.length, 1),
  },
  anchorRange: [lo, hi],
  instancesOutsidePublishedRange: outside,
};
fs.writeFileSync(path.join(OUT, "fleet-summary.json"), JSON.stringify(summary, null, 2));

// ---------------- console report ----------------
console.log("=== SYNTHETIC reference laptop - per-stage breakdown ===");
for (const s of refStages) {
  const flag = s.factorStatus === "CITED" ? "cited" : s.factorStatus === "DERIVED_FROM_CITED" ? "derived+" : "PLACEHOLDER";
  console.log(
    `  stage ${String(s.stageId).padStart(2)} ${s.name.replace(" [SYNTHETIC]", "").padEnd(42)}` +
    `${String(s.activityValue).padStart(8)} ${s.activityUnit.padEnd(24)}` +
    `${s.co2e_kg.toFixed(2).padStart(8)} kg CO2e  [factor: ${flag}]`);
}
console.log(`  ${"-".repeat(100)}`);
console.log(`  TOTAL ${refCheck.totalKg} kg CO2e  (+ = composed from cited components, see factors-table.json)`);
console.log(`\n=== Realism checks (anchors: Dell whitepaper 300-400 kg; Devera median 215, range ~158-287; mfg dominates) ===`);
console.log(`  within published range ${lo}-${hi} kg: ${refCheck.withinPublishedRange ? "YES" : "NO - REVIEW PARAMETERS"}`);
console.log(`  manufacturing ${refCheck.manufacturingKg} kg vs use-phase ${refCheck.usePhaseKg} kg -> manufacturing dominates: ${refCheck.manufacturingDominates ? "YES" : "NO - REVIEW PARAMETERS"}`);
console.log(`\n=== SYNTHETIC fleet (${FLEET_SIZE} instances, seed ${SEED}) ===`);
console.log(`  total kg CO2e: min ${summary.totalKg.min} | p05 ${summary.totalKg.p05} | median ${summary.totalKg.median} | p95 ${summary.totalKg.p95} | max ${summary.totalKg.max}`);
console.log(`  instances outside published range: ${outside} of ${FLEET_SIZE}${outside ? " - REVIEW" : ""}`);
console.log(`\nWrote: output/reference-laptop.json, output/fleet-SYNTHETIC.csv, output/fleet-summary.json`);
