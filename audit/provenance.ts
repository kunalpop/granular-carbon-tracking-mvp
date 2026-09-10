// Auditor's provenance reconstruction and integrity check (FR6; Layer 5).
// Trusts NOTHING it can recompute: every event hash, every hash-chain link,
// every CO2e figure, and the total are re-derived off-chain from raw ledger
// data, then compared against the on-chain aggregator and token supply.
//
// Run (audits every product):        npm run audit
// Run (one product, PowerShell):     $env:PRODUCT_ID="1"; npm run audit
// Outputs: console report + audit/output/audit-product-<id>.{json,html}
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const CHECK = { pass: "PASS", fail: "FAIL", warn: "WARN" } as const;
type Verdict = (typeof CHECK)[keyof typeof CHECK];

function recomputeEventHash(e: {
  productId: bigint; stageId: bigint; actor: string; activityData: bigint;
  activityUnit: string; emissionFactor: bigint; efSource: string;
  co2eGrams: bigint; methodology: string; evidenceHash: string;
  prevEventHash: string; timestamp: bigint; schemaVersion: string;
}): string {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  return ethers.keccak256(
    coder.encode(
      ["uint256", "uint8", "address", "uint256", "string", "int256",
       "string", "int256", "string", "bytes32", "bytes32", "uint64", "string"],
      [e.productId, e.stageId, e.actor, e.activityData, e.activityUnit,
       e.emissionFactor, e.efSource, e.co2eGrams, e.methodology,
       e.evidenceHash, e.prevEventHash, e.timestamp, e.schemaVersion]
    )
  );
}

