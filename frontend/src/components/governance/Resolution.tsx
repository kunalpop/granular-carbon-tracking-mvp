import { useState } from "react";
import Button from "../../shared/Button";
import EvidenceModal from "../../shared/EvidenceModal";
import { formatGrams } from "../../services/controlContracts";
import { accountRoleName } from "../../services/getSigner";
import type { EscalationCardRecord } from "../../shared/Escalation";

type ResolutionProps = {
  escalation: EscalationCardRecord & { resolved: boolean; resolvedAt: bigint };
  displayNumber?: number;
  comment: string;
  busy: boolean;
  onCommentChange: (comment: string) => void;
  onResolve: () => void;
};

export default function Resolution({ escalation, displayNumber, comment, busy, onCommentChange, onResolve }: ResolutionProps) {
  const [viewingEvidence, setViewingEvidence] = useState(false);
  const lastModified = escalation.resolved && escalation.resolvedAt > 0n
    ? escalation.resolvedAt
    : escalation.timestamp;

  return (
    <article className="resolution-card">
      <div className="resolution-card-header">
        <span className="card-id">ESCALATION #{displayNumber ?? Number(escalation.id + 1n)}</span>
        <strong>Event {String(escalation.eventIndex + 1n)}</strong>
      </div>
      <div className="resolution-card-grid">
        <div><span>Product</span><strong>{String(escalation.productId)}</strong></div>
        <div><span>CO₂e</span><strong>{formatGrams(escalation.co2eGrams)}</strong></div>
        <div><span>Threshold</span><strong>{escalation.thresholdGrams > 0n ? formatGrams(escalation.thresholdGrams) : "Manual review"}</strong></div>
        <div><span>Raised By</span><strong>{accountRoleName(escalation.raisedBy)}</strong></div>
        <div><span>Last Modified</span><strong>{new Date(Number(lastModified) * 1000).toLocaleString()}</strong></div>
        <div><span>Status</span><strong className={escalation.resolved ? "status ready" : "status threshold"}>{escalation.resolved ? "Resolved" : "Pending"}</strong></div>
      </div>
      <div className="resolution-card-field"><span>Reason</span><p>{escalation.reason}</p></div>
      <div className="resolution-card-field"><span>Evidence</span>{escalation.evidenceHash && escalation.evidenceHash !== `0x${"00".repeat(32)}` ? <button type="button" className="evidence-link" onClick={() => setViewingEvidence(true)}>evidence</button> : <span aria-hidden="true" />}</div>
      {!escalation.resolved && <div className="resolution-card-actions">
        <label className="field">
          <span>Resolution comment</span>
          <textarea value={comment} onChange={(event) => onCommentChange(event.target.value)} placeholder="Explain the review outcome" required />
        </label>
        <Button type="button" disabled={busy || !comment.trim()} onClick={onResolve}>{busy ? "Resolving..." : "Resolve"}</Button>
      </div>}
      {viewingEvidence && <EvidenceModal evidenceHash={escalation.evidenceHash} onClose={() => setViewingEvidence(false)} />}
    </article>
  );
}
