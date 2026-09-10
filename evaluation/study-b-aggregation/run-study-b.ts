// Evaluation Study B - granular aggregation correctness + fault injection
// (chapter plan X.7, Study B).
//
// Part 1 - correctness on every product on the ledger:
//   B1 independent recomputation of the total == on-chain aggregate
//   B2 per-stage sub-totals == independent per-stage sums
//   B3 hash chain verifies end-to-end
//   B4 every event traceable to a registered, named actor
//   B5 completeness: the full-lifecycle product has all 10 stages;
//      the known-incomplete product (Study A's sacrificial one) is
//      correctly reported incomplete (natural negative control)
// Part 2 - fault injection (each fault must be FLAGGED, never a silent total):
//   F1 missing event: product with 9 of 10 stages -> completeness flag
//   F2 inconsistent event: token record disagrees with event record
//      -> crossCheck reconciliation flag
//   F3 auditor fed a local copy with an event REMOVED -> chain-link flag
//   F4 auditor fed a local copy with a VALUE ALTERED -> hash + formula flags
//
// Run:  npx hardhat run evaluation/study-b-aggregation/run-study-b.ts --network besu
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.join(__dirname, "..", "..");
const RESULTS_DIR = path.join(ROOT, "evaluation", "results");

type Check = { id: string; description: string; pass: boolean; detail: string };
const checks: Check[] = [];
function record(id: string, description: string, pass: boolean, detail: string) {
  checks.push({ id, description, pass, detail });
  console.log(`  [${pass ? "PASS" : "FAIL"}] ${id} ${description} - ${detail}`);
}

type LocalEvent = {
  productId: bigint; stageId: bigint; actor: string; activityData: bigint;
  activityUnit: string; emissionFactor: bigint; efSource: string;
  co2eGrams: bigint; methodology: string; evidenceHash: string;
  prevEventHash: string; timestamp: bigint; schemaVersion: string;
  eventHash: string;
};

function hashLocal(e: LocalEvent): string {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  return ethers.keccak256(coder.encode(
    ["uint256", "uint8", "address", "uint256", "string", "int256",
     "string", "int256", "string", "bytes32", "bytes32", "uint64", "string"],
    [e.productId, e.stageId, e.actor, e.activityData, e.activityUnit,
     e.emissionFactor, e.efSource, e.co2eGrams, e.methodology,
     e.evidenceHash, e.prevEventHash, e.timestamp, e.schemaVersion]));
}

/// The auditor's independent verifier over a LOCAL copy of event data.
function verifyLocal(events: LocalEvent[]): string[] {
  const findings: string[] = [];
  let prev = ethers.ZeroHash;
  events.forEach((e, i) => {
    if (e.prevEventHash !== prev) findings.push(`event ${i}: chain link broken`);
    if (hashLocal(e) !== e.eventHash) findings.push(`event ${i}: hash mismatch`);
    const expected = (e.activityData * e.emissionFactor) / 1_000_000n;
    if (expected !== e.co2eGrams) findings.push(`event ${i}: co2e violates activity x factor`);
    prev = e.eventHash;
  });
  return findings;
}

