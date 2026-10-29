import { Interface } from "ethers";
import { useEffect, useState } from "react";
import { governanceForControl, multisigForControl } from "../../services/controlContracts";
import { accountRoleName } from "../../services/getSigner";
import EvidenceModal from "../../shared/EvidenceModal";

const SELECTED_PRODUCT_KEY = "selected-product-id";
function selectedProductId(): string {
  const selected = window.localStorage.getItem(SELECTED_PRODUCT_KEY);
  return selected && selected !== "new" ? selected : "1";
}

type ProposalOutcome = {
  id: bigint;
  productId: bigint;
  eventIndex: bigint;
  reason: string;
  status: number;
  executed: boolean;
  votes: string[];
  evidenceHash: string;
  evidenceAvailable: boolean;
};

type Correction = {
  id: number;
  productId: bigint;
  originalIndex: bigint;
  correctedActivityData: bigint;
  correctedEmissionFactor: bigint;
  correctedCo2eGrams: bigint;
  reason: string;
  correctedBy: string;
  timestamp: bigint;
};

export default function AuditHistory() {
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [proposals, setProposals] = useState<ProposalOutcome[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [viewingEvidence, setViewingEvidence] = useState<string>();

  useEffect(() => {
    const load = async () => {
      try {
        const selectedId = BigInt(selectedProductId());
        const governance = governanceForControl();
        const count = Number(await governance.correctionCount());
        const result: Correction[] = [];
        for (let id = 1; id <= count; id++) {
          const correction = await governance.correctionAt(id);
          result.push({
            id,
            productId: correction.productId,
            originalIndex: correction.originalIndex,
            correctedActivityData: correction.correctedActivityData,
            correctedEmissionFactor: correction.correctedEmissionFactor,
            correctedCo2eGrams: correction.correctedCo2eGrams,
            reason: correction.reason,
            correctedBy: correction.correctedBy,
            timestamp: correction.timestamp,
          });
        }
        setCorrections(result.filter((correction) => correction.productId === selectedId && accountRoleName(correction.correctedBy) !== "deployer").reverse());

        const multisig = multisigForControl();
        const decoder = new Interface(["function correctEvent(uint256,uint256,uint256,int256,string,bytes32)"]);
        const ownerCount = Number(await multisig.ownerCount());
        const owners: string[] = [];
        for (let ownerIndex = 0; ownerIndex < ownerCount; ownerIndex++) owners.push(await multisig.owners(ownerIndex));
        const transactionCount = Number(await multisig.transactionCount());
        const outcomes: ProposalOutcome[] = [];
        for (let transactionId = 0; transactionId < transactionCount; transactionId++) {
          const raw = await multisig.transactionAt(transactionId);
          try {
            const args = decoder.decodeFunctionData("correctEvent", String(raw[1]));
            const votes: string[] = [];
            for (const owner of owners) {
              const decision = Number(await multisig.voteStatus(transactionId, owner));
              if (decision === 1) votes.push(`${accountRoleName(owner)} approved`);
              if (decision === 2) votes.push(`${accountRoleName(owner)} rejected`);
            }
            const status = Number(raw[4]);
            const executed = Boolean(raw[2]);
            if (status === 0 && !executed) continue;
            const proposalProductId = BigInt(args[0].toString());
            if (proposalProductId !== selectedId) continue;
            if (String(args[4]) === "Deployer event edit") continue;
            outcomes.push({ id: BigInt(transactionId), productId: proposalProductId, eventIndex: BigInt(args[1].toString()), reason: String(args[4]), status, executed, votes, evidenceHash: String(args[5]), evidenceAvailable: false });
          } catch {
            // Ignore non-correction multisig transactions.
          }
        }
        const verified = await Promise.all(outcomes.map(async (proposal) => {
          if (proposal.evidenceHash === `0x${"00".repeat(32)}`) return proposal;
          try {
            const response = await fetch(`/api/documents/by-original-hash/${encodeURIComponent(proposal.evidenceHash)}`);
            if (!response.ok) return { ...proposal, evidenceAvailable: false };
            const document = await response.json() as { originalHash?: string };
            return { ...proposal, evidenceAvailable: String(document.originalHash).toLowerCase() === proposal.evidenceHash.toLowerCase() };
          } catch {
            return proposal;
          }
        }));
        setProposals(verified.reverse());
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to load audit history.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <section className="panel">
      <div className="form-heading">
        <div>
          <h2>Audit History</h2>
        </div>
      </div>
      {error && <p className="feedback error" role="alert">{error}</p>}
      {loading && <p>Loading audit history...</p>}
      {!loading && corrections.length === 0 && proposals.length === 0 && !error && <p>No proposals or approved corrections recorded.</p>}
      <div className="audit-corrections audit-history-table">
        <div className="audit-history-header" aria-hidden="true">
          <span>Proposal</span>
          <span>Reason</span>
          <span>Evidence</span>
          <span>Voting</span>
          <span>Status</span>
        </div>
        {proposals.map((proposal) => (
          <article className="audit-row" key={`proposal-${String(proposal.id)}`}>
            <div>
              <span className="card-id">PROPOSAL #{String(proposal.id)}</span>
            </div>
            <strong>Event {String(proposal.eventIndex + 1n)} · {proposal.reason}</strong>
            {proposal.evidenceAvailable ? <button
              type="button"
              className="evidence-link history-evidence-link"
              onClick={() => {
                setViewingEvidence(proposal.evidenceHash);
              }}
            >evidence</button> : <span aria-hidden="true" />}
            <small className="approval-list">
              {proposal.votes.map((vote) => (
                <span
                  className={`approval-vote ${vote.endsWith("approved") ? "approved" : vote.endsWith("rejected") ? "rejected" : "not-voted"}`}
                  key={vote}
                >
                  {vote}
                </span>
              ))}
            </small>
            <span className={`status ${proposal.executed ? "ready" : proposal.status === 2 ? "threshold" : ""}`}>
              {proposal.executed ? "APPROVED" : proposal.status === 2 ? "REJECTED" : "PENDING"}
            </span>
          </article>
        ))}
      </div>
      {viewingEvidence && <EvidenceModal evidenceHash={viewingEvidence} onClose={() => setViewingEvidence(undefined)} />}
    </section>
  );
}
