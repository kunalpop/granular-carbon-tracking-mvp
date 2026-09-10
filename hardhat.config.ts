import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as fs from "fs";
import * as path from "path";

// The 11 simulated actors (network/accounts.json) become the signers on the
// "besu" network, in file order: deployer, smelter, pcbSupplier, batteryMaker,
// screenSupplier, oem, logistics, usePhaseAgent, repairer, recycler, auditor.
function besuAccounts(): string[] {
  try {
    const raw = fs.readFileSync(
      path.join(__dirname, "network", "accounts.json"),
      "utf8",
    );
    return JSON.parse(raw).map((a: { privateKey: string }) => a.privateKey);
  } catch {
    return [];
  }
}

// OpenZeppelin 5.x requires the "cancun" EVM (it uses the mcopy opcode).
// The Besu network genesis must therefore enable the Cancun fork (Phase 1).
const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
      // The EmissionEvent struct has too many fields for the legacy
      // compilation pipeline ("stack too deep"); the IR pipeline handles it.
      viaIR: true,
    },
  },
  networks: {
    // The local Besu QBFT network (Phase 1). Hardhat's built-in in-memory
    // network is used for unit tests and needs no entry here.
    besu: {
      // 127.0.0.1 (not localhost): Node resolves localhost to IPv6 first,
      // and Docker's IPv6 forwarding drops connections under bursts.
      url: "http://127.0.0.1:8545",
      chainId: 2026,
      accounts: besuAccounts(),
    },
    // Study C comparison network (7 validators, fresh chain, same chainId).
    besu7: {
      url: "http://127.0.0.1:9545",
      chainId: 2026,
      accounts: besuAccounts(),
    },
  },
};

export default config;