async function main() {
  const deployed = JSON.parse(
    fs.readFileSync(path.join(ROOT, "simulation", "deployed-addresses.json"), "utf8"));
  const factors = JSON.parse(
    fs.readFileSync(path.join(ROOT, "simulation", "emission-factors.json"), "utf8"));
  const accounts = JSON.parse(
    fs.readFileSync(path.join(ROOT, "network", "accounts.json"), "utf8")) as { role: string }[];
  const signers = await ethers.getSigners();
  const signerFor = (role: string) => signers[accounts.findIndex((a) => a.role === role)];
  const admin = signerFor("deployer");
  const oem = signerFor("oem");

  const events = await ethers.getContractAt(
    "EmissionEventRegistry", deployed.addresses.EmissionEventRegistry, admin);
  const participants = await ethers.getContractAt(
    "ParticipantRegistry", deployed.addresses.ParticipantRegistry, admin);
  const aggregator = await ethers.getContractAt(
    "AggregationContract", deployed.addresses.AggregationContract, admin);
  const token = await ethers.getContractAt(
    "CarbonToken", deployed.addresses.CarbonToken, admin);

  // ================= Part 1: correctness on every existing product =========
  console.log("=== Part 1: aggregation correctness (all products) ===");
  const productIds: bigint[] = [];
  for (let id = 1n; await events.productExists(id); id++) productIds.push(id);
  const preexisting = new Set(productIds.map(String));

  for (const pid of productIds) {
    const evs = await events.getEvents(pid);

    // B1: two independent implementations of "the total" must agree.
    let independent = 0n;
    for (const e of evs) independent += e.co2eGrams;
    const onChain = await aggregator.productTotal(pid);
    record("B1", `product ${pid}: independent total == on-chain aggregate`,
      independent === onChain,
      `${independent} g (off-chain recompute) vs ${onChain} g (contract view)`);

    // B2: per-stage sub-totals.
    let stagesOk = true;
    const stageDetail: string[] = [];
    for (let s = 1; s <= 10; s++) {
      let sum = 0n;
      for (const e of evs) if (Number(e.stageId) === s) sum += e.co2eGrams;
      const chainStage = await aggregator.stageTotal(pid, s);
      if (sum !== chainStage) { stagesOk = false; stageDetail.push(`stage ${s}: ${sum} != ${chainStage}`); }
    }
    record("B2", `product ${pid}: all 10 per-stage sub-totals agree`,
      stagesOk, stagesOk ? "10/10 stages agree" : stageDetail.join("; "));

    // B3: hash chain.
    const [chainOk] = await events.verifyChain(pid);
    record("B3", `product ${pid}: hash chain verifies`, chainOk, `verifyChain -> ${chainOk}`);

    // B4: every event traceable to a registered, named actor.
    let traceOk = true;
    const actors = new Set<string>();
    for (const e of evs) {
      const p = await participants.getParticipant(e.actor);
      if (!p.name || !p.organisationRole) traceOk = false;
      actors.add(`${p.name} (${p.organisationRole})`);
    }
    record("B4", `product ${pid}: every event traceable to a registered actor`,
      traceOk, `${evs.length} events -> ${actors.size} named actors`);

    // B5: completeness reporting.
    const complete = await aggregator.isComplete(pid);
    if (pid === 1n) {
      record("B5", `product ${pid}: full lifecycle reported complete`,
        complete, `isComplete -> ${complete} (10/10 stages expected)`);
    } else {
      // Product 2 is Study A's sacrificial product: 3 events, stages 1 and 5
      // only. It SHOULD be reported incomplete - a natural negative control.
      record("B5", `product ${pid}: known-incomplete product correctly flagged`,
        !complete, `isComplete -> ${complete} (incomplete expected; Study A artefact)`);
    }
  }

  // ================= Part 2: fault injection ==============================
  console.log("\n=== Part 2: fault injection ===");
  const ev = (s: string) => ethers.keccak256(ethers.toUtf8Bytes(s));
  const stages: any[] = factors.stages;

  // ---- F1: missing event (9 of 10 stages recorded, tokens consistent) ----
  let f1Product = 3n;
  while (await events.productExists(f1Product)) f1Product++;
  await (await events.connect(oem).createProduct(
    f1Product, `Study B fault-injection: MISSING stage 10 (product ${f1Product})`)).wait();
  await (await token.mintPassport(f1Product, oem.address)).wait();
  for (const s of stages) {
    if (s.stageId === 10) continue; // the injected fault
    const actor = signerFor(s.actorRole);
    await (await events.connect(actor).recordEvent(
      f1Product, s.stageId, BigInt(Math.round(s.activityValue * 1000)),
      s.activityUnit, BigInt(Math.round(s.emissionFactor_gCO2ePerUnit * 1000)),
      s.efSource, s.methodology, ev(`f1-${s.stageId}`), "1.0.0")).wait();
    const idx = (await events.eventCount(f1Product)) - 1n;
    const rec = await events.eventAt(f1Product, idx);
    if (rec.co2eGrams > 0n) await (await token.mintCarbon(f1Product, oem.address, rec.co2eGrams)).wait();
  }
  const f1Complete = await aggregator.isComplete(f1Product);
  const f1Present = await aggregator.stagesPresent(f1Product);
  const f1MissingStages = f1Present.map((p: boolean, i: number) => (p ? null : i + 1)).filter(Boolean);
  record("F1", "missing event: completeness check flags the gap (no silent total)",
    !f1Complete && f1MissingStages.length === 1 && f1MissingStages[0] === 10,
    `product ${f1Product}: isComplete -> ${f1Complete}; missing stages ${JSON.stringify(f1MissingStages)}; ` +
    `a bare total (${await aggregator.productTotal(f1Product)} g) is only reportable WITH this flag`);

  // ---- F2: inconsistent event (token record disagrees with event record) --
  let f2Product = f1Product + 1n;
  while (await events.productExists(f2Product)) f2Product++;
  await (await events.connect(oem).createProduct(
    f2Product, `Study B fault-injection: INCONSISTENT tokens (product ${f2Product})`)).wait();
  await (await token.mintPassport(f2Product, oem.address)).wait();
  const smelter = signerFor("smelter");
  await (await events.connect(smelter).recordEvent(
    f2Product, 1, 12_000n, "kg", 8_000_000n,
    "PLACEHOLDER / SOURCE NEEDED", "GHGP S3C1", ev("f2"), "1.0.0")).wait();
  // Event says 96,000 g; tokens deliberately record only 90,000 g.
  await (await token.mintCarbon(f2Product, oem.address, 90_000n)).wait();
  const [f2EventTotal, f2TokenNet, f2Consistent] = await aggregator.crossCheck(f2Product);
  record("F2", "inconsistent event: crossCheck raises a reconciliation error",
    !f2Consistent,
    `product ${f2Product}: events ${f2EventTotal} g vs tokens ${f2TokenNet} g -> consistent=${f2Consistent}`);

  // ---- F3/F4: the auditor is fed a doctored local copy of product 1 ------
  const raw = await events.getEvents(1n);
  const local: LocalEvent[] = raw.map((e: any) => ({
    productId: e.productId, stageId: e.stageId, actor: e.actor,
    activityData: e.activityData, activityUnit: e.activityUnit,
    emissionFactor: e.emissionFactor, efSource: e.efSource,
    co2eGrams: e.co2eGrams, methodology: e.methodology,
    evidenceHash: e.evidenceHash, prevEventHash: e.prevEventHash,
    timestamp: e.timestamp, schemaVersion: e.schemaVersion, eventHash: e.eventHash,
  }));
  const cleanFindings = verifyLocal(local);
  record("F0", "control: auditor verification of the genuine copy is clean",
    cleanFindings.length === 0, `${cleanFindings.length} findings on untampered data`);

  const missingCopy = local.filter((_, i) => i !== 4); // drop the assembly event
  const f3Findings = verifyLocal(missingCopy);
  record("F3", "auditor copy with an event removed: chain break detected",
    f3Findings.length > 0, f3Findings.join("; ") || "NOT DETECTED");

  const alteredCopy = local.map((e, i) =>
    i === 1 ? { ...e, co2eGrams: 20_000n } : e); // PCB 60 kg -> 20 kg
  const f4Findings = verifyLocal(alteredCopy);
  record("F4", "auditor copy with a value altered: hash + formula violations detected",
    f4Findings.length >= 2, f4Findings.join("; ") || "NOT DETECTED");

  // ================= results file =========================================
  const allPass = checks.every((c) => c.pass);
  const md = `# Study B - Granular aggregation correctness and fault injection

Generated by \`evaluation/study-b-aggregation/run-study-b.ts\`. Re-runnable.

## Method

**Part 1 (correctness).** For every product on the ledger (${productIds.length} pre-existing:
${[...preexisting].map((p) => `product ${p}`).join(", ")}), the total footprint was recomputed
independently off-chain from raw events and compared with the on-chain
\`AggregationContract\` view; likewise all 10 per-stage sub-totals. The hash
chain was verified end-to-end and every event's actor resolved against the
\`ParticipantRegistry\` (traceability, FR6). Completeness (all 10 lifecycle
stages present) is asserted for the full-lifecycle product 1; product 2 -
Study A's sacrificial product, which is legitimately incomplete - serves as a
negative control and must be flagged incomplete.

**Part 2 (fault injection).** Faults are injected at the two places they can
occur in this architecture (the ledger itself refuses edits - Study A):
- **F1 missing event**: a new product recorded with 9 of 10 stages. The
  system must report the gap, not a bare total.
- **F2 inconsistent event**: a product whose token record (90,000 g) was
  deliberately minted short of its event record (96,000 g). The
  \`crossCheck\` reconciliation must flag the disagreement.
- **F3/F4 doctored auditor input**: the auditor's independent verifier is fed
  local copies of product 1 with an event removed (F3) and a value altered
  (F4); the untampered copy is verified clean first (F0 control).

## Results

| Check | Description | Result | Detail |
|---|---|---|---|
${checks.map((c) => `| ${c.id} | ${c.description} | ${c.pass ? "PASS" : "FAIL"} | ${c.detail} |`).join("\n")}

**Overall: ${allPass ? "ALL CHECKS PASS" : "FAILURES PRESENT - see table"}.**

## What this demonstrates

1. **Deterministic aggregation (FR3).** Two independent implementations - an
   off-chain recomputation and the on-chain view - agree to the gram on every
   product and every stage. Any auditor can reproduce the total without
   trusting the aggregator.
2. **Traceability (FR6).** Every event resolves to a named, registered actor.
3. **Completeness is a first-class result, not an assumption.** The system
   distinguishes a complete lifecycle (product 1) from incomplete ones
   (product 2, F1) and says so.
4. **Faults raise flags, not wrong answers.** A missing stage is reported as
   missing (F1); a token/event disagreement is reported as a reconciliation
   error with both figures (F2); an auditor fed doctored data detects it
   at the exact event (F3, F4). At no point does the system return a total
   unaccompanied by the flag that disqualifies it.

## Notes and limitations

- Fault products ${f1Product} and ${f2Product} remain on the ledger by design
  (immutability); they are labelled as fault-injection artefacts in their
  descriptions and excluded from any footprint claims.
- Emission factors remain placeholders (SOURCE NEEDED); Study B evaluates
  arithmetic and integrity properties, which are independent of factor values.
`;
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, "study-b-results.md"), md);
  fs.writeFileSync(path.join(RESULTS_DIR, "study-b-results.json"),
    JSON.stringify({ allPass, checks }, null, 2));
  console.log(`\nOverall: ${allPass ? "ALL CHECKS PASS" : "FAILURES PRESENT"}`);
  console.log("Saved: evaluation/results/study-b-results.md and .json");
  if (!allPass) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
