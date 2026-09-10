// Evaluation Study A - tamper-evidence versus baselines (chapter plan X.7).
//
// Threats (applied to spreadsheet, SQLite, and blockchain):
//   T-a  secretly lower a past emission value
//   T-b  delete an event
//   T-c  back-date an event
// File-based systems are attacked at two sophistication levels:
//   naive     - edits the target field(s) only
//   competent - also recomputes the file's internal hash columns afterwards
// Detection = an integrity audit that sees ONLY the system's own data:
//   (1) co2e == activity x factor / 1e6   (2) event hash recomputation
//   (3) hash-chain links                  (4) completeness (stages 1..10)
//   (5) timestamp monotonicity
// All tampering happens on COPIES (saved to artifacts/ for inspection).
// The ledger is attacked through every interface that exists, plus a
// five-node consistency check; a dedicated throwaway product (id 2+) is used
// so product 1's record stays pristine.
//
// Run:  npx hardhat run evaluation/study-a-tampering/run-study-a.ts --network besu
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.join(__dirname, "..", "..");
const ARTIFACTS = path.join(__dirname, "artifacts");
const RESULTS_DIR = path.join(ROOT, "evaluation", "results");

const COLS = [
  "product_id", "event_index", "stage_id", "actor_address", "actor_name",
  "actor_role", "activity_data_x1000", "activity_unit",
  "emission_factor_x1000", "ef_source", "co2e_grams", "methodology",
  "evidence_hash", "prev_event_hash", "timestamp_unix", "schema_version",
  "event_hash",
] as const;
type Row = Record<(typeof COLS)[number], string>;

// ---------------------------------------------------------------- CSV utils
function parseCsv(text: string): Row[] {
  const rows: string[][] = [];
  let cur: string[] = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQ = false;
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { cur.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (field !== "" || cur.length) { cur.push(field); rows.push(cur); cur = []; field = ""; }
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else field += ch;
  }
  if (field !== "" || cur.length) { cur.push(field); rows.push(cur); }
  const header = rows[0];
  return rows.slice(1).map((cells) => {
    const r: any = {};
    header.forEach((h, i) => (r[h] = cells[i] ?? ""));
    return r as Row;
  });
}

function writeCsv(rows: Row[], file: string) {
  const escape = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replaceAll(`"`, `""`)}"` : v);
  const text = [
    COLS.join(","),
    ...rows.map((r) => COLS.map((c) => escape(r[c])).join(",")),
  ].join("\r\n") + "\r\n";
  fs.writeFileSync(file, text);
}

// ------------------------------------------------------------- hash helpers
function hashRow(r: Row): string {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  return ethers.keccak256(coder.encode(
    ["uint256", "uint8", "address", "uint256", "string", "int256",
     "string", "int256", "string", "bytes32", "bytes32", "uint64", "string"],
    [BigInt(r.product_id), BigInt(r.stage_id), r.actor_address,
     BigInt(r.activity_data_x1000), r.activity_unit,
     BigInt(r.emission_factor_x1000), r.ef_source, BigInt(r.co2e_grams),
     r.methodology, r.evidence_hash, r.prev_event_hash,
     BigInt(r.timestamp_unix), r.schema_version]));
}

/// What a COMPETENT insider does after editing: renumber, relink, and
/// recompute every internal hash so the file is fully self-consistent again.
function rehashChain(rows: Row[]): Row[] {
  const byProduct = new Map<string, Row[]>();
  for (const r of rows) {
    byProduct.set(r.product_id, [...(byProduct.get(r.product_id) ?? []), r]);
  }
  const out: Row[] = [];
  for (const [, prows] of byProduct) {
    prows.sort((a, b) => Number(a.event_index) - Number(b.event_index));
    let prev = ethers.ZeroHash;
    prows.forEach((r, i) => {
      r.event_index = String(i);
      r.prev_event_hash = prev;
      r.event_hash = hashRow(r);
      prev = r.event_hash;
      out.push(r);
    });
  }
  return out;
}

// ------------------------------------------------------------ the auditor
type Audit = { detected: boolean; findings: string[]; ms: number };

