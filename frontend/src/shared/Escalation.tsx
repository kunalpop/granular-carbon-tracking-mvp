import Button from "./Button";
import { formatGrams } from "../services/controlContracts";
import { accountName } from "../services/getSigner";

export type EscalationCardRecord = {
  id: bigint;
  productId: bigint;
  eventIndex: bigint;
  co2eGrams: bigint;
  thresholdGrams: bigint;
  reason: string;
  raisedBy: string;
  timestamp: bigint;
};

export default function Escalation({
  escalation,
  comment,
  busy,
  onCommentChange,
  onResolve,
}: {
  escalation: EscalationCardRecord;
  comment: string;
  busy: boolean;
  onCommentChange: (comment: string) => void;
  onResolve: () => void;
}) {
  const { id, productId, eventIndex, co2eGrams, thresholdGrams, reason, raisedBy, timestamp } = escalation;
  return (
    <article className="escalation-card">
      <div className="escalation-card__content">
        <div className="escalation-card__header">
          <span className="card-id">ESCALATION #{String(id + 1n)}</span>
          <strong>Product {String(productId)} · Event {String(eventIndex)}</strong>
        </div>
        <div className="escalation-card__meta">
          <span><b>Reported CO₂e</b>{formatGrams(co2eGrams)}</span>
          <span><b>Threshold</b>{thresholdGrams > 0n ? formatGrams(thresholdGrams) : "Manual review"}</span>
          <span><b>Raised by</b>{accountName(raisedBy)}</span>
          <span><b>Raised on</b>{new Date(Number(timestamp) * 1000).toLocaleString()}</span>
        </div>
        <div className="escalation-card__reason"><b>Reason</b><p>{reason}</p></div>
        <label className="field escalation-comment">
          <span>Resolution comment</span>
          <textarea value={comment} onChange={(event) => onCommentChange(event.target.value)} placeholder="Explain the review outcome" required />
        </label>
      </div>
      <div className="escalation-card__action">
        <Button type="button" disabled={busy || !comment.trim()} onClick={onResolve}>Resolve</Button>
      </div>
    </article>
  );
}
