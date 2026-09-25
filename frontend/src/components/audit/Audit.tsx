import { Interface } from "ethers";
import { useEffect, useState } from "react";
import Button from "../../shared/Button";
import Corrections from "./Corrections";
import AuditHistory from "./AuditHistory";
import {
  formatAddress,
  formatGrams,
  governanceForControl,
  eventRegistryForControl,
  multisigForControl,
} from "../../services/controlContracts";
import { CONTRACT_ADDRESSES } from "../../services/contractAddresses";
import {
  ACCOUNT_CHANGE_EVENT,
  getSelectedRole,
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
};

const defaultProductId = () => {
  try {
    const cached = window.localStorage.getItem("registered-product-cache");
    return cached
      ? (JSON.parse(cached) as { productId: string }).productId
      : "1";
  } catch {
    return "1";
  }
};

export default function Audit() {
  const [tab, setTab] = useState<AuditTab>("corrections");
  const [productId, setProductId] = useState(defaultProductId);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [role, setRole] = useState(getSelectedRole());
  const [error, setError] = useState("");

  const loadEscalations = async () => {
    try {
      const governance = governanceForControl();
      const count = await governance.escalationCount();
      const next: Escalation[] = [];
      for (let index = 0n; index < count; index++)
        next.push(await governance.escalationAt(index));
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
          <h1>Audit</h1>
        </div>
        <p>
          Screen emissions for threshold breaches and preserve every
          investigation trail.
        </p>
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
      <div
        className="result-tabs control-tabs"
        role="tablist"
        aria-label="Audit actions"
      >
        <button
          className={tab === "corrections" ? "active" : ""}
          onClick={() => setTab("corrections")}
        >
          Corrections
        </button>
        <button
          className={tab === "escalations" ? "active" : ""}
          onClick={() => setTab("escalations")}
        >
          Escalations
        </button>
        <button
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          Audit History
        </button>
      </div>
      {tab === "corrections" && <Corrections />}
      {tab === "escalations" && (
        <>
          <EscalationForm productId={productId} onSubmitted={loadEscalations} />
          <EscalationList escalations={escalations} />
        </>
      )}
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
      const registry = eventRegistryForControl();
      const recordedEvent = await registry.eventAt(productId, eventIndex);
      const iface = new Interface(["function raiseEscalation(uint256 productId, uint256 eventIndex, string reason)"]);
      const data = iface.encodeFunctionData("raiseEscalation", [productId, eventIndex, reason]);
      const multisig = multisigForControl();
      const transaction = await multisig["submit(address,bytes,address)"](CONTRACT_ADDRESSES.governanceModule, data, recordedEvent.actor);
      await transaction.wait();
      setStatus("submitted");
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
        <span className="status threshold">Audit record</span>
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
        <Button disabled={status === "submitting"}>
          {status === "submitting" ? "Submitting..." : status === "submitted" ? "Submitted" : "Submit"}
        </Button>
      </div>
    </form>
  );
}

function EscalationList({ escalations }: { escalations: Escalation[] }) {
  return (
    <section className="panel">
      <div className="form-heading">
        <div>
          <h2>Escalation log</h2>
          <p>Automatic and manual escalations are immutable audit records.</p>
        </div>
      </div>
      {escalations.length === 0 && (
        <p>No escalations recorded for this deployment.</p>
      )}
      {escalations.map((item, index) => (
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
              {item.reason} · raised by {formatAddress(item.raisedBy)}
            </small>
          </div>
          <span
            className={item.thresholdGrams > 0n ? "status threshold" : "status"}
          >
            {item.thresholdGrams > 0n
              ? `Threshold ${formatGrams(item.thresholdGrams)}`
              : "Manual"}
          </span>
        </div>
      ))}
    </section>
  );
}
