import { JsonRpcProvider, Wallet } from "ethers";
import accounts from "../../../network/accounts.json";
import { NETWORK_CONFIG } from "./networkConfig";

const provider = new JsonRpcProvider(
  NETWORK_CONFIG.url,
  NETWORK_CONFIG.chainId,
);

export type AccountRole = (typeof accounts)[number]["role"];

export const ACCOUNT_OPTIONS = accounts.map((account) => ({
  role: account.role as AccountRole,
  address: account.address,
}));

export const ACCOUNT_CHANGE_EVENT = "control-account-change";
export const SELECTED_ACCOUNT_KEY = "selected-control-account";

export function getSelectedRole(): AccountRole {
  if (typeof window === "undefined") return "deployer" as AccountRole;
  const saved = window.localStorage.getItem(SELECTED_ACCOUNT_KEY);
  return (saved ?? "deployer") as AccountRole;
}

export function getSigner(role: AccountRole): Wallet {
  const account = accounts.find((candidate) => candidate.role === role);
  if (!account) throw new Error(`No account configured for role ${role}`);

  const signer = new Wallet(account.privateKey, provider);
  if (signer.address.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(`Signer address mismatch for role ${role}`);
  }

  return signer;
}
