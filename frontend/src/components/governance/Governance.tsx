import { Interface } from "ethers";
import { useEffect, useState } from "react";
import { EMISSION_FACTORS } from "../../services/emissionFactors";
import Button from "../../shared/Button";
import { type EscalationCardRecord } from "../../shared/Escalation";
import Resolution from "./Resolution";
import FileSelectCard from "../../shared/FileSelectCard";
import { uploadDocument } from "../../storage/uploadDocument";
import { loadIpfsDocumentMetadata } from "../../services/supplyChainIpfs";
import {
  governanceForControl,
  eventRegistryForControl,
  loadStageThresholdsFromChainOrIpfs,
  loadStageThresholdsFromChain,
  multisigForControl,
} from "../../services/controlContracts";
import { CONTRACT_ADDRESSES } from "../../services/contractAddresses";
import {
  ACCOUNT_CHANGE_EVENT,
  accountRoleName,
  getSelectedRole,
} from "../../services/getSigner";

type Tab = "pending" | "escalations" | "history";
type EscalationRecord = EscalationCardRecord & { resolved: boolean; resolvedAt: bigint };
type CorrectionRecord = {
  id: bigint;
  productId: bigint;
  originalIndex: bigint;
  correctedCo2eGrams: bigint;
  reason: string;
  correctedBy: string;
  approvedBy: string[];
  supersedesCorrectionId: bigint;
};

const ACTIVITY_DESCRIPTIONS: Record<number, string> = {
  1: "Aluminium mass",
  2: "PCB mass",
  3: "Battery capacity",
  4: "Panel area",
  5: "Factory energy",
  6: "Packaging mass",
  7: "Freight distance",
  8: "Lifetime energy",
  9: "Repair energy",
  10: "Recycling mass",
};

const CORRECTION_INTERFACE = new Interface([
  "function correctEvent(uint256 productId, uint256 originalIndex, uint256 correctedActivityData, int256 correctedEmissionFactor, string reason, bytes32 evidenceHash)",
]);

const defaultProductId = () => {
  try {
    return window.localStorage.getItem("selected-product-id") ?? "1";
  } catch {
    return "1";
  }
};