function esc(s: unknown): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function auditProduct(productId: bigint, contracts: any) {
  const { events, participants, aggregator, token, governance } = contracts;
  const product = await events.getProduct(productId);
  const evs = await events.getEvents(productId);

  const report: any = {
    productId: productId.toString(),
    description: product.description,
    createdBy: product.createdBy,
    auditedAtBlock: await ethers.provider.getBlockNumber(),
    events: [],
    checks: {},
    corrections: [],
    escalations: [],
  };

  // ---- per-event verification, fully recomputed off-chain ----
  let prevHash = ethers.ZeroHash;
  let independentTotal = 0n;
  let hashChainOk = true;
  let co2eOk = true;
  let evidenceMismatch = 0;
  let evidenceMissing = 0;

  for (let i = 0; i < evs.length; i++) {
    const e = evs[i];
    const p = await participants.getParticipant(e.actor);

    const linkOk = e.prevEventHash === prevHash;
    const recomputedHash = recomputeEventHash(e);
    const hashOk = recomputedHash === e.eventHash;
    if (!linkOk || !hashOk) hashChainOk = false;

    // Solidity int division truncates toward zero; BigInt does the same.
    const expectedCo2e = (e.activityData * e.emissionFactor) / 1_000_000n;
    const co2eMatch = expectedCo2e === e.co2eGrams;
    if (!co2eMatch) co2eOk = false;

    // Hybrid hash architecture: check the off-chain evidence document.
    const evidencePath = path.join(
      __dirname, "..", "simulation", "evidence",
      `product-${productId}-stage-${String(e.stageId).padStart(2, "0")}.json`);
    let evidenceStatus = "MISSING (off-chain file not found)";
    if (fs.existsSync(evidencePath)) {
      const fileHash = ethers.keccak256(fs.readFileSync(evidencePath));
      if (fileHash === e.evidenceHash) evidenceStatus = "VERIFIED";
      else { evidenceStatus = "MISMATCH (file altered after anchoring!)"; evidenceMismatch++; }
    } else evidenceMissing++;

    independentTotal += e.co2eGrams;
    prevHash = e.eventHash;

    report.events.push({
      index: i,
      stageId: Number(e.stageId),
      actor: { address: e.actor, name: p.name, role: p.organisationRole },
      recordedAt: new Date(Number(e.timestamp) * 1000).toISOString(),
      activity: `${Number(e.activityData) / 1000} ${e.activityUnit}`,
      emissionFactor_gPerUnit: Number(e.emissionFactor) / 1000,
      efSource: e.efSource,
      methodology: e.methodology,
      co2e_kg: Number(e.co2eGrams) / 1000,
      checks: {
        hashRecomputed: hashOk ? CHECK.pass : CHECK.fail,
        chainLink: linkOk ? CHECK.pass : CHECK.fail,
        co2eRecomputed: co2eMatch ? CHECK.pass : CHECK.fail,
        evidence: evidenceStatus,
      },
      eventHash: e.eventHash,
      prevEventHash: e.prevEventHash,
      evidenceHash: e.evidenceHash,
    });
  }

  // ---- ledger-level checks ----
  const headOk = prevHash === (await events.lastEventHash(productId));
  const onChainTotal = await aggregator.productTotal(productId);
  const [, tokenNet, tokenConsistent] = await aggregator.crossCheck(productId);
  const [onChainVerify] = await events.verifyChain(productId);
  const complete = await aggregator.isComplete(productId);

  // ---- governed corrections (DP4) and escalations (DP5) ----
  const nCorr = await governance.correctionCount();
  for (let id = 1n; id <= nCorr; id++) {
    const c = await governance.correctionAt(id);
    if (c.productId !== productId) continue;
    report.corrections.push({
      correctionId: Number(id),
      correctsEventIndex: Number(c.originalIndex),
      originalEventHash: c.originalEventHash,
      correctedCo2e_kg: Number(c.correctedCo2eGrams) / 1000,
      reason: c.reason,
      correctedBy: c.correctedBy,
      at: new Date(Number(c.timestamp) * 1000).toISOString(),
      supersedesCorrectionId: Number(c.supersedesCorrectionId) || null,
      isLatest: (await governance.latestCorrectionId(productId, c.originalIndex)) === id,
    });
  }
  const effectiveTotal = await governance.effectiveProductTotal(productId);
  const nEsc = await governance.escalationCount();
  for (let i = 0n; i < nEsc; i++) {
    const esc_ = await governance.escalationAt(i);
    if (esc_.productId !== productId) continue;
    report.escalations.push({
      eventIndex: Number(esc_.eventIndex),
      co2e_kg: Number(esc_.co2eGrams) / 1000,
      threshold_kg: Number(esc_.thresholdGrams) / 1000 || null,
      reason: esc_.reason,
      raisedBy: esc_.raisedBy,
      at: new Date(Number(esc_.timestamp) * 1000).toISOString(),
    });
  }

  report.checks = {
    hashChain: hashChainOk && headOk ? CHECK.pass : CHECK.fail,
    onChainVerifyChainAgrees: onChainVerify === (hashChainOk && headOk) ? CHECK.pass : CHECK.fail,
    co2eRecomputation: co2eOk ? CHECK.pass : CHECK.fail,
    totalsAgree: independentTotal === onChainTotal ? CHECK.pass : CHECK.fail,
    tokenCrossCheck: tokenConsistent ? CHECK.pass : CHECK.fail,
    evidenceFiles:
      evidenceMismatch > 0 ? CHECK.fail : evidenceMissing > 0 ? CHECK.warn : CHECK.pass,
    allTenStagesPresent: complete ? CHECK.pass : CHECK.warn,
  };
  report.totals = {
    independentlyRecomputed_kg: Number(independentTotal) / 1000,
    onChainAggregator_kg: Number(onChainTotal) / 1000,
    tokenNet_kg: Number(tokenNet) / 1000,
    effectiveWithCorrections_kg: Number(effectiveTotal) / 1000,
  };
  report.verdict = Object.values(report.checks).includes(CHECK.fail) ? "FAIL" : "PASS";
  return report;
}

