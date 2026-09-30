import { useEffect, useState } from "react";
import Button from "../../shared/Button";
import Corrections from "./Corrections";
import AuditHistory from "./AuditHistory";
import {
  eventRegistryForControl,
  formatAddress,
  formatGrams,
  governanceForControl,
} from "../../services/controlContracts";
import {
  ACCOUNT_CHANGE_EVENT,
  getSelectedRole,
  getSigner,
} from "../../services/getSigner";

type AuditTab = "corrections" | "escalations" | "history";
type Escalation = {
  productId: bigint;
  eventIndex: bigint;
  co2eGrams: bigint;
  thresholdGrams: bigint;
  reason: string;
  raisedBy: string;
  timestamp: bigint;
  resolved: boolean;
  resolvedAt: bigint;
};

const defaultProductId = () => {
  try {
    return window.localStorage.getItem("selected-product-id") ?? "1";
  } catch {
    return "1";
  }
};

export default function Audit({ initialTab = "corrections" }: { initialTab?: AuditTab }) {
  const initialAuditTab = initialTab;
  const [tab, setTab] = useState<AuditTab>(initialAuditTab);
  const [productId, setProductId] = useState(defaultProductId);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [role, setRole] = useState(getSelectedRole());
  const [error, setError] = useState("");

  const loadEscalations = async () => {
    try {
      const governance = governanceForControl();
      const count = await governance.escalationCount();
      const next: Escalation[] = [];
      for (let index = 0n; index < count; index++) {
        const escalation = await governance.escalationAt(index);
        const resolved = Boolean(await governance.escalationResolved(index));
        let resolvedAt = 0n;
        try {
          resolvedAt = await governance.escalationResolvedAt(index);
        } catch {
          // Older deployments do not expose the resolution timestamp getter.
        }
        next.push({
          productId: escalation[0],
          eventIndex: escalation[1],
          co2eGrams: escalation[2],
          thresholdGrams: escalation[3],
          reason: escalation[4],
          raisedBy: escalation[5],
          timestamp: escalation[6],
          resolved,
          resolvedAt,
        });
      }
      setEscalations(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load audit data.");
    }
  };

  useEffect(() => {
    const sync = () => setRole(getSelectedRole());
    window.addEventListener(ACCOUNT_CHANGE_EVENT, sync);
    void loadEscalations();
    return () => window.removeEventListener(ACCOUNT_CHANGE_EVENT, sync);
  }, [role]);


  return (
    <>
      <div className="page-heading">
        <div>
          <div className="kicker">Lifecycle Control</div>
          <h1>{initialTab === "escalations" ? "Escalations" : "Audit"}</h1>
        </div>
      </div>
      {error && <p className="feedback error" role="alert">{error}</p>}
      <div className="control-toolbar">
        <label className="field compact-field">
          <span>Product ID</span>
          <input
            value={productId}
            onChange={(event) => setProductId(event.target.value)}
            inputMode="numeric"
          />
        </label>
        <span className="status ready">{role} signer active</span>
      </div>
      {initialTab !== "escalations" && <div
        className="result-tabs control-tabs"
        role="tablist"
        aria-label="Audit actions"
      >
        <button
          className={tab === "corrections" ? "active" : ""}
          onClick={() => setTab("corrections")}
        >
          Tasks
        </button>
        <button
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          History
        </button>
      </div>}
      {tab === "corrections" && <Corrections />}
      {tab === "escalations" && (<>
        <EscalationForm productId={productId} onSubmitted={loadEscalations} />
        <EscalationList escalations={escalations} currentAddress={getSigner(role).address} />
      </>)}
      {tab === "history" && <AuditHistory />}
    </>
  );
}


function EscalationForm({
  productId,
  onSubmitted,
}: {
  productId: string;
  onSubmitted: () => Promise<void>;
}) {
  const [eventIndex, setEventIndex] = useState("");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "submitted">("idle");
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!eventIndex.trim() || !reason.trim()) return;
    setStatus("submitting");
    setError("");
    try {
      if (!/^\d+$/.test(eventIndex.trim())) {
        throw new Error("Event index must be a non-negative integer.");
      }

      const index = BigInt(eventIndex.trim());
      const eventCount = await eventRegistryForControl().eventCount(productId);
      if (index >= eventCount) {
        throw new Error(
          eventCount === 0n
            ? `Product ${productId} has no recorded events.`
            : `Event index ${index} is out of range. Product ${productId} has ${eventCount} recorded event${eventCount === 1n ? "" : "s"} (valid indexes: 0–${eventCount - 1n}).`,
        );
      }

      const transaction = await governanceForControl().raiseEscalation(productId, eventIndex, reason);
      await transaction.wait();
      setStatus("submitted");
      setEventIndex("");
      setReason("");
      await onSubmitted();
    } catch (cause) {
      setStatus("idle");
      setError(cause instanceof Error ? cause.message : "Escalation submission failed.");
    }
  };

  return (
    <form className="panel control-form escalation-form" onSubmit={submit}>
      <div className="form-heading">
        <div>
          <h2>Raise escalation</h2>
          <p>Submit an investigation reason for a recorded event.</p>
        </div>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Event Index</span>
          <input value={eventIndex} onChange={(input) => setEventIndex(input.target.value)} inputMode="numeric" required />
        </label>
        <label className="field field-wide">
          <span>Reason</span>
          <textarea value={reason} onChange={(input) => setReason(input.target.value)} placeholder="Describe the issue" required />
        </label>
      </div>
      {error && <p className="feedback error" role="alert">{error}</p>}
      <div className="action-row">
        <Button type="submit" disabled={status === "submitting"}>
          {status === "submitting" ? "Submitting..." : status === "submitted" ? "Submitted" : "Submit"}
        </Button>
      </div>
    </form>
  );
}

function EscalationList({
  escalations,
  currentAddress,
}: {
  escalations: Escalation[];
  currentAddress: string;
}) {
  const accountEscalations = escalations.filter(
    (item) => item.raisedBy.toLowerCase() === currentAddress.toLowerCase(),
  );
  return (
    <section className="panel">
      <div className="form-heading">
        <div>
          <h2>Escalation log</h2>
          <p>Automatic and manual escalations are immutable audit records.</p>
        </div>
      </div>
      {accountEscalations.length === 0 && (
        <p>No escalations recorded by the current account.</p>
      )}
      {accountEscalations.map((item, index) => (
        <div
          className="audit-row"
          key={`${String(item.eventIndex ?? 0n)}-${index}`}
        >
          <div>
            <span className="card-id">ESCALATION #{index + 1}</span>
            <strong>
              Event {String(item.eventIndex ?? 0n)} · {formatGrams(item.co2eGrams)}
            </strong>
            <small>
              {item.reason} · raised by {formatAddress(item.raisedBy)} · {new Date(Number(item.timestamp) * 1000).toLocaleString()}
            </small>
            {item.resolved && <small>Resolved on chain{item.resolvedAt > 0n ? ` · ${new Date(Number(item.resolvedAt) * 1000).toLocaleString()}` : " · timestamp unavailable on this deployment"}</small>}
          </div>
          <span className={item.resolved ? "status ready" : "status threshold"}>
            {item.resolved ? "Resolved" : "Pending"}
          </span>
        </div>
      ))}
    </section>
  );
}
