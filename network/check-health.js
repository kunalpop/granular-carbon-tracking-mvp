// Network health check.
//   node network/check-health.js          - read-only checks
//   node network/check-health.js --full   - also test account permissioning
//                                           by sending real transactions
const { JsonRpcProvider, Wallet } = require("ethers");
const fs = require("fs");
const path = require("path");

const NODES = [
  { name: "validator1", url: "http://localhost:8545" },
  { name: "validator2", url: "http://localhost:8546" },
  { name: "validator3", url: "http://localhost:8547" },
  { name: "validator4", url: "http://localhost:8548" },
  { name: "regulator ", url: "http://localhost:8549" },
];

async function rpc(url, method, params = []) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

async function main() {
  let ok = true;

  console.log("=== Node status (block height should be equal-ish and rising) ===");
  for (const n of NODES) {
    try {
      const [block, peers, chainId] = await Promise.all([
        rpc(n.url, "eth_blockNumber"),
        rpc(n.url, "net_peerCount"),
        rpc(n.url, "eth_chainId"),
      ]);
      console.log(
        `${n.name}  block #${parseInt(block, 16)}  peers ${parseInt(peers, 16)}/4  chainId ${parseInt(chainId, 16)}`
      );
      if (parseInt(peers, 16) < 4) ok = false;
    } catch (e) {
      ok = false;
      console.log(`${n.name}  UNREACHABLE (${e.message}) — is the network up?`);
    }
  }

  console.log("\n=== QBFT validator set (must list exactly the 4 validators) ===");
  const validators = await rpc(NODES[0].url, "qbft_getValidatorsByBlockNumber", ["latest"]);
  validators.forEach((v) => console.log(`  ${v}`));
  if (validators.length !== 4) ok = false;

  console.log("\n=== Finality (QBFT is immediate: no fork, heights converge) ===");
  const h1 = await rpc(NODES[0].url, "eth_blockNumber");
  await new Promise((r) => setTimeout(r, 2500));
  const h2 = await rpc(NODES[0].url, "eth_blockNumber");
  const advancing = parseInt(h2, 16) > parseInt(h1, 16);
  console.log(`  chain advancing: ${advancing} (#${parseInt(h1, 16)} -> #${parseInt(h2, 16)})`);
  if (!advancing) ok = false;

  if (process.argv.includes("--full")) {
    console.log("\n=== Account permissioning (sends real transactions) ===");
    const provider = new JsonRpcProvider(NODES[0].url, undefined, { polling: true, pollingInterval: 500 });
    const accounts = JSON.parse(
      fs.readFileSync(path.join(__dirname, "accounts.json"), "utf8")
    );
    const deployer = new Wallet(
      accounts.find((a) => a.role === "deployer").privateKey,
      provider
    );

    // 1. Allow-listed account: transfer must be accepted and mined.
    const tx = await deployer.sendTransaction({
      to: accounts.find((a) => a.role === "auditor").address,
      value: 0n,
      gasPrice: 0n,
    });
    const receipt = await tx.wait();
    console.log(`  allow-listed deployer tx: MINED in block #${receipt.blockNumber} (expected)`);

    // 2. Stranger account: node must refuse the transaction.
    const stranger = Wallet.createRandom().connect(provider);
    try {
      await stranger.sendTransaction({ to: deployer.address, value: 0n, gasPrice: 0n });
      console.log("  stranger tx: ACCEPTED — PERMISSIONING IS BROKEN");
      ok = false;
    } catch (e) {
      console.log(`  stranger tx: REJECTED (expected) — "${e.shortMessage || e.message}"`);
    }
    provider.destroy();
  }

  console.log(ok ? "\nHEALTHY" : "\nPROBLEMS FOUND");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(`Health check failed: ${e.message}`);
  process.exit(1);
});
