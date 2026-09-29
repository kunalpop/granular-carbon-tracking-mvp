import { Interface } from "ethers";
import { useEffect, useState } from "react";
import { formatAddress, formatGrams, governanceForControl, multisigForControl } from "../../services/controlContracts";

type ProposalOutcome = {
  id: bigint;
  productId: bigint;
  eventIndex: bigint;
  reason: string;
  status: number;
  executed: boolean;
  votes: string[];
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

  useEffect(() => {
    const load = async () => {
      try {
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
        setCorrections(result.reverse());

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
              if (decision === 1) votes.push(`${formatAddress(owner)} approved`);
              if (decision === 2) votes.push(`${formatAddress(owner)} rejected`);
            }
            outcomes.push({ id: BigInt(transactionId), productId: BigInt(args[0].toString()), eventIndex: BigInt(args[1].toString()), reason: String(args[4]), status: Number(raw[4]), executed: Boolean(raw[2]), votes });
          } catch {
            // Ignore non-correction multisig transactions.
          }
        }
        setProposals(outcomes.reverse());
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
          <p>Corrections that were executed after multisig approval.</p>
        </div>
      </div>
      {error && <p className="feedback error" role="alert">{error}</p>}
      {loading && <p>Loading audit history...</p>}
      {!loading && corrections.length === 0 && proposals.length === 0 && !error && <p>No proposals or approved corrections recorded.</p>}
      <div className="audit-corrections">
        {proposals.map((proposal) => (
          <article className="audit-row" key={`proposal-${String(proposal.id)}`}>
            <div>
              <span className="card-id">PROPOSAL #{String(proposal.id)}</span>
              <strong>Event {String(proposal.eventIndex)} · {proposal.reason}</strong>
              <small>{proposal.votes.length ? proposal.votes.join(" · ") : "No votes recorded"}</small>
            </div>
            <span className={`status ${proposal.executed ? "ready" : proposal.status === 2 ? "threshold" : ""}`}>
              {proposal.executed ? "APPROVED · EXECUTED" : proposal.status === 2 ? "REJECTED" : `PENDING · ${proposal.votes.length} VOTE${proposal.votes.length === 1 ? "" : "S"}`}
            </span>
          </article>
        ))}
        {corrections.map((correction) => (
          <article className="audit-row" key={correction.id}>
            <div>
              <span className="card-id">CORRECTION #{correction.id}</span>
              <strong>Event {String(correction.originalIndex ?? 0n)} · {formatGrams(correction.correctedCo2eGrams)}</strong>
              <small>{correction.reason} · approved by {formatAddress(correction.correctedBy)}</small>
            </div>
            <span className="status ready">APPROVED</span>
          </article>
        ))}
      </div>
    </section>
  );
}