export default function Governance() {
  const [tab, setTab] = useState<Tab>("pending");
  const [productId, setProductId] = useState(defaultProductId);
  const [corrections, setCorrections] = useState<CorrectionRecord[]>([]);
  const [escalations, setEscalations] = useState<EscalationRecord[]>([]);
  const [role, setRole] = useState(getSelectedRole());
  const [busy, setBusy] = useState(false);
  const [resolvingEscalationId, setResolvingEscalationId] = useState<string>();
  const [screening, setScreening] = useState(false);
  const [justResolvedEscalationId, setJustResolvedEscalationId] = useState<string>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [escalationComments, setEscalationComments] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(window.localStorage.getItem("escalation-resolution-comments") ?? "{}");
    } catch {
      return {};
    }
  });

  const loadData = async () => {
    setError("");
    try {
      const governance = governanceForControl();
      const correctionCount = await governance.correctionCount();
      const multisig = multisigForControl();
      const ownerCount = Number(await multisig.ownerCount());
      const owners = await Promise.all(
        Array.from({ length: ownerCount }, (_, index) => multisig.owners(index)),
      );
      const transactionCount = Number(await multisig.transactionCount());
      const correctionTransactions: Array<{
        args: ReturnType<typeof CORRECTION_INTERFACE.decodeFunctionData>;
        votes: string[];
        eventOwner: string;
      }> = [];
      for (let txId = 0; txId < transactionCount; txId++) {
        const transaction = await multisig.transactionAt(txId);
        if (!transaction.executed) continue;
        if (
          String(transaction.target).toLowerCase() !==
          CONTRACT_ADDRESSES.governanceModule.toLowerCase()
        ) {
          continue;
        }
        const data = String(transaction.data);
        if (data.slice(0, 10) !== CORRECTION_INTERFACE.getFunction("correctEvent")?.selector) {
          continue;
        }
        const args = CORRECTION_INTERFACE.decodeFunctionData("correctEvent", data);
        const votes = await Promise.all(
          owners.map(async (owner) =>
            Number(await multisig.voteStatus(txId, owner)) === 1
              ? accountRoleName(owner)
              : "",
          ),
        );
        correctionTransactions.push({ args, votes: votes.filter(Boolean), eventOwner: String(transaction.eventOwner) });
      }
      const nextCorrections: CorrectionRecord[] = [];
      for (
        let correctionId = 1n;
        correctionId <= correctionCount;
        correctionId++
      ) {
        const correction = await governance.correctionAt(correctionId);
        const matchingTransaction = correctionTransactions.find(({ args }) =>
          BigInt(args[0].toString()) === BigInt(correction[0].toString()) &&
          BigInt(args[1].toString()) === BigInt(correction[1].toString()) &&
          BigInt(args[2].toString()) === BigInt(correction[3].toString()) &&
          BigInt(args[3].toString()) === BigInt(correction[4].toString()) &&
          String(args[4]) === String(correction[6]) &&
          String(args[5]).toLowerCase() === String(correction[7]).toLowerCase(),
        );
        nextCorrections.push({
          id: correctionId,
          productId: correction[0],
          originalIndex: correction[1],
          correctedCo2eGrams: correction[5],
          reason: correction[6],
          correctedBy: matchingTransaction?.args && String(matchingTransaction.args[4]) === "Deployer event edit"
            ? "deployer"
            : matchingTransaction?.eventOwner ?? correction[8],
          approvedBy: matchingTransaction?.votes ?? [],
          supersedesCorrectionId: correction[10],
        });
      }
      setCorrections(nextCorrections);
      const escalationCount = await governance.escalationCount();
      const nextEscalations: EscalationRecord[] = [];
      const eventRegistry = eventRegistryForControl();
      const stageThresholds = await loadStageThresholdsFromChainOrIpfs(
        EMISSION_FACTORS.stages.map((stage) => stage.stageId),
      );
      for (let id = 0n; id < escalationCount; id++) {
        const escalation = await governance.escalationAt(id);
        const event = await eventRegistry.eventAt(escalation[0], escalation[1]);
        const thresholdKg = stageThresholds[Number(event.stageId)] ?? 0;
        const mappedThresholdGrams = thresholdKg > 0
          ? BigInt(Math.round(thresholdKg * 1000))
          : escalation[3];
        nextEscalations.push({
          id,
          productId: escalation[0],
          eventIndex: escalation[1],
          co2eGrams: escalation[2],
          thresholdGrams: mappedThresholdGrams,
          reason: escalation[4],
          evidenceHash: String(escalation[4]) === "threshold breach" ? `0x${"00".repeat(32)}` : String(escalation[5]),
          raisedBy: escalation[6],
          timestamp: escalation[7],
          resolved: Boolean(await governance.escalationResolved(id)),
          resolvedAt: await governance.escalationResolvedAt(id),
        });
      }
      setEscalations(nextEscalations);

    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load governance data.",
      );
    }
  };

  useEffect(() => {
    const sync = () => setRole(getSelectedRole());
    window.addEventListener(ACCOUNT_CHANGE_EVENT, sync);
    void loadData();
    return () => window.removeEventListener(ACCOUNT_CHANGE_EVENT, sync);
  }, [productId, role]);

  const submit = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(success);
      window.setTimeout(() => setMessage(""), 2000);
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Transaction failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="kicker">Lifecycle Control</div>
          <h1>Governance</h1>
        </div>
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
      </div>
      <div
        className="result-tabs control-tabs"
        role="tablist"
        aria-label="Governance actions"
      >
        <button
          className={tab === "pending" ? "active" : ""}
          onClick={() => setTab("pending")}
        >
          Emission Thresholds
        </button>
        <button
          className={tab === "escalations" ? "active" : ""}
          onClick={() => setTab("escalations")}
        >
          Escalation
        </button>
        <button
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          History
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
      {tab === "pending" && <ThresholdManager busy={busy} onSubmit={submit} />}
      {tab === "escalations" && <EscalationManager
        escalations={escalations}
        screening={screening}
        onScreen={async () => {
          setScreening(true);
          setError("");
          setMessage("");
          try {
            const id = BigInt(productId);
            const call = await governanceForControl().screenProduct(id);
            await call.wait();
            await loadData();
            window.dispatchEvent(new Event("governance-screening-change"));
            setMessage("Product screened and automatic escalations recorded on chain.");
            window.setTimeout(() => setMessage(""), 2000);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Unable to screen product.");
          } finally {
            setScreening(false);
          }
        }}
        resolvingId={resolvingEscalationId}
        justResolvedId={justResolvedEscalationId}
        comments={escalationComments}
        onCommentChange={(id, comment) => {
          setEscalationComments((current) => {
            const next = { ...current, [String(id)]: comment };
            window.localStorage.setItem("escalation-resolution-comments", JSON.stringify(next));
            return next;
          });
        }}
        onResolve={async (id) => {
          const idKey = String(id);
          setResolvingEscalationId(idKey);
          setError("");
          setMessage("");
          try {
            const comment = escalationComments[idKey]?.trim();
            if (!comment) {
              throw new Error("Add a resolution comment before resolving this escalation.");
            }
            const call = await governanceForControl().resolveEscalation(id);
            await call.wait();
            setEscalations((current) =>
              current.map((item) =>
                item.id === id ? { ...item, resolved: true } : item,
              ),
            );
            setJustResolvedEscalationId(idKey);
            window.setTimeout(() => {
              setJustResolvedEscalationId((current) =>
                current === idKey ? undefined : current,
              );
            }, 2000);
            setMessage("Escalation resolved and recorded on chain.");
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Transaction failed.");
          } finally {
            setResolvingEscalationId(undefined);
          }
        }}
      />}
      {tab === "history" && <GovernanceHistory productId={productId} corrections={corrections} escalations={escalations} />}
    </>
  );
}

