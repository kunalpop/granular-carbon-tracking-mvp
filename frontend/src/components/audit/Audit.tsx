import { useEffect, useState } from "react";
import Button from "../../shared/Button";
import Corrections from "./Corrections";
import AuditHistory from "./AuditHistory";
import {
  eventRegistryForControl,
  governanceForControl,
} from "../../services/controlContracts";
import {
  ACCOUNT_CHANGE_EVENT,
  getSelectedRole,
  getSigner,
} from "../../services/getSigner";
import { loadEmissionFactorsDirect, type EmissionFactorLibrary } from "../../services/supplyChainIpfs";
import { uploadDocument } from "../../storage/uploadDocument";
import FileSelectCard from "../../shared/FileSelectCard";
import { EscalationFormLayout } from "../../shared/Escalation";
import EvidenceModal from "../../shared/EvidenceModal";
import type { AccountRole } from "../../services/getSigner";

type AuditTab = "corrections" | "escalations" | "history";
type Escalation = {
  productId: bigint;
  eventIndex: bigint;
  co2eGrams: bigint;
  thresholdGrams: bigint;
  reason: string;
  evidenceHash: string;
  evidenceAvailable: boolean;
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
  const [factors, setFactors] = useState<EmissionFactorLibrary>();
  const [viewingEvidence, setViewingEvidence] = useState<string>();

  useEffect(() => {
    setTab(initialAuditTab);
  }, [initialAuditTab]);

  useEffect(() => {
    void loadEmissionFactorsDirect().then(setFactors).catch(() => setFactors(undefined));
  }, []);

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
          evidenceHash: String(escalation[4]) === "threshold breach" ? `0x${"00".repeat(32)}` : String(escalation[5]),
          evidenceAvailable: false,
          raisedBy: escalation[6],
          timestamp: escalation[7],
          resolved,
          resolvedAt,
        });
      }
        const verified = await Promise.all(next.map(async (item) => {
          if (!item.evidenceHash || item.evidenceHash === `0x${"00".repeat(32)}`) return item;
          try {
            const response = await fetch(`/api/documents/by-original-hash/${encodeURIComponent(item.evidenceHash)}`);
            if (!response.ok) return item;
            const document = await response.json() as { originalHash?: string };
            return { ...item, evidenceAvailable: String(document.originalHash).toLowerCase() === item.evidenceHash.toLowerCase() };
          } catch {
            return item;
          }
        }));
        setEscalations(verified);
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
          <h1>{initialTab === "escalations" ? "Escalation" : "Audit"}</h1>
        </div>
      </div>
      {error && <p className="feedback error" role="alert">{error}</p>}
      <div className="control-toolbar">
        <label className="field compact-field">
          <span>Selected Product ID</span>
          <input value={productId || "No product selected"} readOnly />
        </label>
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
            factors={factors}
            onSubmitted={loadEscalations}
          />
        ) : (
          <p className="panel">
            No event registered for this account on the selected product. Only
            an event owner can raise an escalation.
          </p>
        )}
        <EscalationList escalations={escalations} currentAddress={getSigner(role).address} role={role} onViewEvidence={setViewingEvidence} />
        {viewingEvidence && <EvidenceModal evidenceHash={viewingEvidence} onClose={() => setViewingEvidence(undefined)} />}
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
  factors,
  onSubmitted,
}: {
  productId: string;
  role: AccountRole;
  events: EscalationEventOption[];
  eventsError: string;
  factors?: EmissionFactorLibrary;
  onSubmitted: () => Promise<void>;
}) {
  const [eventIndex, setEventIndex] = useState("");
  const [reason, setReason] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File>();
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

      if (evidenceFile && evidenceFile.size > 1024 * 1024) {
        throw new Error("Evidence file must not exceed 1 MB.");
      }
      const uploadedEvidence = evidenceFile
        ? await uploadDocument(evidenceFile, getSigner(role).address, {
          productId,
          eventIndex,
          documentType: "escalation-evidence",
        })
        : undefined;
      const transaction = await governanceForControl().raiseEscalation(
        productId,
        eventIndex,
        reason,
        uploadedEvidence?.originalHash ?? `0x${"00".repeat(32)}`,
      );
      await transaction.wait();
      setStatus("submitted");
      setEventIndex("");
      setReason("");
      setEvidenceFile(undefined);
      await onSubmitted();
    } catch (cause) {
      setStatus("idle");
      setError(cause instanceof Error ? cause.message : "Escalation submission failed.");
    }
  };

  return (
    <EscalationFormLayout onSubmit={submit}>
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
              const stage = factors?.stages.find(
                (item) => item.stageId === registeredEvent.stageId,
              );
              return (
                <option key={registeredEvent.index} value={registeredEvent.index}>
                  {`Event ${registeredEvent.index} - ${stage?.name ?? `Stage ${registeredEvent.stageId}`}`}
                </option>
              );
            })}
          </select>
        </label>
        <label className="field field-wide">
          <span>Reason</span>
          <textarea value={reason} onChange={(input) => setReason(input.target.value)} placeholder="Describe the issue" required />
        </label>
        <FileSelectCard
          className="evidence-upload-card"
          title="Evidence file"
          fileName={evidenceFile?.name}
          emptyLabel="No file selected · max 1 MB"
          disabled={status === "submitting"}
          onFileChange={(file, input) => {
            if (file && file.size > 1024 * 1024) {
              setError("Evidence file must not exceed 1 MB.");
              input.currentTarget.value = "";
              setEvidenceFile(undefined);
              return;
            }
            setError("");
            setEvidenceFile(file);
          }}
        />
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
    </EscalationFormLayout>
  );
}

function EscalationList({
  escalations,
  currentAddress,
  role,
  onViewEvidence,
}: {
  escalations: Escalation[];
  currentAddress: string;
  role: AccountRole;
  onViewEvidence: (hash: string) => void;
}) {
  const accountEscalations = role === "deployer"
    ? escalations
    : escalations.filter((item) => item.raisedBy.toLowerCase() === currentAddress.toLowerCase());
  if (accountEscalations.length === 0) return null;

  return (
    <section className="panel escalation-log-panel">
      <div className="escalation-log-header" aria-hidden="true">
        <span>Escalation</span>
        <span>Event</span>
        <span>Reason</span>
        <span>Evidence</span>
        <span>Last Modified</span>
        <span>Status</span>
      </div>
      {accountEscalations.map((item, index) => (
        <div
          className="escalation-log-row"
          key={`${String(item.eventIndex ?? 0n)}-${index}`}
        >
          <span className="card-id">ESCALATION #{index + 1}</span>
          <strong>Event {String((item.eventIndex ?? 0n) + 1n)}</strong>
          <span>{item.reason}</span>
          {item.evidenceAvailable ? <button type="button" className="evidence-link" onClick={() => onViewEvidence(item.evidenceHash)}>evidence</button> : <span aria-hidden="true" />}
          <span>{new Date(Number((item.resolved && item.resolvedAt > 0n ? item.resolvedAt : item.timestamp)) * 1000).toLocaleString()}</span>
          <span className={item.resolved ? "status ready" : "status threshold"}>
            {item.resolved ? "Resolved" : "Pending"}
          </span>
        </div>
      ))}
    </section>
  );
}
