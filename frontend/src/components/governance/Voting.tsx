import { Interface } from "ethers";
import { useEffect, useState } from "react";
import Button from "../../shared/Button";
import Stage from "../../shared/Stage";
import { EMISSION_FACTORS } from "../../services/emissionFactors";
import { eventRegistryForControl, multisigForControl, controlSigner } from "../../services/controlContracts";
import { ACCOUNT_CHANGE_EVENT, getSelectedRole } from "../../services/getSigner";

type VoteTab = "pending" | "history";
type Tx = { id: bigint; data: string; executed: boolean; confirmations: bigint; eventOwner: string };
type EventRecord = { index: bigint; stageId: bigint; activityUnit: string; co2eGrams: bigint };
type Proposal = { tx: Tx; event: EventRecord; activity: number; factor: number; reason: string; voted: boolean; rejected: boolean };
const rejectionKey = (address: string) => `voting-rejections-${address.toLowerCase()}`;

export default function Voting() {
  const [tab, setTab] = useState<VoteTab>("pending");
  const [role, setRole] = useState(getSelectedRole());
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [busy, setBusy] = useState<bigint | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    try {
      const signer = controlSigner();
      const address = (await signer.getAddress()).toLowerCase();
      const rejected = new Set<string>(JSON.parse(localStorage.getItem(rejectionKey(address)) ?? "[]"));
      const registry = eventRegistryForControl();
      const count = await registry.eventCount(1);
      const events: EventRecord[] = [];
      for (let index = 0n; index < count; index++) events.push({ index, ...(await registry.eventAt(1, index)) });
      const multisig = multisigForControl();
      const total = await multisig.transactionCount();
      const decoder = new Interface(["function correctEvent(uint256,uint256,uint256,int256,string,bytes32)"]);
      const next: Proposal[] = [];
      for (let id = 0n; id < total; id++) {
        const tx = { id, ...(await multisig.transactionAt(id)) } as Tx;
        if (tx.executed) continue;
        try {
          const args = decoder.decodeFunctionData("correctEvent", tx.data);
          const event = events.find((item) => item.index === BigInt(args[1].toString()));
          if (!event) continue;
          next.push({ tx, event, activity: Number(args[2]) / 1000, factor: Number(args[3]) / 1000, reason: String(args[4]), voted: await multisig.confirmedBy(id, address), rejected: rejected.has(String(id)) });
        } catch { /* Ignore non-correction multisig transactions. */ }
      }
      setProposals(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load voting data."); }
  };
  useEffect(() => { const sync = () => { setRole(getSelectedRole()); void load(); }; window.addEventListener(ACCOUNT_CHANGE_EVENT, sync); void load(); return () => window.removeEventListener(ACCOUNT_CHANGE_EVENT, sync); }, [role]);
  const accept = async (proposal: Proposal) => { setBusy(proposal.tx.id); setError(""); try { const multisig = multisigForControl(); const call = await multisig.confirm(proposal.tx.id); await call.wait(); const threshold = await multisig.required(); if (proposal.tx.confirmations + 1n >= BigInt(threshold)) { const executeCall = await multisig.execute(proposal.tx.id); await executeCall.wait(); setMessage("Correction accepted and recorded on chain."); } else { setMessage("Vote accepted. Waiting for the second approval."); } await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Vote failed."); } finally { setBusy(null); } };
  const reject = (proposal: Proposal) => { const address = controlSigner().address.toLowerCase(); const key = rejectionKey(address); const values = JSON.parse(localStorage.getItem(key) ?? "[]") as string[]; localStorage.setItem(key, JSON.stringify([...new Set([...values, String(proposal.tx.id)])])); setMessage("Vote rejected for this account."); void load(); };
  const visible = tab === "pending" ? proposals.filter((item) => !item.voted && !item.rejected) : proposals.filter((item) => item.voted || item.rejected);
  return <><div className="page-heading"><div><div className="kicker">Lifecycle Control</div><h1>Voting</h1></div><p>{role} account voting record</p></div><div className="result-tabs control-tabs"><button className={tab === "pending" ? "active" : ""} onClick={() => setTab("pending")}>Pending Votes</button><button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>Voting History</button></div>{message && <p className="feedback success">{message}</p>}{error && <p className="feedback error">{error}</p>}<section className="panel"><h2>{tab === "pending" ? "Pending Votes" : "Voting History"}</h2>{visible.length === 0 && <p>No votes to display for this account.</p>}<div className="audit-corrections">{visible.map((proposal) => { const stage = EMISSION_FACTORS.stages.find((item) => item.stageId === Number(proposal.event.stageId)); if (!stage) return null; return <div className="correction-card" key={String(proposal.tx.id)}><Stage stageId={Number(proposal.event.stageId)} title={stage.name} owner={stage.actorRole} activity={`${proposal.activity} ${proposal.event.activityUnit}`} emissionFactor={`${proposal.factor} gCO2e per ${proposal.event.activityUnit}`} emissionSchema={stage.methodology} co2eKg={Number(proposal.event.co2eGrams) / 1000} reportingStandard={stage.methodology} eventIndex={Number(proposal.event.index)} previousEvent={proposal.event.index > 0n ? `event-${proposal.event.index - 1n}` : null} reason={proposal.reason} editable={false} canRecord={false} onRecord={() => undefined} /><div className="action-row">{tab === "pending" ? <><Button disabled={busy === proposal.tx.id} onClick={() => void accept(proposal)}>{busy === proposal.tx.id ? "Accepting..." : "Accept"}</Button><Button variant="secondary" disabled={busy !== null} onClick={() => reject(proposal)}>Reject</Button></> : <span className={`status ${proposal.rejected ? "threshold" : "ready"}`}>{proposal.rejected ? "REJECTED" : "ACCEPTED"}</span>}</div></div>; })}</div></section></>;
}
