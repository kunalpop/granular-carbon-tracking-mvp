import { Interface } from "ethers";
import { useEffect, useState } from "react";
import { EMISSION_FACTORS } from "../../services/emissionFactors";
import Button from "../../shared/Button";
import Escalation, { type EscalationCardRecord } from "../../shared/Escalation";
import {
  formatGrams,
  governanceForControl,
  multisigForControl,
} from "../../services/controlContracts";
import { CONTRACT_ADDRESSES } from "../../services/contractAddresses";
import {
  ACCOUNT_CHANGE_EVENT,
  accountRoleName,
  getSelectedRole,
} from "../../services/getSigner";

type Tab = "pending" | "escalations" | "history";
type EscalationRecord = EscalationCardRecord & { resolved: boolean };
type CorrectionRecord = {
  id: bigint;
  productId: bigint;
  originalIndex: bigint;
  correctedCo2eGrams: bigint;
  reason: string;
  approvedBy: string[];
  supersedesCorrectionId: bigint;
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
        correctionTransactions.push({ args, votes: votes.filter(Boolean) });
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
          approvedBy: matchingTransaction?.votes ?? [],
          supersedesCorrectionId: correction[10],
        });
      }
      setCorrections(nextCorrections);
      const escalationCount = await governance.escalationCount();
      const nextEscalations: EscalationRecord[] = [];
      for (let id = 0n; id < escalationCount; id++) {
        const escalation = await governance.escalationAt(id);
        nextEscalations.push({
          id,
          productId: escalation[0],
          eventIndex: escalation[1],
          co2eGrams: escalation[2],
          thresholdGrams: escalation[3],
          reason: escalation[4],
          raisedBy: escalation[5],
          timestamp: escalation[6],
          resolved: Boolean(await governance.escalationResolved(id)),
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
        <p>
          Record governed changes without rewriting the raw emissions ledger.
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
          Escalations
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
      {tab === "history" && <GovernanceHistory corrections={corrections} escalations={escalations} />}
    </>
  );
}

function ThresholdManager({ busy, onSubmit }: { busy: boolean; onSubmit: (action: () => Promise<unknown>, success: string) => Promise<void> }) {
  const [values, setValues] = useState<Record<number, string>>({});
  const [saved, setSaved] = useState<Set<number>>(new Set());
  useEffect(() => {
    const loadThresholds = async () => {
      try {
        const governance = governanceForControl();
        const next: Record<number, string> = {};
        for (const stage of EMISSION_FACTORS.stages) {
          const grams = Number(await governance.stageThresholdGrams(stage.stageId));
          const defaultGrams = Math.abs(stage.activityValue * stage.emissionFactor_gCO2ePerUnit);
          next[stage.stageId] = (grams > 0 ? grams / 1000 : defaultGrams / 1000).toFixed(2);
        }
        setValues(next);
        setSaved(new Set(EMISSION_FACTORS.stages.filter((stage) => Number(next[stage.stageId]) > 0).map((stage) => stage.stageId)));
      } catch {
        // Keep editable inputs available if the initial read fails.
      }
    };
    void loadThresholds();
  }, []);
  return (
    <section className="panel">
      <div className="form-heading"><div><h2>Emission Thresholds</h2><p>Set the maximum CO₂e allowed for each lifecycle stage. Values are saved on chain in grams.</p></div></div>
      <div className="audit-corrections">
        {EMISSION_FACTORS.stages.map((stage) => (
          <div className="audit-row" key={stage.stageId}>
            <div><strong>{stage.name}</strong><small>Stage {stage.stageId} · {stage.activityUnit}</small></div>
            <div className="action-row">
              {saved.has(stage.stageId) && <span className="status ready">{Number(values[stage.stageId] ?? 0).toFixed(2)} kg CO₂e</span>}
              {!saved.has(stage.stageId) && <input aria-label={`Threshold for ${stage.name}`} type="number" min="0" step="0.01" placeholder="kg CO₂e" value={values[stage.stageId] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [stage.stageId]: event.target.value }))} />}
              {saved.has(stage.stageId) ? <Button variant="secondary" disabled={busy} onClick={() => setSaved((current) => { const next = new Set(current); next.delete(stage.stageId); return next; })}>Edit</Button> : <Button disabled={busy || values[stage.stageId] === undefined || values[stage.stageId] === "" || Number(values[stage.stageId]) < 0} onClick={() => void (async () => { await onSubmit(async () => { const grams = BigInt(Math.round(Number(values[stage.stageId]) * 1000)); const call = await governanceForControl().setStageThreshold(stage.stageId, grams); await call.wait(); }, `${stage.name} threshold saved on chain.`); setSaved((current) => new Set(current).add(stage.stageId)); })()}>Save</Button>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}


function EscalationManager({
  escalations,
  resolvingId,
  justResolvedId,
  comments,
  onCommentChange,
  onResolve,
}: {
  escalations: EscalationRecord[];
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
  return (
    <section className="panel">
      <div className="form-heading"><div><h2>Escalations</h2><p>Review the evidence and record a resolution comment before closing each escalation.</p></div></div>
      {pending.length === 0 && visibleEscalations.length === 0 && <p>No unresolved escalations.</p>}
      <div className="audit-corrections">
        {visibleEscalations.map((item) => (
          <Escalation
            key={String(item.id)}
            escalation={item}
            comment={comments[String(item.id)] ?? ""}
            busy={resolvingId === String(item.id)}
            disabled={Boolean(resolvingId)}
            resolved={item.resolved}
            onCommentChange={(comment) => onCommentChange(item.id, comment)}
            onResolve={() => void onResolve(item.id)}
          />
        ))}
      </div>
    </section>
  );
}

function GovernanceHistory({ corrections, escalations }: { corrections: CorrectionRecord[]; escalations: EscalationRecord[] }) {
  return (
    <section className="panel">
      <div className="form-heading">
        <div>
          <h2>History</h2>
          <p>Corrections approved and executed through the consortium multisig.</p>
        </div>
      </div>
      {corrections.length === 0 && escalations.every((item) => !item.resolved) && <p>No approved corrections or resolved escalations recorded.</p>}
      <div className="audit-corrections">
        {corrections.slice().reverse().map((correction) => (
          <article className="audit-row" key={String(correction.id ?? 0n)}>
            <div>
              <span className="card-id">CORRECTION #{String(correction.id ?? 0n)}</span>
              <strong>Event {String(correction.originalIndex ?? 0n)} · {formatGrams(correction.correctedCo2eGrams)}</strong>
              <small>
                {correction.reason} · approved by {correction.approvedBy.length
                  ? correction.approvedBy.join(", ")
                  : "approval roles unavailable"}
                {correction.supersedesCorrectionId > 0n
                  ? ` · supersedes #${String(correction.supersedesCorrectionId ?? 0n)}`
                  : ""}
              </small>
            </div>
            <span className="status ready">APPROVED</span>
          </article>
        ))}
        {escalations.filter((item) => item.resolved).slice().reverse().map((item) => (
          <article className="audit-row" key={`escalation-${String(item.id)}`}>
            <div><span className="card-id">ESCALATION #{String(item.id + 1n)}</span><strong>Product {String(item.productId)} · Event {String(item.eventIndex)}</strong><small>{item.reason} · raised by {accountRoleName(item.raisedBy)}</small></div>
            <span className="status ready">RESOLVED</span>
          </article>
        ))}
      </div>
    </section>
  );
}