function printReport(r: any) {
  const line = "-".repeat(78);
  console.log(`\n${line}`);
  console.log(`AUDIT REPORT - product ${r.productId} (at block ${r.auditedAtBlock})`);
  console.log(r.description);
  console.log(line);
  console.log("#  St Actor                        Recorded (UTC)        kg CO2e  Hash Link Evidence");
  for (const e of r.events) {
    console.log(
      `${String(e.index).padEnd(2)} ${String(e.stageId).padStart(2)} ` +
      `${(e.actor.name as string).padEnd(28)} ${e.recordedAt.slice(0, 19).replace("T", " ")} ` +
      `${e.co2e_kg.toFixed(2).padStart(8)}  ${e.checks.hashRecomputed.padEnd(4)} ` +
      `${e.checks.chainLink.padEnd(4)} ${e.checks.evidence}`);
  }
  console.log(line);
  console.log(`Totals (kg CO2e): recomputed ${r.totals.independentlyRecomputed_kg.toFixed(2)} | ` +
    `on-chain ${r.totals.onChainAggregator_kg.toFixed(2)} | ` +
    `tokens ${r.totals.tokenNet_kg.toFixed(2)} | ` +
    `effective ${r.totals.effectiveWithCorrections_kg.toFixed(2)}`);
  for (const [k, v] of Object.entries(r.checks)) console.log(`  ${k.padEnd(28)} ${v}`);
  if (r.corrections.length) {
    console.log(`Corrections (${r.corrections.length}):`);
    for (const c of r.corrections) {
      console.log(`  #${c.correctionId} on event ${c.correctsEventIndex} -> ` +
        `${c.correctedCo2e_kg} kg, "${c.reason}" by ${c.correctedBy}` +
        `${c.isLatest ? " [latest]" : " [superseded]"}`);
    }
  }
  if (r.escalations.length) {
    console.log(`Escalations (${r.escalations.length}):`);
    for (const e of r.escalations) {
      console.log(`  event ${e.eventIndex}: ${e.reason} (raised by ${e.raisedBy})`);
    }
  }
  console.log(`VERDICT: ${r.verdict}`);
}