function ThresholdManager({ busy, onSubmit }: { busy: boolean; onSubmit: (action: () => Promise<unknown>, success: string) => Promise<void> }) {
  const [values, setValues] = useState<Record<number, string>>({});
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [savingStage, setSavingStage] = useState<number>();
  const [justSavedStage, setJustSavedStage] = useState<number>();
  const [thresholdFile, setThresholdFile] = useState<File>();
  const [uploadingThresholds, setUploadingThresholds] = useState(false);
  const [thresholdUploaded, setThresholdUploaded] = useState(false);
  const [showLatestThresholds, setShowLatestThresholds] = useState(false);
  const [thresholdMetadata, setThresholdMetadata] = useState<{ originalFileName: string; createdAt: string }>();
  const [thresholdUploadNeeded, setThresholdUploadNeeded] = useState(false);
  useEffect(() => {
    const loadThresholds = async () => {
      try {
        const stageIds = EMISSION_FACTORS.stages.map((stage) => stage.stageId);
        const onChainThresholds = await loadStageThresholdsFromChain(stageIds);
        const allThresholdsOnChain = stageIds.every((stageId) => {
          const threshold = onChainThresholds[stageId];
          return Number.isFinite(threshold) && threshold > 0;
        });
        setThresholdUploadNeeded(!allThresholdsOnChain);
        const thresholds = await loadStageThresholdsFromChainOrIpfs(stageIds);
        const next: Record<number, string> = {};
        for (const stage of EMISSION_FACTORS.stages) {
          const threshold = thresholds[stage.stageId] ?? 0;
          next[stage.stageId] = Math.max(0, threshold).toFixed(2);
        }
        setValues(next);
        setSaved(new Set(stageIds.filter((stageId) => {
          const threshold = onChainThresholds[stageId];
          return Number.isFinite(threshold) && threshold > 0;
        })));
      } catch {
        // Keep editable inputs available if the initial read fails.
      }
    };
    void loadThresholds();
    void loadIpfsDocumentMetadata("thresholds.json").then(setThresholdMetadata).catch(() => setThresholdMetadata(undefined));
    window.addEventListener("threshold-file-uploaded", loadThresholds);
    return () => window.removeEventListener("threshold-file-uploaded", loadThresholds);
  }, []);
  return (
    <section className="panel">
      <div className="form-heading"><div><h2>Emission Thresholds</h2><p>Set the CO2e thresholds for lifecycle stages in grams.</p></div></div>
      {thresholdUploadNeeded && <div className="threshold-upload-controls">
      <FileSelectCard
        className="threshold-file-card"
        iconText="JSON"
        title="Threshold defaults"
        fileName={thresholdFile?.name}
        emptyLabel="Upload thresholds.json"
        accept="application/json,.json"
        disabled={uploadingThresholds || thresholdUploaded}
        onFileChange={(file) => setThresholdFile(file)}
        action={<Button disabled={!thresholdFile || uploadingThresholds || thresholdUploaded} onClick={() => void (async () => {
          if (!thresholdFile) return;
          setUploadingThresholds(true);
          try {
            const normalized = new File([thresholdFile], "thresholds.json", { type: "application/json" });
            await uploadDocument(normalized, "governance", { purpose: "thresholds" });
            setThresholdFile(undefined);
            window.dispatchEvent(new Event("threshold-file-uploaded"));
            setThresholdUploaded(true);
            const metadata = await loadIpfsDocumentMetadata("thresholds.json");
            setThresholdMetadata(metadata);
            window.setTimeout(() => setThresholdUploaded(false), 2000);
          } finally {
            setUploadingThresholds(false);
          }
        })()}>{uploadingThresholds ? "Uploading..." : thresholdUploaded ? "Uploaded" : "Upload"}</Button>}
      />
      <div className="threshold-config-side">
        <Button variant="secondary" onClick={() => setShowLatestThresholds((visible) => !visible)}>
          Configuration
        </Button>
        {showLatestThresholds && (
          <div className="threshold-config-panel">
            <h3>Configuration</h3>
            <div className="threshold-config-row"><strong>Name</strong><span>{thresholdMetadata?.originalFileName ?? "thresholds.json"}</span></div>
            <div className="threshold-config-row"><strong>Date</strong><span>{thresholdMetadata ? new Date(thresholdMetadata.createdAt).toLocaleString() : "—"}</span></div>
          </div>
        )}
      </div>
      </div>}
      <div className="audit-corrections threshold-table">
        <div className="threshold-table-header" aria-hidden="true">
          <span>Stage</span><span>Activity</span><span>Threshold</span><span>Action</span>
        </div>
        {EMISSION_FACTORS.stages.map((stage) => (
          <div className="threshold-table-row" key={stage.stageId}>
            <div><strong>{stage.name}</strong><small>Stage {stage.stageId}</small></div>
            <span>{ACTIVITY_DESCRIPTIONS[stage.stageId] ?? "Activity"}</span>
            <div className="action-row">
              {saved.has(stage.stageId) && <span className="status ready">{Number(values[stage.stageId] ?? 0).toFixed(2)} Kg CO2e</span>}
              {!saved.has(stage.stageId) && <input aria-label={`Threshold for ${stage.name}`} type="number" min="0" step="0.01" placeholder="Kg CO2e" value={values[stage.stageId] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [stage.stageId]: event.target.value }))} />}
            </div>
            <div>{saved.has(stage.stageId) ? <Button variant="secondary" disabled={busy || justSavedStage === stage.stageId} onClick={() => setSaved((current) => { const next = new Set(current); next.delete(stage.stageId); return next; })}>{justSavedStage === stage.stageId ? "Saved" : "Edit"}</Button> : <Button disabled={busy || savingStage === stage.stageId || values[stage.stageId] === undefined || values[stage.stageId] === "" || Number(values[stage.stageId]) < 0} onClick={() => void (async () => { setSavingStage(stage.stageId); try { await onSubmit(async () => { const grams = BigInt(Math.round(Number(values[stage.stageId]) * 1000)); const call = await governanceForControl().setStageThreshold(stage.stageId, grams); await call.wait(); }, `${stage.name} threshold saved on chain.`); setSaved((current) => { const next = new Set(current).add(stage.stageId); if (next.size === EMISSION_FACTORS.stages.length) setThresholdUploadNeeded(false); return next; }); setJustSavedStage(stage.stageId); window.setTimeout(() => setJustSavedStage((current) => current === stage.stageId ? undefined : current), 2000); } finally { setSavingStage(undefined); } })()}>{savingStage === stage.stageId ? "Saving..." : "Save"}</Button>}</div>
          </div>
        ))}
      </div>
    </section>
  );
}


