// The laptop lifecycle simulation (chapter plan section X.6).
// Registers the supply-chain actors, walks one laptop through the ten
// lifecycle stages — each emission event signed by the CORRECT actor —
// mints/burns the carbon tokens, and prints the product carbon passport.
// Run:  npx hardhat run simulation/run-lifecycle.ts --network besu
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const SCALE = 1000n; // fixed-point x1000, matching the contracts

export type Stage = {
  stageId: number;
  name: string;
  actorRole: string;
  activityValue: number;
  activityUnit: string;
  emissionFactor_gCO2ePerUnit: number;
  efSource: string;
  methodology: string;
  notes: string;
};

async function main() {
  // ---------- wiring ----------
  const deployed = JSON.parse(
    fs.readFileSync(path.join(__dirname, "deployed-addresses.json"), "utf8"),
  );
  // Stage data comes from emission-factors.json by default, or from an
  // alternate lifecycle file (e.g. the SYNTHETIC generator's output) via the
  // LIFECYCLE_FILE environment variable.
  const lifecycleFile = process.env.LIFECYCLE_FILE
    ? path.resolve(process.env.LIFECYCLE_FILE)
    : path.join(__dirname, "emission-factors.json");
  const factors = JSON.parse(fs.readFileSync(lifecycleFile, "utf8"));
  console.log(`Lifecycle data: ${lifecycleFile}`);
  const accounts = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "network", "accounts.json"),
      "utf8",
    ),
  ) as { role: string; address: string }[];
  const signers = await ethers.getSigners();
  const signerFor = (role: string) => {
    const i = accounts.findIndex((a) => a.role === role);
    if (i < 0) throw new Error(`no account for role ${role}`);
    if (signers[i].address !== accounts[i].address) {
      throw new Error(
        `signer order mismatch for ${role} — check hardhat.config.ts`,
      );
    }
    return signers[i];
  };
  const admin = signerFor("deployer");

  const participants = await ethers.getContractAt(
    "ParticipantRegistry",
    deployed.addresses.ParticipantRegistry,
    admin,
  );
  const events = await ethers.getContractAt(
    "EmissionEventRegistry",
    deployed.addresses.EmissionEventRegistry,
    admin,
  );
  const token = await ethers.getContractAt(
    "CarbonToken",
    deployed.addresses.CarbonToken,
    admin,
  );
  const aggregator = await ethers.getContractAt(
    "AggregationContract",
    deployed.addresses.AggregationContract,
    admin,
  );

  // ---------- 1. register actors and stage permissions (idempotent) ----------
  console.log("=== 1. Registering supply-chain actors ===");
  const actorNames: Record<string, string> = {
    smelter: "AluCo Primary Smelting",
    pcbSupplier: "Shenzhen PCB Works",
    batteryMaker: "CellTech Batteries",
    screenSupplier: "PanelView Displays",
    oem: "LaptopCorp Assembly",
    logistics: "BlueWater Freight",
    usePhaseAgent: "Corporate IT (use phase)",
    repairer: "FixIt Refurbishment",
    recycler: "GreenLoop Recycling",
    auditor: "Consortium Auditor",
  };
  const stages: Stage[] = factors.stages;
  const rolesNeedingStages = new Map<string, number[]>();
  for (const s of stages) {
    rolesNeedingStages.set(s.actorRole, [
      ...(rolesNeedingStages.get(s.actorRole) ?? []),
      s.stageId,
    ]);
  }
  for (const [role, name] of Object.entries(actorNames)) {
    const addr = signerFor(role).address;
    if (!(await participants.isRegistered(addr))) {
      await (await participants.registerParticipant(addr, name, role)).wait();
      console.log(`  registered ${role.padEnd(14)} ${name}`);
    }
    for (const stageId of rolesNeedingStages.get(role) ?? []) {
      if (!(await participants.canWriteStage(addr, stageId))) {
        await (await participants.authoriseStage(addr, stageId)).wait();
        console.log(`  authorised ${role.padEnd(14)} for stage ${stageId}`);
      }
    }
  }

  // ---------- 2. create the product and mint its passport ----------
  let productId = 1n;
  while (await events.productExists(productId)) productId++;
  const description = `Laptop unit CMVP-${String(productId).padStart(
    3,
    "0",
  )} (${factors.referenceProduct})`;

  console.log(`\n=== 2. Product genesis: id ${productId} ===`);
  const oem = signerFor("oem");
  await (
    await events.connect(oem).createProduct(productId, description)
  ).wait();
  await (await token.mintPassport(productId, oem.address)).wait();
  console.log(`  passport NFT minted to OEM (${oem.address})`);

  // ---------- 3. the ten lifecycle stages ----------
  console.log("\n=== 3. Lifecycle: recording one emission event per stage ===");
  const evidenceDir = path.join(__dirname, "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });

  for (const s of stages) {
    const actor = signerFor(s.actorRole);
    // Hybrid hash architecture (DP1): the bulky evidence lives OFF-chain;
    // only its keccak256 fingerprint goes into the event.
    const evidence = {
      product: description,
      stageId: s.stageId,
      stage: s.name,
      reportedBy: actorNames[s.actorRole],
      activity: `${s.activityValue} ${s.activityUnit}`,
      emissionFactor: `${s.emissionFactor_gCO2ePerUnit} gCO2e per ${s.activityUnit}`,
      efSource: s.efSource,
      note: "Simulated evidence document standing in for a meter reading / invoice / weighbridge ticket.",
    };
    const evidencePath = path.join(
      evidenceDir,
      `product-${productId}-stage-${String(s.stageId).padStart(2, "0")}.json`,
    );
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
    const evidenceHash = ethers.keccak256(fs.readFileSync(evidencePath));

    const activityScaled = BigInt(Math.round(s.activityValue * 1000));
    const efScaled = BigInt(Math.round(s.emissionFactor_gCO2ePerUnit * 1000));

    await (
      await events
        .connect(actor)
        .recordEvent(
          productId,
          s.stageId,
          activityScaled,
          s.activityUnit,
          efScaled,
          s.efSource,
          s.methodology,
          evidenceHash,
          factors.schemaVersion,
        )
    ).wait();

    const idx = (await events.eventCount(productId)) - 1n;
    const rec = await events.eventAt(productId, idx);

    // Token mirror: mint grams for emissions, burn for credits (to/from the
    // passport holder, the OEM).
    if (rec.co2eGrams > 0n) {
      await (
        await token.mintCarbon(productId, oem.address, rec.co2eGrams)
      ).wait();
    } else if (rec.co2eGrams < 0n) {
      await (
        await token.burnCarbon(productId, oem.address, -rec.co2eGrams)
      ).wait();
    }

    const kg = (Number(rec.co2eGrams) / 1000).toFixed(2).padStart(8);
    console.log(
      `  stage ${String(s.stageId).padStart(2)} ${s.name.padEnd(24)} ` +
        `${s.actorRole.padEnd(14)} ${kg} kg CO2e  evidence ${evidenceHash.slice(
          0,
          10,
        )}...`,
    );
  }

  // ---------- 4. the product carbon passport ----------
  console.log("\n=== 4. PRODUCT CARBON PASSPORT ===");
  const allEvents = await events.getEvents(productId);
  const total = await aggregator.productTotal(productId);
  const [eventTotal, tokenNet, consistent] = await aggregator.crossCheck(
    productId,
  );
  const [chainOk] = await events.verifyChain(productId);
  const complete = await aggregator.isComplete(productId);

  const passport = {
    productId: productId.toString(),
    description,
    passportHolder: oem.address,
    chainId: deployed.chainId,
    contracts: deployed.addresses,
    stages: [] as object[],
    totals: {
      productTotal_kgCO2e: Number(total) / 1000,
      tokenNet_kgCO2e: Number(tokenNet) / 1000,
      crossCheckConsistent: consistent,
      hashChainVerified: chainOk,
      allTenStagesPresent: complete,
    },
    dataQualityWarning:
      factors._DATA_STATUS ??
      "ALL EMISSION FACTORS ARE PLACEHOLDERS (SOURCE NEEDED) - see simulation/emission-factors.json",
  };

  console.log(`  Product:        ${description}`);
  console.log(`  Passport NFT:   id ${productId}, held by ${oem.address}`);
  console.log(
    "  ------------------------------------------------------------------------------",
  );
  console.log(
    "  #  Stage                     Actor                         kg CO2e   Event hash",
  );
  for (let i = 0; i < allEvents.length; i++) {
    const e = allEvents[i];
    const stageMeta = stages.find((s) => BigInt(s.stageId) === e.stageId)!;
    const p = await participants.getParticipant(e.actor);
    passport.stages.push({
      stageId: Number(e.stageId),
      stage: stageMeta.name,
      actor: { address: e.actor, name: p.name, role: p.organisationRole },
      activity: `${Number(e.activityData) / 1000} ${e.activityUnit}`,
      emissionFactor_gPerUnit: Number(e.emissionFactor) / 1000,
      efSource: e.efSource,
      methodology: e.methodology,
      co2e_kg: Number(e.co2eGrams) / 1000,
      evidenceHash: e.evidenceHash,
      prevEventHash: e.prevEventHash,
      eventHash: e.eventHash,
      timestamp: new Date(Number(e.timestamp) * 1000).toISOString(),
      schemaVersion: e.schemaVersion,
    });
    console.log(
      `  ${String(e.stageId).padStart(2)} ${stageMeta.name.padEnd(25)} ` +
        `${p.name.padEnd(28)} ${(Number(e.co2eGrams) / 1000)
          .toFixed(2)
          .padStart(8)}   ` +
        `${e.eventHash.slice(0, 12)}...`,
    );
  }
  console.log(
    "  ------------------------------------------------------------------------------",
  );
  console.log(
    `  TOTAL FOOTPRINT:      ${(Number(total) / 1000).toFixed(2)} kg CO2e`,
  );
  console.log(
    `  Token cross-check:    ${(Number(tokenNet) / 1000).toFixed(
      2,
    )} kg CO2e -> ${consistent ? "CONSISTENT" : "MISMATCH"}`,
  );
  console.log(`  Hash chain verified:  ${chainOk}`);
  console.log(`  All 10 stages:        ${complete}`);
  console.log(
    `  DATA QUALITY:         ${(
      factors._DATA_STATUS ?? "placeholder emission factors (SOURCE NEEDED)"
    ).slice(0, 110)}...`,
  );

  const outDir = path.join(__dirname, "output");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `passport-product-${productId}.json`);
  fs.writeFileSync(outPath, JSON.stringify(passport, null, 2));
  console.log(`\n  Passport saved to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
