import { Contract, JsonRpcProvider, type Signer, Wallet } from "ethers";
import { CONTRACT_ADDRESSES } from "../services/contractAddresses";
import { NETWORK_CONFIG } from "../services/networkConfig";

const BESU_URL = "http://127.0.0.1:8545";

const provider = new JsonRpcProvider(BESU_URL, NETWORK_CONFIG.chainId);

interface ContractAddresses {
  participantRegistry: string;
  emissionEventRegistry: string;
  carbonToken: string;
  aggregationContract: string;
  ontologyRegistry: string;
  consortiumMultisig: string;
  governanceModule: string;
}

function getContract(
  name: keyof ContractAddresses,
  abi: string[],
  signer?: Signer,
) {
  return new Contract(CONTRACT_ADDRESSES[name], abi, signer ?? provider);
}

export function getParticipantRegistryContract(abi: string[], signer?: Wallet) {
  return getContract("participantRegistry", abi, signer);
}
export function getEmissionEventRegistryContract(
  abi: string[],
  signer?: Wallet,
) {
  return getContract("emissionEventRegistry", abi, signer);
}
export function getCarbonTokenContract(abi: string[], signer?: Wallet) {
  return getContract("carbonToken", abi, signer);
}
export function getAggregationContract(abi: string[], signer?: Wallet) {
  return getContract("aggregationContract", abi, signer);
}
export function getOntologyRegistryContract(abi: string[], signer?: Wallet) {
  return getContract("ontologyRegistry", abi, signer);
}
export function getConsortiumMultisigContract(abi: string[], signer?: Wallet) {
  return getContract("consortiumMultisig", abi, signer);
}
export function getGovernanceModuleContract(abi: string[], signer?: Wallet) {
  return getContract("governanceModule", abi, signer);
}