function EscalationManager({
  escalations,
  screening,
  onScreen,
  resolvingId,
  justResolvedId,
  comments,
  onCommentChange,
  onResolve,
}: {
  escalations: EscalationRecord[];
  screening: boolean;
  onScreen: () => Promise<void>;
  resolvingId?: string;
  justResolvedId?: string;
  comments: Record<string, string>;
  onCommentChange: (id: bigint, comment: string) => void;
  onResolve: (id: bigint) => Promise<void>;
}) {
  const pending = escalations.filter((item) => !item.resolved);
  const visibleEscalations = escalations.filter(
    (item) => !item.resolved || String(item.id) === justResolvedId,
  );
  const productNumbers = new Map<string, number>();
  return (
    <section className="panel">
      <div className="form-heading"><div><h2>Escalation</h2><p>Review the evidence and record a resolution comment before closing each escalation.</p></div><Button type="button" disabled={screening} onClick={() => void onScreen()}>{screening ? "Screening..." : "Screen"}</Button></div>
      {pending.length === 0 && visibleEscalations.length === 0 && <p>No unresolved escalations.</p>}
      <div className="audit-corrections escalation-manager-list">
        {visibleEscalations.map((item) => {
          const productKey = String(item.productId);
          const displayNumber = (productNumbers.get(productKey) ?? 0) + 1;
          productNumbers.set(productKey, displayNumber);
          return (
          <Resolution
            key={String(item.id)}
            escalation={item}
            displayNumber={displayNumber}
            comment={comments[String(item.id)] ?? ""}
            busy={resolvingId === String(item.id)}
            onCommentChange={(comment) => onCommentChange(item.id, comment)}
            onResolve={() => void onResolve(item.id)}
          />
          );
        })}
      </div>
    </section>
  );
}

