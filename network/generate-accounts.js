// One-time setup: generates the simulated participants' accounts.
// Run:  node network/generate-accounts.js
// Writes network/accounts.json. SIMULATION KEYS ONLY — these control no real
// funds and are committed to git deliberately so the artefact is reproducible.
const { Wallet } = require("ethers");
const fs = require("fs");
const path = require("path");

const roles = [
  "deployer",        // deploys contracts, administers roles (consortium admin)
  "smelter",         // stage 1  — aluminium casing
  "pcbSupplier",     // stage 2  — circuit board
  "batteryMaker",    // stage 3  — battery
  "screenSupplier",  // stage 4  — screen
  "oem",             // stages 5–6 — assembly, packaging
  "logistics",       // stage 7  — international shipping
  "usePhaseAgent",   // stage 8  — use-phase electricity
  "repairer",        // stage 9  — repair / refurbishment
  "recycler",        // stage 10 — e-waste recycling
  "auditor",         // read/verify; regulator role
];

const accounts = roles.map((role) => {
  const w = Wallet.createRandom();
  return { role, address: w.address, privateKey: w.privateKey };
});

const outFile = path.join(__dirname, "accounts.json");
fs.writeFileSync(outFile, JSON.stringify(accounts, null, 2));
console.log(`Wrote ${accounts.length} accounts to ${outFile}`);
for (const a of accounts) console.log(`${a.role.padEnd(15)} ${a.address}`);
