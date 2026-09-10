// Deploys the full contract suite to the Besu network and records the
// addresses for the simulation and audit tools.
// Run:  npx hardhat run simulation/deploy.ts --network besu
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const accounts = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "network", "accounts.json"), "utf8")
  ) as { role: string; address: string }[];
  const addrOf = (role: string) => {
    const a = accounts.find((x) => x.role === role);
    if (!a) throw new Error(`No account for role ${role}`);
    return a.address;
  };

  console.log(`Deploying from ${deployer.address} to chain 2026 (Besu)...`);

  const participants = await ethers.deployContract("ParticipantRegistry", [deployer.address]);
  await participants.waitForDeployment();
  console.log(`ParticipantRegistry    ${participants.target}`);

  const events = await ethers.deployContract("EmissionEventRegistry", [participants.target]);
  await events.waitForDeployment();
  console.log(`EmissionEventRegistry  ${events.target}`);

  const token = await ethers.deployContract("CarbonToken", [deployer.address]);
  await token.waitForDeployment();
  console.log(`CarbonToken            ${token.target}`);

  const aggregator = await ethers.deployContract("AggregationContract", [events.target, token.target]);
  await aggregator.waitForDeployment();
  console.log(`AggregationContract    ${aggregator.target}`);

  const ontology = await ethers.deployContract("OntologyRegistry", [deployer.address]);
  await ontology.waitForDeployment();
  console.log(`OntologyRegistry       ${ontology.target}`);

  // 2-of-3 consortium multisig: deployer + auditor + OEM jointly control upgrades.
  const multisig = await ethers.deployContract("ConsortiumMultisig", [
    [deployer.address, addrOf("auditor"), addrOf("oem")],
    2n,
  ]);
  await multisig.waitForDeployment();
  console.log(`ConsortiumMultisig     ${multisig.target}`);

  const impl = await ethers.deployContract("GovernanceModule");
  await impl.waitForDeployment();
  const initData = impl.interface.encodeFunctionData("initialize", [
    deployer.address,
    events.target,
    multisig.target,
  ]);
  const proxy = await ethers.deployContract("ERC1967Proxy", [impl.target, initData]);
  await proxy.waitForDeployment();
  const governance = await ethers.getContractAt("GovernanceModule", proxy.target as string);
  console.log(`GovernanceModule       ${proxy.target} (impl ${impl.target})`);

  await (await governance.grantRole(await governance.CORRECTOR_ROLE(), addrOf("auditor"))).wait();
  await (await governance.grantRole(await governance.AUDITOR_ROLE(), addrOf("auditor"))).wait();
  console.log(`Corrector/auditor roles granted to ${addrOf("auditor")}`);

  // Pin schema 1.0.0 in the ontology: hash of the actual schema document.
  const schemaPath = path.join(__dirname, "schema", "emission-event-schema-1.0.0.json");
  const schemaHash = ethers.keccak256(fs.readFileSync(schemaPath));
  await (
    await ontology.registerSchema("1.0.0", schemaHash, "simulation/schema/emission-event-schema-1.0.0.json")
  ).wait();
  console.log(`Schema 1.0.0 registered (hash ${schemaHash.slice(0, 18)}...)`);

  const deployedAt = await ethers.provider.getBlockNumber();
  const out = {
    chainId: 2026,
    deployedAtBlock: deployedAt,
    addresses: {
      ParticipantRegistry: participants.target,
      EmissionEventRegistry: events.target,
      CarbonToken: token.target,
      AggregationContract: aggregator.target,
      OntologyRegistry: ontology.target,
      ConsortiumMultisig: multisig.target,
      GovernanceModule: proxy.target,
      GovernanceModuleImplementation: impl.target,
    },
  };
  const outPath = path.join(__dirname, "deployed-addresses.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\nAddresses written to ${outPath} (deployed at block ${deployedAt})`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
