import { Interface } from "ethers";
import { useEffect, useRef, useState } from "react";
import Button from "../../shared/Button";
import Stage from "../../shared/Stage";
import { loadEmissionFactorsDirect, type EmissionFactorLibrary } from "../../services/supplyChainIpfs";
import { EVENT_REGISTRY_ABI, eventRegistryForControl, multisigForControl, controlSigner, loadStageThresholdsFromChainOrIpfs } from "../../services/controlContracts";
import { getEmissionEventRegistryContract } from "../../hooks/useContracts";
import { getSigner } from "../../services/getSigner";
import { ACCOUNT_CHANGE_EVENT, getSelectedRole } from "../../services/getSigner";
import EvidenceModal from "../../shared/EvidenceModal";

type Tx = { id: bigint; data: string; executed: boolean; voteCount: bigint; status?: number; eventOwner?: string };
type EventRecord = { productId: bigint; index: bigint; stageId: bigint; activityUnit: string; co2eGrams: bigint };
type Proposal = { tx: Tx; event: EventRecord; activity: number; factor: number; reason: string; evidenceHash: string; evidenceAvailable: boolean; voted: boolean; rejected: boolean; thresholdKg: number };

export default function Voting() {
  const [role, setRole] = useState(getSelectedRole());
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [busy, setBusy] = useState<bigint | null>(null);
  const [busyAction, setBusyAction] = useState<"accept" | "reject" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [factors, setFactors] = useState<EmissionFactorLibrary>();
  const [viewingEvidence, setViewingEvidence] = useState<string>();
  const loadGeneration = useRef(0);

  const load = async () => {
    const generation = ++loadGeneration.current;
    setMessage("");
    setError("");
    try {
      const signer = controlSigner();
      const address = (await signer.getAddress()).toLowerCase();
      const registry = eventRegistryForControl();
      const multisig = multisigForControl();
      const ownerCount = Number(await multisig.ownerCount());
      const authorizedOwners = new Set<string>();
      for (let ownerIndex = 0; ownerIndex < ownerCount; ownerIndex++) {
        authorizedOwners.add((await multisig.owners(ownerIndex)).toLowerCase());
      }
      const deployerOwner = (await multisig.deployerOwner()).toLowerCase();
      const auditorOwner = (await multisig.auditorOwner()).toLowerCase();
      const total = await multisig.transactionCount();
      const decoder = new Interface(["function correctEvent(uint256,uint256,uint256,int256,string,bytes32)"]);
      const escalationDecoder = new Interface(["function raiseEscalation(uint256,uint256,string,bytes32)"]);
      const next: Proposal[] = [];
      for (let id = 0n; id < total; id++) {
        let raw = await multisig.transactionAt(id);
        if (Number(raw[4]) === 1 && !Boolean(raw[2])) {
          await (await multisig.execute(id)).wait();
          raw = await multisig.transactionAt(id);
        }
        const tx = {
          id,
          data: String(raw[1]),
          executed: Boolean(raw[2]),
          voteCount: BigInt(raw[3].toString()),
          status: Number(raw[4]),
          eventOwner: String(raw[5]),
        } as Tx;
        try {
          const args = decoder.decodeFunctionData("correctEvent", tx.data);
          const proposalProductId = BigInt(args[0].toString());
          const eventIndex = BigInt(args[1].toString());
          const eventOwner = String(raw[5]).toLowerCase();
          const eligible = authorizedOwners.has(address) && (eventOwner === address || address === deployerOwner || address === auditorOwner);
          if (!eligible) continue;
          const rawEvent = await registry.eventAt(proposalProductId, eventIndex);
          const event = {
            productId: BigInt(rawEvent[0].toString()),
            index: eventIndex,
            stageId: BigInt(rawEvent[1].toString()),
            activityUnit: String(rawEvent[4]),
            co2eGrams: BigInt(rawEvent[7].toString()),
          } as EventRecord;
          const thresholdKg = (await loadStageThresholdsFromChainOrIpfs([Number(rawEvent[1])]))[Number(rawEvent[1])] ?? 0;
          let decision = 0;
          try { decision = Number(await multisig.voteStatus(id, address)); } catch { /* Legacy deployments have no per-voter status; show the pending proposal. */ }
          next.push({ tx, event, activity: Number(args[2]) / 1000, factor: Number(args[3]) / 1000, reason: String(args[4]), evidenceHash: String(args[5]), evidenceAvailable: false, voted: decision !== 0, rejected: decision === 2, thresholdKg });
        } catch (cause) {
          // Escalation proposals are handled by Governance, not the correction vote cards.
          try {
            escalationDecoder.decodeFunctionData("raiseEscalation", tx.data);
            continue;
          } catch {
            const detail = cause instanceof Error ? cause.message : "Unknown proposal error";
            setError((current) => current || `Unable to load proposal #${id}: ${detail}`);
          }
        }
      }
      const verified = await Promise.all(next.map(async (proposal) => {
        if (proposal.evidenceHash === `0x${"00".repeat(32)}`) return proposal;
        try {
          const response = await fetch(`/api/documents/by-original-hash/${encodeURIComponent(proposal.evidenceHash)}`);
          if (!response.ok) return { ...proposal, evidenceAvailable: false, evidenceHash: "" };
          const document = await response.json() as { originalHash?: string };
          const matches = String(document.originalHash).toLowerCase() === proposal.evidenceHash.toLowerCase();
          return { ...proposal, evidenceAvailable: matches, evidenceHash: matches ? proposal.evidenceHash : "" };
        } catch {
          return { ...proposal, evidenceAvailable: false, evidenceHash: "" };
        }
      }));
      if (generation === loadGeneration.current) setProposals(verified);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load voting data."); }
  };
  useEffect(() => { void loadEmissionFactorsDirect().then(setFactors).catch(() => setFactors(undefined)); }, []);
  useEffect(() => { const sync = () => { setRole(getSelectedRole()); setMessage(""); setError(""); }; window.addEventListener(ACCOUNT_CHANGE_EVENT, sync); void load(); return () => window.removeEventListener(ACCOUNT_CHANGE_EVENT, sync); }, [role]);
  const accept = async (proposal: Proposal) => { setBusy(proposal.tx.id); setBusyAction("accept"); setError(""); try { const multisig = multisigForControl(); const call = await multisig.vote(proposal.tx.id, 1); await call.wait(); const updated = await multisig.transactionAt(proposal.tx.id); if (BigInt(updated.voteCount.toString()) === 3n && Number(updated.status) === 1) { const executeCall = await multisig.execute(proposal.tx.id); await executeCall.wait(); setMessage("Proposal accepted and recorded on chain."); } else { setMessage("Vote accepted. Waiting for more approvals."); } await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Vote failed."); } finally { setBusy(null); setBusyAction(null); } };
  const reject = async (proposal: Proposal) => { setBusy(proposal.tx.id); setBusyAction("reject"); setError(""); try { const multisig = multisigForControl(); const call = await multisig.vote(proposal.tx.id, 2); await call.wait(); const updated = await multisig.transactionAt(proposal.tx.id); if (Number(updated.status) === 2) { const decoder = new Interface(["function correctEvent(uint256,uint256,uint256,int256,string,bytes32)"]); const args = decoder.decodeFunctionData("correctEvent", proposal.tx.data); await (await getEmissionEventRegistryContract(EVENT_REGISTRY_ABI, getSigner("auditor")).setAuditStatus(args[0], args[1], 2)).wait(); setMessage("Proposal rejected and recorded on chain."); } else { setMessage("Vote rejected. Waiting for remaining votes."); } await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Vote failed."); } finally { setBusy(null); setBusyAction(null); } };
  const visible = proposals.filter((item) => !item.voted && !item.rejected && item.tx.status !== 1 && item.tx.status !== 2 && !item.tx.executed);
 return <><div className="page-heading"><div><div className="kicker">Lifecycle Control</div><h1>Voting</h1></div></div><div className="result-tabs control-tabs"><button className="active">Vote</button></div>{message && <p className="feedback success">{message}</p>}{error && <p className="feedback error">{error}</p>}<section className="panel"><h2>Vote</h2>{visible.length === 0 && <p>No votes to display for this account.</p>}<div className="audit-corrections">{visible.map((proposal) => { const stage = factors?.stages.find((item) => item.stageId === Number(proposal.event.stageId)) ?? { name: `Stage ${String(proposal.event.stageId)}`, actorRole: "Unknown owner", methodology: "On-chain correction proposal" }; return <div className="correction-card" key={String(proposal.tx.id)}><Stage stageId={Number(proposal.event.stageId)} title={stage.name} owner={stage.actorRole} activity={`${proposal.activity} ${proposal.event.activityUnit}`} emissionFactor={`${proposal.factor} gCO2e per ${proposal.event.activityUnit}`} emissionSchema={stage.methodology} co2eKg={Number(proposal.event.co2eGrams) / 1000} thresholdKg={proposal.thresholdKg} reportingStandard={stage.methodology} eventIndex={Number(proposal.event.index)} previousEvent={proposal.event.index > 0n ? `event-${proposal.event.index - 1n}` : null} reason={proposal.reason} evidence={proposal.evidenceAvailable ? <button type="button" className="evidence-link" onClick={() => setViewingEvidence(proposal.evidenceHash)}>evidence</button> : null} editable={false} canRecord={false} onRecord={() => undefined} /><div className="action-row"><Button disabled={busy !== null || proposal.voted || proposal.rejected} onClick={() => void accept(proposal)}>{busy === proposal.tx.id && busyAction === "accept" ? "Accepting..." : proposal.rejected ? "Rejected" : proposal.voted ? "Accepted" : "Accept"}</Button><Button variant="secondary" disabled={busy !== null || proposal.voted || proposal.rejected} onClick={() => void reject(proposal)}>{busy === proposal.tx.id && busyAction === "reject" ? "Rejecting..." : "Reject"}</Button></div></div>; })}</div></section>{viewingEvidence && <EvidenceModal evidenceHash={viewingEvidence} onClose={() => setViewingEvidence(undefined)} />}</>;
}
