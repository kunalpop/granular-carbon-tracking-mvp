import { useEffect, useState } from "react";
import { formatAddress, formatGrams, governanceForControl } from "../../services/controlContracts";

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
      {!loading && corrections.length === 0 && !error && <p>No approved corrections recorded.</p>}
      <div className="audit-corrections">
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