function auditRows(rows: Row[]): Audit {
  const t0 = performance.now();
  const findings: string[] = [];
  const byProduct = new Map<string, Row[]>();
  for (const r of rows) {
    byProduct.set(r.product_id, [...(byProduct.get(r.product_id) ?? []), r]);
  }
  for (const [pid, prows] of byProduct) {
    prows.sort((a, b) => Number(a.event_index) - Number(b.event_index));
    let prev = ethers.ZeroHash;
    let lastTs = 0n;
    const stagesSeen = new Set<string>();
    for (const r of prows) {
      stagesSeen.add(r.stage_id);
      const expected = (BigInt(r.activity_data_x1000) * BigInt(r.emission_factor_x1000)) / 1_000_000n;
      if (expected !== BigInt(r.co2e_grams)) {
        findings.push(`product ${pid} event ${r.event_index}: co2e ${r.co2e_grams} != activity x factor (${expected})`);
      }
      if (hashRow(r) !== r.event_hash) {
        findings.push(`product ${pid} event ${r.event_index}: stored event_hash does not match recomputation`);
      }
      if (r.prev_event_hash !== prev) {
        findings.push(`product ${pid} event ${r.event_index}: hash-chain link broken`);
      }
      if (BigInt(r.timestamp_unix) < lastTs) {
        findings.push(`product ${pid} event ${r.event_index}: timestamp earlier than predecessor (ordering anomaly)`);
      }
      prev = r.event_hash;
      lastTs = BigInt(r.timestamp_unix);
    }
    for (let s = 1; s <= 10; s++) {
      if (!stagesSeen.has(String(s))) {
        findings.push(`product ${pid}: lifecycle stage ${s} has no event (completeness heuristic)`);
      }
    }
  }
  return { detected: findings.length > 0, findings, ms: performance.now() - t0 };
}

// ------------------------------------------------- file-system experiments
type Outcome = {
  system: string; threat: string; level: string;
  possible: string; detected: string; attributed: string;
  timeToDetect: string; notes: string;
};

function dbToRows(dbPath: string): Row[] {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const raw = db.prepare(
    "SELECT * FROM emission_events ORDER BY product_id, event_index").all() as any[];
  db.close();
  return raw.map((r) => {
    const o: any = {};
    for (const c of COLS) o[c] = String(r[c]);
    return o as Row;
  });
}

