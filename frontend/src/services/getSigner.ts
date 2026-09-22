import { JsonRpcProvider, Wallet } from "ethers";
import accounts from "../../../network/accounts.json";
import { NETWORK_CONFIG } from "./networkConfig";

const provider = new JsonRpcProvider(
  NETWORK_CONFIG.url,
  NETWORK_CONFIG.chainId,
);

export type AccountRole = (typeof accounts)[number]["role"];

export function getSigner(role: AccountRole): Wallet {
  const account = accounts.find((candidate) => candidate.role === role);
  if (!account) throw new Error(`No account configured for role ${role}`);

  const signer = new Wallet(account.privateKey, provider);
  if (signer.address.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(`Signer address mismatch for role ${role}`);
  }

  return signer;
}