function GovernanceHistory({ productId, corrections, escalations }: { productId: string; corrections: CorrectionRecord[]; escalations: EscalationRecord[] }) {
  let selectedProductId = 0n;
  try { selectedProductId = BigInt(productId || "0"); } catch { /* Keep history empty for an invalid product selection. */ }
  const productCorrections = corrections.filter((correction) => correction.productId === selectedProductId && (correction.correctedBy === "deployer" || accountRoleName(correction.correctedBy) === "deployer"));
  const correctionNumbers = new Map(productCorrections.slice().reverse().map((correction, index) => [String(correction.id), index + 1]));
  const productEscalations = escalations.filter((escalation) => escalation.productId === selectedProductId);
  return (
    <section className="panel">
      <div className="form-heading">
        <div>
          <h2>History</h2>
        </div>
      </div>
      <div className="audit-corrections governance-history-table">
        <div className="governance-history-header" aria-hidden="true">
          <span>Type</span><span>Event</span><span>Details</span><span>Status</span>
        </div>
        {productCorrections.slice().reverse().map((correction, index) => {
          const superseded = corrections.find((item) => item.id === correction.supersedesCorrectionId && item.productId === correction.productId && item.originalIndex === correction.originalIndex);
          const supersededNumber = superseded ? correctionNumbers.get(String(superseded.id)) : undefined;
          return (
          <article className="governance-history-row" key={String(correction.id ?? 0n)}>
            <span className="card-id">CORRECTION #{index + 1}</span>
            <strong>Event {String((correction.originalIndex ?? 0n) + 1n)}</strong>
            <span>{correction.reason} · approved by {correction.approvedBy.length ? correction.approvedBy.join(", ") : "approval roles unavailable"}{supersededNumber !== undefined ? ` · replaces correction #${supersededNumber} raised by ${correction.correctedBy === "deployer" ? "deployer" : accountRoleName(correction.correctedBy)} for this event; the earlier record remains immutable on chain` : ""}</span>
            <span className="status ready">APPROVED</span>
          </article>
          );
        })}
        {productEscalations.filter((item) => item.resolved).slice().reverse().map((item, index) => (
          <article className="governance-history-row" key={`escalation-${String(item.id)}`}>
            <span className="card-id">ESCALATION #{index + 1}</span>
            <strong>Event {String(item.eventIndex + 1n)}</strong>
            <span>Product {String(item.productId)} · {item.reason} · raised by {accountRoleName(item.raisedBy)}</span>
            <span className="status ready">RESOLVED</span>
          </article>
        ))}
      </div>
    </section>
  );
}
