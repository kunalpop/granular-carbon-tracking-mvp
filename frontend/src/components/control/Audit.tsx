import { useEffect, useState, type FormEvent } from "react";
import Button from "../../shared/Button";
import {
  formatAddress,
  formatGrams,
  governanceForControl,
} from "../../services/controlContracts";
import {
  ACCOUNT_CHANGE_EVENT,
  getSelectedRole,
} from "../../services/getSigner";

type AuditTab = "screen" | "escalations";
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
  const [tab, setTab] = useState<AuditTab>("screen");
  const [productId, setProductId] = useState(defaultProductId);
  const [stageId, setStageId] = useState("1");
  const [threshold, setThreshold] = useState("50000");
  const [eventIndex, setEventIndex] = useState("0");
  const [reason, setReason] = useState("");
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [role, setRole] = useState(getSelectedRole());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
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
      setError(
        cause instanceof Error ? cause.message : "Unable to load audit data.",
      );
    }
  };

  useEffect(() => {
    const sync = () => setRole(getSelectedRole());
    window.addEventListener(ACCOUNT_CHANGE_EVENT, sync);
    void loadEscalations();
    return () => window.removeEventListener(ACCOUNT_CHANGE_EVENT, sync);
  }, [role]);

  const submit = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await action();
      setMessage(success);
      await loadEscalations();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Audit transaction failed.",
      );
    } finally {
      setBusy(false);
    }
  };

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
          className={tab === "screen" ? "active" : ""}
          onClick={() => setTab("screen")}
        >
          Screen product
        </button>
        <button
          className={tab === "escalations" ? "active" : ""}
          onClick={() => setTab("escalations")}
        >
          Escalations <span className="tab-count">{escalations.length}</span>
        </button>
      </div>
      {message && (
        <p className="feedback success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="feedback error" role="alert">
          {error}
        </p>
      )}
      {tab === "screen" && (
        <section className="section-grid">
          <form
            className="panel wide control-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submit(async () => {
                const governance = governanceForControl();
                const scan = await governance.screenProduct(productId);
                await scan.wait();
              }, "Product screened; any new breaches were added to the audit log.");
            }}
          >
            <div className="form-heading">
              <div>
                <h2>Threshold screening</h2>
                <p>
                  Anyone can screen a product. Each breach is emitted once and
                  remains visible in the audit log.
                </p>
              </div>
              <span className="status threshold">Automated</span>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>Lifecycle stage</span>
                <input
                  value={stageId}
                  onChange={(event) => setStageId(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Maximum absolute grams</span>
                <input
                  value={threshold}
                  onChange={(event) => setThreshold(event.target.value)}
                />
              </label>
            </div>
            <div className="action-row">
              <Button disabled={busy}>
                {busy ? "Screening..." : "Screen product"}
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                type="button"
                onClick={() =>
                  void submit(async () => {
                    const governance = governanceForControl();
                    const tx = await governance.setStageThreshold(
                      stageId,
                      threshold,
                    );
                    await tx.wait();
                  }, `Stage ${stageId} threshold saved.`)
                }
              >
                Save threshold
              </Button>
            </div>
          </form>
          <ManualEscalation
            productId={productId}
            eventIndex={eventIndex}
            setEventIndex={setEventIndex}
            reason={reason}
            setReason={setReason}
            busy={busy}
            onSubmit={submit}
          />
        </section>
      )}
      {tab === "escalations" && <EscalationList escalations={escalations} />}
    </>
  );
}

function ManualEscalation({
  productId,
  eventIndex,
  setEventIndex,
  reason,
  setReason,
  busy,
  onSubmit,
}: {
  productId: string;
  eventIndex: string;
  setEventIndex: (value: string) => void;
  reason: string;
  setReason: (value: string) => void;
  busy: boolean;
  onSubmit: (action: () => Promise<unknown>, success: string) => Promise<void>;
}) {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void onSubmit(async () => {
      const governance = governanceForControl();
      const tx = await governance.raiseEscalation(
        productId,
        eventIndex,
        reason,
      );
      await tx.wait();
    }, "Manual escalation recorded.");
  };
  return (
    <form className="panel narrow control-form" onSubmit={handleSubmit}>
      <div className="form-heading">
        <div>
          <h2>Raise escalation</h2>
          <p>Record an anomaly that a numeric threshold may not capture.</p>
        </div>
        <span className="status">Auditor role</span>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Event index</span>
          <input
            value={eventIndex}
            onChange={(event) => setEventIndex(event.target.value)}
          />
        </label>
        <label className="field field-wide">
          <span>Reason</span>
          <textarea
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Describe the anomaly"
          />
        </label>
      </div>
      <div className="action-row">
        <Button disabled={busy}>
          {busy ? "Raising..." : "Raise escalation"}
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
          key={`${item.eventIndex.toString()}-${index}`}
        >
          <div>
            <span className="card-id">ESCALATION #{index + 1}</span>
            <strong>
              Event {item.eventIndex.toString()} · {formatGrams(item.co2eGrams)}
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