function htmlReport(r: any): string {
  const badge = (v: string) =>
    `<span class="badge ${v === "PASS" || v === "VERIFIED" ? "ok" : v === "WARN" || v.startsWith("MISSING") ? "warn" : "bad"}">${esc(v)}</span>`;
  const rows = r.events.map((e: any) => `
    <tr>
      <td>${e.index}</td><td>${e.stageId}</td>
      <td>${esc(e.actor.name)}<br><small>${esc(e.actor.role)} · ${esc(e.actor.address)}</small></td>
      <td>${esc(e.recordedAt)}</td>
      <td>${esc(e.activity)}<br><small>${esc(e.efSource)}</small></td>
      <td class="num">${e.co2e_kg.toFixed(2)}</td>
      <td>${badge(e.checks.hashRecomputed)} ${badge(e.checks.chainLink)}<br>${badge(e.checks.evidence)}</td>
      <td><small>${esc(e.eventHash)}</small></td>
    </tr>`).join("");
  const checks = Object.entries(r.checks)
    .map(([k, v]) => `<li>${esc(k)}: ${badge(v as string)}</li>`).join("");
  const corrections = r.corrections.length
    ? `<h2>Governed corrections (${r.corrections.length})</h2><ul>` + r.corrections.map((c: any) =>
        `<li>#${c.correctionId} corrects event ${c.correctsEventIndex} to ${c.correctedCo2e_kg} kg
         - "${esc(c.reason)}" by ${esc(c.correctedBy)} at ${esc(c.at)}
         ${c.isLatest ? "<b>[latest]</b>" : "[superseded]"}</li>`).join("") + "</ul>"
    : "<h2>Governed corrections</h2><p>None recorded.</p>";
  const escalations = r.escalations.length
    ? `<h2>Escalations (${r.escalations.length})</h2><ul>` + r.escalations.map((e: any) =>
        `<li>event ${e.eventIndex}: ${esc(e.reason)} (raised by ${esc(e.raisedBy)} at ${esc(e.at)})</li>`).join("") + "</ul>"
    : "<h2>Escalations</h2><p>None raised.</p>";

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Audit report - product ${esc(r.productId)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; max-width: 70rem; }
  table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
  th, td { border: 1px solid #ccc; padding: 0.4rem; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; }
  td.num { text-align: right; }
  small { color: #666; word-break: break-all; }
  .badge { padding: 0.1rem 0.4rem; border-radius: 0.3rem; font-size: 0.75rem; font-weight: 600; }
  .ok { background: #d4f7d4; color: #145214; }
  .warn { background: #fff3cd; color: #664d03; }
  .bad { background: #f8d7da; color: #58151c; }
  .verdict { font-size: 1.2rem; }
  .warnbox { background: #fff3cd; padding: 0.8rem; border-radius: 0.4rem; margin: 1rem 0; }
</style></head><body>
<h1>Product carbon audit report</h1>
<p><b>Product ${esc(r.productId)}</b>: ${esc(r.description)}<br>
Audited at block ${esc(r.auditedAtBlock)}; every hash and total independently recomputed off-chain.</p>
<p class="verdict">Verdict: ${badge(r.verdict)}</p>
<div class="warnbox">Data quality: emission factors are PLACEHOLDERS (tagged
"SOURCE NEEDED" in each event's source field) pending DEFRA/BEIS, IEA,
ecoinvent, and manufacturer PCF citations.</div>
<h2>Totals (kg CO2e)</h2>
<ul>
  <li>Independently recomputed from events: <b>${r.totals.independentlyRecomputed_kg.toFixed(2)}</b></li>
  <li>On-chain aggregator: ${r.totals.onChainAggregator_kg.toFixed(2)}</li>
  <li>Carbon-token net supply: ${r.totals.tokenNet_kg.toFixed(2)}</li>
  <li>Effective (governed corrections applied): ${r.totals.effectiveWithCorrections_kg.toFixed(2)}</li>
</ul>
<h2>Integrity checks</h2><ul>${checks}</ul>
<h2>Provenance (${r.events.length} events)</h2>
<table><tr><th>#</th><th>Stage</th><th>Actor</th><th>Recorded (UTC)</th>
<th>Activity & factor source</th><th>kg CO2e</th><th>Checks</th><th>Event hash</th></tr>${rows}</table>
${corrections}
${escalations}
</body></html>`;
}

async function main() {
  const deployed = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "simulation", "deployed-addresses.json"), "utf8"));
  const contracts = {
    events: await ethers.getContractAt("EmissionEventRegistry", deployed.addresses.EmissionEventRegistry),
    participants: await ethers.getContractAt("ParticipantRegistry", deployed.addresses.ParticipantRegistry),
    aggregator: await ethers.getContractAt("AggregationContract", deployed.addresses.AggregationContract),
    token: await ethers.getContractAt("CarbonToken", deployed.addresses.CarbonToken),
    governance: await ethers.getContractAt("GovernanceModule", deployed.addresses.GovernanceModule),
  };

  const requested = process.env.PRODUCT_ID ? [BigInt(process.env.PRODUCT_ID)] : [];
  const productIds: bigint[] = [];
  if (requested.length) {
    for (const id of requested) {
      if (!(await contracts.events.productExists(id))) throw new Error(`Product ${id} does not exist`);
      productIds.push(id);
    }
  } else {
    for (let id = 1n; await contracts.events.productExists(id); id++) productIds.push(id);
  }
  if (!productIds.length) throw new Error("No products on the ledger. Run `npm run simulate` first.");

  const outDir = path.join(__dirname, "output");
  fs.mkdirSync(outDir, { recursive: true });
  let anyFail = false;
  for (const id of productIds) {
    const report = await auditProduct(id, contracts);
    printReport(report);
    fs.writeFileSync(
      path.join(outDir, `audit-product-${id}.json`), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(outDir, `audit-product-${id}.html`), htmlReport(report));
    console.log(`Saved: audit/output/audit-product-${id}.json and .html`);
    if (report.verdict !== "PASS") anyFail = true;
  }
  if (anyFail) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
