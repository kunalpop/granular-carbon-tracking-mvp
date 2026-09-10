// Builds the 7-validator comparison network's permissioning and compose file
// from the ethers-generated keys in network/network7/nodes/validator1..7
// (genesis.json is assembled separately from the main network's genesis plus
// `besu rlp encode` extraData). Ports 9545-9551 / subnet 172.26.0.0/24.
const fs = require("fs");
const path = require("path");

const N7 = path.join(__dirname, "..", "..", "network", "network7");
const accounts = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "network", "accounts.json"), "utf8"));

const enodes = [];
for (let n = 1; n <= 7; n++) {
  const pub = fs.readFileSync(
    path.join(N7, "nodes", `validator${n}`, "key.pub"), "utf8").trim().replace(/^0x/, "");
  enodes.push(`enode://${pub}@172.26.0.${10 + n}:30303`);
}

fs.writeFileSync(path.join(N7, "permissions_config.toml"),
  `nodes-allowlist=${JSON.stringify(enodes)}\n` +
  `accounts-allowlist=${JSON.stringify(accounts.map((a) => a.address.toLowerCase()))}\n`);

const service = (n) => `
  validator${n}:
    image: hyperledger/besu:latest
    container_name: carbon7-validator${n}
    environment: { BESU_OPTS: "-Xmx640m" }
    command: >-
      --genesis-file=/config/genesis.json
      --node-private-key-file=/keys/key
      --data-path=/data
      --p2p-host=172.26.0.${10 + n}
      --bootnodes=${enodes.join(",")}
      --permissions-nodes-config-file-enabled
      --permissions-nodes-config-file=/config/permissions_config.toml
      --permissions-accounts-config-file-enabled
      --permissions-accounts-config-file=/config/permissions_config.toml
      --rpc-http-enabled
      --rpc-http-host=0.0.0.0
      --rpc-http-api=ETH,NET,WEB3,QBFT,ADMIN,PERM,TXPOOL
      --rpc-http-cors-origins=all
      --host-allowlist=*
      --min-gas-price=0
    volumes:
      - ./genesis.json:/config/genesis.json:ro
      - ./permissions_config.toml:/config/permissions_config.toml
      - ./nodes/validator${n}:/keys:ro
      - validator7_${n}-data:/data
    ports:
      - "${9544 + n}:8545"
    networks:
      carbon7-net:
        ipv4_address: 172.26.0.${10 + n}
`;

const compose = `# Study C comparison network: 7 QBFT validators (fresh chain).
services:
${Array.from({ length: 7 }, (_, i) => service(i + 1)).join("")}
networks:
  carbon7-net:
    driver: bridge
    ipam:
      config:
        - subnet: 172.26.0.0/24

volumes:
${Array.from({ length: 7 }, (_, i) => `  validator7_${i + 1}-data:`).join("\n")}
`;
fs.writeFileSync(path.join(N7, "docker-compose.yml"), compose);
console.log("network7 ready: genesis, 7 node keys, permissions, docker-compose (ports 9545-9551).");
