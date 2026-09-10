// One-command build of the 7-validator comparison network (Study C).
// Generates 7 fresh validator keypairs with ethers, obtains the QBFT
// extraData via `besu rlp encode` (the operator generate-blockchain-config
// tool is unreliable on Windows bind mounts), assembles the genesis from the
// main network's genesis, and emits permissioning + docker-compose.
// Run:  node evaluation/study-c-performance/setup-network7.js
// Then: docker compose -f network/network7/docker-compose.yml up -d
const { Wallet, SigningKey } = require("ethers");
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DOCKER = process.env.DOCKER_EXE ??
  "C:\\Users\\Silve\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe";
const ROOT = path.join(__dirname, "..", "..");
const N7 = path.join(ROOT, "network", "network7");

// 1. seven fresh keypairs
const addrs = [];
for (let n = 1; n <= 7; n++) {
  const dir = path.join(N7, "nodes", `validator${n}`);
  fs.mkdirSync(dir, { recursive: true });
  const w = Wallet.createRandom();
  fs.writeFileSync(path.join(dir, "key"), w.privateKey);
  fs.writeFileSync(path.join(dir, "key.pub"),
    "0x" + SigningKey.computePublicKey(w.privateKey, false).slice(4));
  fs.writeFileSync(path.join(dir, "address.txt"), w.address);
  addrs.push(w.address);
}
fs.writeFileSync(path.join(N7, "toEncode.json"), JSON.stringify(addrs));
console.log("7 validator keypairs generated.");

// 2. extraData via besu rlp encode
const res = spawnSync(DOCKER, [
  "run", "--rm", "-v", `${N7}:/config`, "hyperledger/besu:latest",
  "rlp", "encode", "--from=/config/toEncode.json", "--type=QBFT_EXTRA_DATA",
], { encoding: "utf8" });
const extraData = (res.stdout || "").trim().split("\n").pop();
if (!/^0x[0-9a-f]+$/.test(extraData)) {
  throw new Error(`rlp encode failed: ${res.stderr || res.stdout}`);
}
console.log("extraData encoded.");

// 3. genesis = main network genesis + new validator set
const genesis = JSON.parse(fs.readFileSync(path.join(ROOT, "network", "genesis.json"), "utf8"));
genesis.extraData = extraData;
fs.writeFileSync(path.join(N7, "genesis.json"), JSON.stringify(genesis, null, 2));

// 4. permissioning + compose
require("./make-network7.js");
console.log("Done. Start with: docker compose -f network/network7/docker-compose.yml up -d");
