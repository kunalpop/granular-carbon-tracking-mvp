import { useState } from "react";

type EvidenceModalProps = {
  evidenceHash?: string;
  url?: string;
  onClose: () => void;
};

export default function EvidenceModal({ evidenceHash, url, onClose }: EvidenceModalProps) {
  const [loading, setLoading] = useState(true);
  const source = url ?? `/api/documents/by-original-hash/${encodeURIComponent(evidenceHash ?? "")}/plain-file`;

  return (
    <div className="evidence-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="evidence-modal" role="dialog" aria-modal="true" aria-label="evidence" onClick={(event) => event.stopPropagation()}>
        <div className="evidence-modal-heading">
          <strong>evidence</strong>
          <button type="button" className="evidence-modal-close" onClick={onClose} aria-label="Close evidence viewer">×</button>
        </div>
        <div className="evidence-modal-body">
          {loading && <p className="evidence-modal-loading">Loading...</p>}
          <iframe className="evidence-modal-content" src={source} title="evidence" onLoad={() => setLoading(false)} />
        </div>
      </section>
    </div>
  );
}
