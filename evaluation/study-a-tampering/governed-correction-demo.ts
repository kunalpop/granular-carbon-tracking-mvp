// Study A companion: exercise the LEGITIMATE governed-correction pathway
// (DP4) on the live network, on the sacrificial Study A product (id 2).
// The auditor (CORRECTOR_ROLE) corrects event 0 (stage 1, 96,000 g) to a
// re-metered 11.5 kg (92,000 g). The original record must remain intact.
// Run:  npx hardhat run evaluation/study-a-tampering/governed-correction-demo.ts --network besu
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.join(__dirname, "..", "..");
const PRODUCT = 2n;

async function main() {
  const deployed = JSON.parse(
    fs.readFileSync(path.join(ROOT, "simulation", "deployed-addresses.json"), "utf8"));
  const accounts = JSON.parse(
    fs.readFileSync(path.join(ROOT, "network", "accounts.json"), "utf8")) as { role: string }[];
  const signers = await ethers.getSigners();
  const auditor = signers[accounts.findIndex((a) => a.role === "auditor")];

  const events = await ethers.getContractAt(
    "EmissionEventRegistry", deployed.addresses.EmissionEventRegistry);
  const governance = await ethers.getContractAt(
    "GovernanceModule", deployed.addresses.GovernanceModule);

  const before = await events.eventAt(PRODUCT, 0);
  const rawBefore = await governance.effectiveProductTotal(PRODUCT);
  console.log(`Before: event 0 = ${before.co2eGrams} g (hash ${before.eventHash.slice(0, 12)}...), effective total ${rawBefore} g`);

  const tx = await governance.connect(auditor).correctEvent(
    PRODUCT, 0, 11_500n, 8_000_000n,
    "Study A governed-correction exercise: smelter meter re-read; activity corrected 12.0 kg -> 11.5 kg against simulated invoice",
    ethers.keccak256(ethers.toUtf8Bytes("simulated-invoice-4411.pdf")));
  const rc = await tx.wait();
  console.log(`CorrectionLogged in block ${rc!.blockNumber}, by ${auditor.address}`);

  const after = await events.eventAt(PRODUCT, 0);
  const [chainOk] = await events.verifyChain(PRODUCT);
  const corrId = await governance.latestCorrectionId(PRODUCT, 0);
  const corr = await governance.correctionAt(corrId);
  const effAfter = await governance.effectiveProductTotal(PRODUCT);

  console.log(`Original untouched: co2e ${after.co2eGrams} g, hash unchanged ${after.eventHash === before.eventHash}, chain intact ${chainOk}`);
  console.log(`Correction #${corrId}: ${corr.correctedCo2eGrams} g, by ${corr.correctedBy}, cross-ref ${corr.originalEventHash.slice(0, 12)}...`);
  console.log(`Effective total: ${rawBefore} g -> ${effAfter} g (raw total unchanged)`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
