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
  type AccountRole,
} from "../../services/getSigner";
import { EMISSION_FACTORS } from "../../services/emissionFactors";

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

type EscalationEventOption = {
  index: string;
  stageId: number;
  actor: string;
};

const SELECTED_PRODUCT_KEY = "selected-product-id";

const defaultProductId = () => {
  try {
    const selected = window.localStorage.getItem(SELECTED_PRODUCT_KEY);
    return selected && selected !== "new" ? selected : "";
  } catch {
    return "";
  }
};

export default function Audit({ initialTab = "corrections" }: { initialTab?: AuditTab }) {
  const initialAuditTab = initialTab;
  const [tab, setTab] = useState<AuditTab>(initialAuditTab);
  const [productId, setProductId] = useState(defaultProductId);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [role, setRole] = useState(getSelectedRole());
  const [eventOptions, setEventOptions] = useState<EscalationEventOption[]>([]);
  const [eventsError, setEventsError] = useState("");
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
    const sync = () => {
      setEventOptions([]);
      setEventsError("");
      setRole(getSelectedRole());
    };
    const syncProduct = () => {
      setEventOptions([]);
      setEventsError("");
      setProductId(defaultProductId());
    };
    window.addEventListener(ACCOUNT_CHANGE_EVENT, sync);
    window.addEventListener("product-selection-change", syncProduct);
    void loadEscalations();
    return () => {
      window.removeEventListener(ACCOUNT_CHANGE_EVENT, sync);
      window.removeEventListener("product-selection-change", syncProduct);
    };
  }, [role]);

  useEffect(() => {
    let cancelled = false;
    const loadEvents = async () => {
      if (!productId) return;

      try {
        const registry = eventRegistryForControl();
        const count = Number(await registry.eventCount(BigInt(productId)));
        const events = await Promise.all(
          Array.from({ length: count }, async (_, index) => {
            const record = await registry.eventAt(BigInt(productId), index);
            return {
              index: String(index),
              stageId: Number(record.stageId),
              actor: String(record.actor),
            };
          }),
        );
        const signerAddress = getSigner(role).address.toLowerCase();
        const eligibleEvents =
          role === "auditor"
            ? events
            : events.filter((event) => event.actor.toLowerCase() === signerAddress);
        if (!cancelled) setEventOptions(eligibleEvents);
      } catch (cause) {
        if (!cancelled) {
          setEventsError(
            cause instanceof Error
              ? cause.message
              : "Unable to load registered events.",
          );
        }
      }
    };

    void loadEvents();
    return () => {
      cancelled = true;
    };
  }, [productId, role]);


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
          <span>Selected Product ID</span>
          <input value={productId || "No product selected"} readOnly />
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
        {eventsError ? (
          <p className="feedback error" role="alert">{eventsError}</p>
        ) : role === "auditor" || eventOptions.length > 0 ? (
          <EscalationForm
            key={`${productId}-${role}`}
            productId={productId}
            role={role}
            events={eventOptions}
            eventsError={eventsError}
            onSubmitted={loadEscalations}
          />
        ) : (
          <p className="panel">
            No event registered for this account on the selected product. Only
            an event owner can raise an escalation.
          </p>
        )}
        <EscalationList escalations={escalations} currentAddress={getSigner(role).address} />
      </>)}
      {tab === "history" && <AuditHistory />}
    </>
  );
}


function EscalationForm({
  productId,
  role,
  events,
  eventsError,
  onSubmitted,
}: {
  productId: string;
  role: AccountRole;
  events: EscalationEventOption[];
  eventsError: string;
  onSubmitted: () => Promise<void>;
}) {
  const [eventIndex, setEventIndex] = useState("");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "submitted">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (status !== "submitted") return;
    const timeout = window.setTimeout(() => setStatus("idle"), 2000);
    return () => window.clearTimeout(timeout);
  }, [status]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!eventIndex || !reason.trim()) return;
    setStatus("submitting");
    setError("");
    try {
      if (!events.some((registeredEvent) => registeredEvent.index === eventIndex)) {
        throw new Error("Select a registered event that this account may escalate.");
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
          <p>
            {role === "auditor"
              ? "Select any registered event for investigation."
              : "Select a registered event recorded by this account."}
          </p>
        </div>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Event Index</span>
          <select
            value={eventIndex}
            onChange={(input) => setEventIndex(input.target.value)}
            required
            disabled={!productId || events.length === 0 || Boolean(eventsError)}
          >
            <option value="" disabled>
              {eventsError
                ? "Unable to load events"
                : events.length
                  ? "Select a registered event"
                  : "No registered events"}
            </option>
            {events.map((registeredEvent) => {
              const stage = EMISSION_FACTORS.stages.find(
                (item) => item.stageId === registeredEvent.stageId,
              );
              return (
                <option key={registeredEvent.index} value={registeredEvent.index}>
                  {role === "auditor"
                    ? `Event: Stage ${registeredEvent.stageId}${stage ? ` — ${stage.name}` : ""}`
                    : `Event ${registeredEvent.index} - ${stage?.name ?? `Stage ${registeredEvent.stageId}`}`}
                </option>
              );
            })}
          </select>
        </label>
        <label className="field field-wide">
          <span>Reason</span>
          <textarea value={reason} onChange={(input) => setReason(input.target.value)} placeholder="Describe the issue" required />
        </label>
      </div>
      {eventsError && <p className="feedback error" role="alert">{eventsError}</p>}
      {error && <p className="feedback error" role="alert">{error}</p>}
      <div className="action-row">
        <Button
          type="submit"
          disabled={status === "submitting" || events.length === 0 || !productId}
        >
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