function rowsToDb(rows: Row[], srcDb: string, destDb: string) {
  fs.copyFileSync(srcDb, destDb);
  const db = new DatabaseSync(destDb);
  db.exec("DELETE FROM emission_events");
  const ins = db.prepare(`INSERT INTO emission_events VALUES
    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const r of rows) {
    ins.run(BigInt(r.product_id), BigInt(r.event_index), BigInt(r.stage_id),
      r.actor_address, r.actor_name, r.actor_role,
      BigInt(r.activity_data_x1000), r.activity_unit,
      BigInt(r.emission_factor_x1000), r.ef_source, BigInt(r.co2e_grams),
      r.methodology, r.evidence_hash, r.prev_event_hash,
      BigInt(r.timestamp_unix), r.schema_version, r.event_hash);
  }
  db.close();
}

// The three tampering operations, as pure row transformations.
function tamperLowerValue(rows: Row[]): Row[] {
  // Target: product 1 stage 2 (PCB, 60 kg). Lower activity so co2e ~ 20 kg,
  // exactly as a supplier under-reporting embodied carbon would.
  return rows.map((r) => {
    if (r.product_id === "1" && r.stage_id === "2") {
      const activity = 133n; // 0.133 kg instead of 0.4 kg
      const co2e = (activity * BigInt(r.emission_factor_x1000)) / 1_000_000n;
      return { ...r, activity_data_x1000: activity.toString(), co2e_grams: co2e.toString() };
    }
    return r;
  });
}
function tamperNaiveLowerValue(rows: Row[]): Row[] {
  // Naive variant: edits the reported co2e only, inconsistently.
  return rows.map((r) =>
    r.product_id === "1" && r.stage_id === "2" ? { ...r, co2e_grams: "20000" } : r);
}
function tamperDelete(rows: Row[]): Row[] {
  return rows.filter((r) => !(r.product_id === "1" && r.stage_id === "5"));
}
function tamperBackdate(rows: Row[]): Row[] {
  // Move the use-phase event's timestamp 30 days into the past.
  return rows.map((r) => {
    if (r.product_id === "1" && r.stage_id === "8") {
      return { ...r, timestamp_unix: String(BigInt(r.timestamp_unix) - 2_592_000n) };
    }
    return r;
  });
}
function resortByTimestamp(rows: Row[]): Row[] {
  // Competent back-dater also reorders the history so it looks natural.
  const byProduct = new Map<string, Row[]>();
  for (const r of rows) byProduct.set(r.product_id, [...(byProduct.get(r.product_id) ?? []), r]);
  const out: Row[] = [];
  for (const [, prows] of byProduct) {
    prows.sort((a, b) => Number(BigInt(a.timestamp_unix) - BigInt(b.timestamp_unix)));
    prows.forEach((r, i) => out.push({ ...r, event_index: String(i) }));
  }
  return out;
}

function runFileExperiments(): { outcomes: Outcome[]; controlOk: boolean } {
  const csvSrc = path.join(ROOT, "baselines", "spreadsheet", "emissions.csv");
  const dbSrc = path.join(ROOT, "baselines", "sqlite", "emissions.db");
  const original = parseCsv(fs.readFileSync(csvSrc, "utf8"));

  // Control: the untampered data must audit clean, or detection results
  // would be meaningless.
  const control = auditRows(original);
  const controlDb = auditRows(dbToRows(dbSrc));

  const scenarios: {
    threat: string; level: string; transform: (r: Row[]) => Row[]; notes: string;
  }[] = [
    { threat: "T-a lower value", level: "naive",
      transform: tamperNaiveLowerValue,
      notes: "Value edited; internal hashes left stale" },
    { threat: "T-a lower value", level: "competent",
      transform: (r) => rehashChain(tamperLowerValue(r)),
      notes: "Activity+co2e edited consistently; all hashes recomputed" },
    { threat: "T-b delete event", level: "naive",
      transform: tamperDelete,
      notes: "Row removed; chain left broken" },
    { threat: "T-b delete event", level: "competent",
      transform: (r) => rehashChain(tamperDelete(r)),
      notes: "Row removed; chain relinked. Only the 10-stage business rule flags it" },
    { threat: "T-c back-date", level: "naive",
      transform: tamperBackdate,
      notes: "Timestamp edited; hashes left stale" },
    { threat: "T-c back-date", level: "competent",
      transform: (r) => rehashChain(resortByTimestamp(tamperBackdate(r))),
      notes: "Timestamp edited, history reordered, hashes recomputed" },
  ];

  const outcomes: Outcome[] = [];
  for (const sc of scenarios) {
    const tampered = sc.transform(structuredClone(original));

    // Spreadsheet
    const csvOut = path.join(ARTIFACTS,
      `csv-${sc.threat.slice(0, 3)}-${sc.level}.csv`.replaceAll(" ", ""));
    writeCsv(tampered, csvOut);
    const csvAudit = auditRows(parseCsv(fs.readFileSync(csvOut, "utf8")));
    outcomes.push({
      system: "Spreadsheet (CSV)", threat: sc.threat, level: sc.level,
      possible: "YES - silent file edit",
      detected: csvAudit.detected ? `YES (${csvAudit.findings.length} finding${csvAudit.findings.length > 1 ? "s" : ""})` : "NO - audit passes clean",
      attributed: "NO - no identity binding; file metadata shows neither who nor what",
      timeToDetect: csvAudit.detected
        ? `${csvAudit.ms.toFixed(0)} ms audit run; unbounded otherwise (nothing triggers an audit)`
        : "never (internally self-consistent)",
      notes: sc.notes,
    });

    // SQLite
    const dbOut = path.join(ARTIFACTS,
      `db-${sc.threat.slice(0, 3)}-${sc.level}.db`.replaceAll(" ", ""));
    rowsToDb(tampered, dbSrc, dbOut);
    const dbAudit = auditRows(dbToRows(dbOut));
    outcomes.push({
      system: "SQLite DB", threat: sc.threat, level: sc.level,
      possible: "YES - ordinary UPDATE/DELETE by any admin",
      detected: dbAudit.detected ? `YES (${dbAudit.findings.length} finding${dbAudit.findings.length > 1 ? "s" : ""})` : "NO - audit passes clean",
      attributed: "NO - unless privileged server logs exist, which the same admin controls",
      timeToDetect: dbAudit.detected
        ? `${dbAudit.ms.toFixed(0)} ms audit run; unbounded otherwise`
        : "never (internally self-consistent)",
      notes: sc.notes,
    });
  }
  return { outcomes, controlOk: !control.detected && !controlDb.detected };
}

// ------------------------------------------------------ ledger experiments
async function runLedgerExperiments(): Promise<{ outcomes: Outcome[]; log: string[] }> {
  const log: string[] = [];
  const deployed = JSON.parse(
    fs.readFileSync(path.join(ROOT, "simulation", "deployed-addresses.json"), "utf8"));
  const accounts = JSON.parse(
    fs.readFileSync(path.join(ROOT, "network", "accounts.json"), "utf8")) as { role: string }[];
  const signers = await ethers.getSigners();
  const signerFor = (role: string) => signers[accounts.findIndex((a) => a.role === role)];
  const smelter = signerFor("smelter");
  const oem = signerFor("oem");

  const events = await ethers.getContractAt(
    "EmissionEventRegistry", deployed.addresses.EmissionEventRegistry);
  const governance = await ethers.getContractAt(
    "GovernanceModule", deployed.addresses.GovernanceModule);

  // Sacrificial product so product 1 stays pristine.
  let productId = 2n;
  while (await events.productExists(productId)) productId++;
  await (await events.connect(oem).createProduct(productId, `Study A test product ${productId}`)).wait();
  const ev = (s: string) => ethers.keccak256(ethers.toUtf8Bytes(s));
  await (await events.connect(smelter).recordEvent(
    productId, 1, 12_000n, "kg", 8_000_000n, "PLACEHOLDER / SOURCE NEEDED",
    "GHGP S3C1", ev("a"), "1.0.0")).wait();
  await (await events.connect(oem).recordEvent(
    productId, 5, 5_500n, "kWh", 450_000n, "PLACEHOLDER / SOURCE NEEDED",
    "GHGP S3C1", ev("b"), "1.0.0")).wait();
  log.push(`Created sacrificial product ${productId} with 2 events.`);

  // T-a: every route to silently lowering event 0's value.
  const mutators = events.interface.fragments
    .filter((f: any) => f.type === "function" && !["view", "pure"].includes(f.stateMutability))
    .map((f: any) => f.name);
  log.push(`Registry mutator functions: [${mutators.join(", ")}] - no update/delete path exists.`);

  let t0 = performance.now();
  let revertMsA = 0;
  let attemptAFailed = false;
  try {
    // The actor who WROTE the record tries to "fix" it downward via the
    // only correction mechanism there is.
    await governance.connect(smelter).correctEvent(
      productId, 0, 6_000n, 8_000_000n, "adjusting my own figure", ev("x"));
  } catch {
    attemptAFailed = true;
    revertMsA = performance.now() - t0;
    log.push(`Unauthorised correctEvent by ${smelter.address} rejected in ${revertMsA.toFixed(0)} ms (role gate; attempt attributable to sender).`);
  }

  // A visible restatement is possible - but it appends, attributed, in the open:
  const before = await events.eventCount(productId);
  await (await events.connect(smelter).recordEvent(
    productId, 1, 6_000n, "kg", 8_000_000n, "PLACEHOLDER / SOURCE NEEDED",
    "GHGP S3C1 - RESTATEMENT", ev("c"), "1.0.0")).wait();
  const after = await events.eventCount(productId);
  log.push(`Attempted "overwrite" via recordEvent: event count ${before} -> ${after}; original untouched; new record signed by ${smelter.address}.`);
  const [chainStillOk] = await events.verifyChain(productId);

  // T-b: deletion - no interface exists at all (see mutator list above).

  // T-c: back-dating - recordEvent accepts no timestamp; the block clock rules.
  const recordFragment = events.interface.getFunction("recordEvent")!;
  const hasTimestampParam = recordFragment.inputs.some((i) => /time|date/i.test(i.name));
  const lastEvent = await events.eventAt(productId, after - 1n);
  const block = await ethers.provider.getBlock("latest");
  log.push(`recordEvent has ${recordFragment.inputs.length} inputs, none a timestamp (checked: ${hasTimestampParam ? "FOUND ONE?!" : "confirmed none"}); stored timestamp ${lastEvent.timestamp} is block-assigned (latest block ${block!.timestamp}).`);

  // Five-node consistency: a node operator who tampered locally would stand out.
  const nodeUrls = [8545, 8546, 8547, 8548, 8549].map((p) => `http://localhost:${p}`);
  t0 = performance.now();
  const heads: string[] = [];
  for (const url of nodeUrls) {
    const prov = new ethers.JsonRpcProvider(url);
    const reg = new ethers.Contract(
      deployed.addresses.EmissionEventRegistry,
      events.interface, prov);
    heads.push(await reg.lastEventHash(productId));
    prov.destroy();
  }
  const crossNodeMs = performance.now() - t0;
  const allAgree = heads.every((h) => h === heads[0]);
  log.push(`Cross-node check: lastEventHash(product ${productId}) identical on all 5 nodes (${allAgree}) in ${crossNodeMs.toFixed(0)} ms. A locally-tampered node would disagree with the 4-node quorum and be identified immediately.`);

  const common = {
    system: "Blockchain (Besu QBFT)",
    attributed: "YES - every write is key-signed; failed attempts identify their sender; a deviating node is identified by 4-of-5 quorum",
  };
  const outcomes: Outcome[] = [
    {
      ...common, threat: "T-a lower value", level: "insider w/ valid keys",
      possible: "NO silent path - no update function; role-gated correction rejected; restatement only APPENDS, signed and visible",
      detected: `YES - unauthorised attempt rejected at submission${attemptAFailed ? "" : " (UNEXPECTED: attempt succeeded!)"}; visible restatement changes event count and totals openly (chain intact: ${chainStillOk})`,
      timeToDetect: `${revertMsA.toFixed(0)} ms (rejected before entering the ledger)`,
      notes: "Governed correction by an authorised role IS possible - but logged, attributed, append-only (DP4)",
    },
    {
      ...common, threat: "T-b delete event", level: "insider w/ valid keys",
      possible: "NO - no delete interface exists (mutators: createProduct, recordEvent only)",
      detected: "n/a - not expressible; local node-storage tampering exposed by 4-of-5 quorum divergence",
      timeToDetect: `${crossNodeMs.toFixed(0)} ms (cross-node comparison, 5 nodes)`,
      notes: "Deletion would require rewriting QBFT-finalised blocks on 3+ of 4 validators simultaneously",
    },
    {
      ...common, threat: "T-c back-date", level: "insider w/ valid keys",
      possible: "NO - recordEvent accepts no timestamp; the finalised block clock assigns it",
      detected: "n/a - not expressible at entry; altering a past timestamp = altering a finalised block (see T-b)",
      timeToDetect: "immediate (the field cannot be supplied)",
      notes: "Evidence anchored by hash cannot be re-dated either without a MISMATCH in the audit",
    },
  ];
  return { outcomes, log };
}

// ------------------------------------------------------------------ report
function renderMarkdown(outcomes: Outcome[], ledgerLog: string[], controlOk: boolean): string {
  const tbl = [
    "| System | Threat | Attacker level | Alteration possible? | Detected? | Provable + culprit identified? | Time to detect |",
    "|---|---|---|---|---|---|---|",
    ...outcomes.map((o) =>
      `| ${o.system} | ${o.threat} | ${o.level} | ${o.possible} | ${o.detected} | ${o.attributed} | ${o.timeToDetect} |`),
  ].join("\n");
  return `# Study A - Tamper-evidence versus baselines

Generated by \`evaluation/study-a-tampering/run-study-a.ts\`. Re-runnable end to end.

## Method

**Systems.** Three systems holding identical records (verified by the loader's
three-way parity check): the Besu QBFT ledger (authoritative), a CSV
spreadsheet, and a SQLite database, both replicated from the ledger including
its hash columns.

**Threat model.** An insider with full legitimate access: file access
(spreadsheet), administrator SQL access (SQLite), a consortium key-holder
(ledger). File-based systems are attacked at two sophistication levels -
*naive* (edits the target fields only) and *competent* (afterwards renumbers,
relinks, and recomputes all internal hash columns, which any insider can do
because nothing outside the file anchors them).

**Threats.** T-a: secretly lower a past emission value (product 1, stage 2,
60 kg -> ~20 kg). T-b: delete an event (product 1, stage 5). T-c: back-date an
event by 30 days (product 1, stage 8).

**Detection procedure (defined ex ante).** Each tampered copy is audited by an
integrity checker that sees only that system's own data: (1) co2e = activity x
factor; (2) per-event hash recomputation; (3) hash-chain links; (4)
completeness (stages 1..10 present); (5) timestamp monotonicity. The
untampered data audits clean (control ${controlOk ? "passed" : "FAILED"}). The
ledger is attacked through every interface that exists; detection latency is
wall-clock, measured with a monotonic timer on this host.

**Preservation.** Originals are never modified; every tampered copy is kept in
\`evaluation/study-a-tampering/artifacts/\` for inspection. Ledger tests use a
sacrificial product so product 1's record stays pristine.

## Results

${tbl}

## Ledger experiment log

${ledgerLog.map((l) => `- ${l}`).join("\n")}

## Reading the results

1. **The spreadsheet offers no resistance.** Every attack succeeds silently.
   A naive attacker is caught by re-running the integrity checks - but only
   *if* someone runs them, and nothing in the system triggers that. A
   competent attacker who recomputes the file's own hash columns produces a
   fully self-consistent forgery that no file-internal audit can detect, and
   no attack is attributable to a person.
2. **The database is the same story with better furniture.** UPDATE and
   DELETE are ordinary administrator operations. Server-side audit logs could
   help, but they are configured, readable, and erasable by the same
   administrator - detection depends on privileged logs (cf. plan X.7).
3. **The ledger removes the write-path instead of guarding it.** There is no
   update or delete interface; the only correction path is role-gated, logged,
   and append-only; timestamps cannot be supplied by the caller; and every
   accepted write is signed by an identified key. The residual attack -
   rewriting finalised blocks inside >=3 of 4 validators' storage
   simultaneously - is a Byzantine-quorum compromise, outside this study's
   insider threat model; single-node local tampering is exposed by 4-of-5
   quorum divergence in milliseconds.

## Honest limitations

- Node-level storage tampering was argued from the BFT design and
  demonstrated by cross-node comparison; a physically tampered Besu database
  was not constructed.
- The completeness heuristic (10 stages) detects whole-stage deletion but
  would not detect deletion of one of several events within a stage in
  file-based systems.
- Detection latencies are host-specific (single laptop, all 5 nodes local).
- Emission values are placeholders; this study evaluates integrity
  properties, which are independent of the factor values.
`;
}

async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  console.log("=== Study A: file-based systems (spreadsheet, SQLite) ===");
  const { outcomes: fileOutcomes, controlOk } = runFileExperiments();
  console.log(`Control audits on untampered data: ${controlOk ? "clean (as required)" : "FAILED - aborting"}`);
  if (!controlOk) throw new Error("Control audit failed; results would be meaningless.");

  console.log("=== Study A: ledger experiments ===");
  const { outcomes: ledgerOutcomes, log } = await runLedgerExperiments();
  for (const l of log) console.log(`  ${l}`);

  const outcomes = [...fileOutcomes, ...ledgerOutcomes];
  console.log("\n=== RESULTS ===");
  for (const o of outcomes) {
    console.log(`${o.system} | ${o.threat} | ${o.level}`);
    console.log(`   possible:  ${o.possible}`);
    console.log(`   detected:  ${o.detected}`);
    console.log(`   attributed:${o.attributed}`);
    console.log(`   latency:   ${o.timeToDetect}`);
  }

  const md = renderMarkdown(outcomes, log, controlOk);
  fs.writeFileSync(path.join(RESULTS_DIR, "study-a-results.md"), md);
  fs.writeFileSync(
    path.join(RESULTS_DIR, "study-a-results.json"),
    JSON.stringify({ controlOk, outcomes, ledgerLog: log }, null, 2));
  console.log(`\nSaved: evaluation/results/study-a-results.md and .json`);
  console.log(`Tampered artifacts kept in evaluation/study-a-tampering/artifacts/`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
