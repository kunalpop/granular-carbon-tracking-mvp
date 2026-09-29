import { useEffect, useState } from "react";
import { EMISSION_FACTORS } from "../../services/emissionFactors";
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

type Tab = "pending" | "history";
type CorrectionRecord = {
  id: bigint;
  productId: bigint;
  originalIndex: bigint;
  correctedCo2eGrams: bigint;
  reason: string;
  correctedBy: string;
  supersedesCorrectionId: bigint;
};

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
  const [role, setRole] = useState(getSelectedRole());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadData = async () => {
    setError("");
    try {
      const governance = governanceForControl();
      const correctionCount = await governance.correctionCount();
      const nextCorrections: CorrectionRecord[] = [];
      for (
        let correctionId = 1n;
        correctionId <= correctionCount;
        correctionId++
      ) {
        const correction = await governance.correctionAt(correctionId);
        nextCorrections.push({ id: correctionId, ...correction });
      }
      setCorrections(nextCorrections);

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
      {tab === "history" && (
        <CorrectionHistory corrections={corrections} />
      )}
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

function CorrectionHistory({ corrections }: { corrections: CorrectionRecord[] }) {
  return (
    <section className="panel">
      <div className="form-heading">
        <div>
          <h2>History</h2>
          <p>Corrections approved and executed through the consortium multisig.</p>
        </div>
      </div>
      {corrections.length === 0 && <p>No approved corrections recorded.</p>}
      <div className="audit-corrections">
        {corrections.slice().reverse().map((correction) => (
          <article className="audit-row" key={String(correction.id ?? 0n)}>
            <div>
              <span className="card-id">CORRECTION #{String(correction.id ?? 0n)}</span>
              <strong>Event {String(correction.originalIndex ?? 0n)} · {formatGrams(correction.correctedCo2eGrams)}</strong>
              <small>
                {correction.reason} · approved by {formatAddress(correction.correctedBy)}
                {correction.supersedesCorrectionId > 0n
                  ? ` · supersedes #${String(correction.supersedesCorrectionId ?? 0n)}`
                  : ""}
              </small>
            </div>
            <span className="status ready">APPROVED</span>
          </article>
        ))}
      </div>
    </section>
  );
}

