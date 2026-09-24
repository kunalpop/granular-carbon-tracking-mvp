import { useEffect, useState, type FormEvent } from "react";
import Button from "../../shared/Button";
import {
  eventRegistryForControl,
  formatAddress,
  formatGrams,
  governanceForControl,
  hashEvidence,
  multisigForControl,
} from "../../services/controlContracts";
import {
  ACCOUNT_CHANGE_EVENT,
  getSelectedRole,
} from "../../services/getSigner";

type Tab = "record" | "correction" | "vote" | "history";
type EventRecord = {
  index: bigint;
  stageId: bigint;
  activityData: bigint;
  activityUnit: string;
  emissionFactor: bigint;
  co2eGrams: bigint;
  evidenceHash: string;
  eventHash: string;
};
type CorrectionRecord = {
  id: bigint;
  productId: bigint;
  originalIndex: bigint;
  correctedCo2eGrams: bigint;
  reason: string;
  correctedBy: string;
  supersedesCorrectionId: bigint;
};
type MultiTransaction = {
  id: bigint;
  target: string;
  data: string;
  executed: boolean;
  confirmations: bigint;
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

export default function Governance() {
  const [tab, setTab] = useState<Tab>("record");
  const [productId, setProductId] = useState(defaultProductId);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRecord[]>([]);
  const [transactions, setTransactions] = useState<MultiTransaction[]>([]);
  const [role, setRole] = useState(getSelectedRole());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadData = async () => {
    setError("");
    try {
      const id = BigInt(productId || "1");
      const registry = eventRegistryForControl();
      const eventCount = await registry.eventCount(id);
      const nextEvents: EventRecord[] = [];
      for (let index = 0n; index < eventCount; index++) {
        const event = await registry.eventAt(id, index);
        nextEvents.push({ index, ...event });
      }
      setEvents(nextEvents);

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

      const multisig = multisigForControl();
      const transactionCount = await multisig.transactionCount();
      const nextTransactions: MultiTransaction[] = [];
      for (let txId = 0n; txId < transactionCount; txId++) {
        const transaction = await multisig.transactionAt(txId);
        nextTransactions.push({ id: txId, ...transaction });
      }
      setTransactions(nextTransactions);
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
        {(["record", "correction", "vote", "history"] as Tab[]).map((item) => (
          <button
            key={item}
            className={tab === item ? "active" : ""}
            onClick={() => setTab(item)}
          >
            {item === "record"
              ? "Record event"
              : item === "correction"
              ? "Submit correction"
              : item === "vote"
              ? "Take vote"
              : "Correction history"}
          </button>
        ))}
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
      {tab === "record" && (
        <RecordEvent productId={productId} busy={busy} onSubmit={submit} />
      )}
      {tab === "correction" && (
        <SubmitCorrection
          productId={productId}
          events={events}
          busy={busy}
          onSubmit={submit}
        />
      )}
      {tab === "vote" && (
        <VoteQueue transactions={transactions} busy={busy} onSubmit={submit} />
      )}
      {tab === "history" && (
        <CorrectionHistory events={events} corrections={corrections} />
      )}
    </>
  );
}

function RecordEvent({
  productId,
  busy,
  onSubmit,
}: {
  productId: string;
  busy: boolean;
  onSubmit: (action: () => Promise<unknown>, success: string) => Promise<void>;
}) {
  const [stageId, setStageId] = useState("1");
  const [activity, setActivity] = useState("1000");
  const [unit, setUnit] = useState("kg");
  const [factor, setFactor] = useState("8000");
  const [source, setSource] = useState("Governance submission");
  const [methodology, setMethodology] = useState("GHGP S3C1");
  const [version, setVersion] = useState("1.0.0");
  const [file, setFile] = useState<File>();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const evidenceHash = await hashEvidence(file);
    await onSubmit(async () => {
      const registry = eventRegistryForControl();
      const transaction = await registry.recordEvent(
        productId,
        stageId,
        Math.round(Number(activity) * 1000),
        unit,
        Math.round(Number(factor) * 1000),
        source,
        methodology,
        evidenceHash,
        version,
      );
      await transaction.wait();
    }, `Event recorded with evidence hash ${evidenceHash.slice(0, 12)}...`);
  };

  return (
    <form className="panel control-form" onSubmit={handleSubmit}>
      <div className="form-heading">
        <div>
          <h2>Record an emission event</h2>
          <p>
            The event is appended to the immutable registry. Evidence is
            represented by its content hash.
          </p>
        </div>
        <span className="status">On-chain write</span>
      </div>
      <div className="form-grid">
        <Field label="Lifecycle stage" value={stageId} onChange={setStageId} />
        <Field label="Activity value" value={activity} onChange={setActivity} />
        <Field label="Activity unit" value={unit} onChange={setUnit} />
        <Field label="Emission factor" value={factor} onChange={setFactor} />
        <Field label="Factor source" value={source} onChange={setSource} />
        <Field
          label="Methodology"
          value={methodology}
          onChange={setMethodology}
        />
        <Field label="Schema version" value={version} onChange={setVersion} />
        <label className="field">
          <span>Evidence file</span>
          <input
            type="file"
            onChange={(event) => setFile(event.target.files?.[0])}
          />
        </label>
      </div>
      <div className="action-row">
        <Button disabled={busy}>
          {busy ? "Recording..." : "Record event"}
        </Button>
      </div>
    </form>
  );
}

function SubmitCorrection({
  productId,
  events,
  busy,
  onSubmit,
}: {
  productId: string;
  events: EventRecord[];
  busy: boolean;
  onSubmit: (action: () => Promise<unknown>, success: string) => Promise<void>;
}) {
  const [eventIndex, setEventIndex] = useState("0");
  const [activity, setActivity] = useState("0");
  const [factor, setFactor] = useState("0");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File>();
  const selected = events[Number(eventIndex)];
  const calculated = Math.round(Number(activity) * Number(factor));

  useEffect(() => {
    if (selected) {
      setActivity((Number(selected.activityData) / 1000).toString());
      setFactor((Number(selected.emissionFactor) / 1000).toString());
    }
  }, [eventIndex, selected]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!reason.trim()) return;
    const evidenceHash = await hashEvidence(file);
    await onSubmit(async () => {
      const governance = governanceForControl();
      const transaction = await governance.correctEvent(
        productId,
        eventIndex,
        Math.round(Number(activity) * 1000),
        Math.round(Number(factor) * 1000),
        reason,
        evidenceHash,
      );
      await transaction.wait();
    }, `Correction appended with evidence hash ${evidenceHash.slice(0, 12)}...`);
  };

  return (
    <form className="panel control-form" onSubmit={handleSubmit}>
      <div className="form-heading">
        <div>
          <h2>Submit correction</h2>
          <p>
            The original event remains untouched. This appends a correction
            record to GovernanceModule.
          </p>
        </div>
        <span className="status threshold">Corrector role required</span>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Event index</span>
          <select
            value={eventIndex}
            onChange={(event) => setEventIndex(event.target.value)}
          >
            {events.map((item) => (
              <option key={item.index.toString()} value={item.index.toString()}>
                Event {item.index.toString()} · {formatGrams(item.co2eGrams)}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Corrected activity"
          value={activity}
          onChange={setActivity}
        />
        <Field label="Corrected factor" value={factor} onChange={setFactor} />
        <label className="field field-wide">
          <span>Reason</span>
          <textarea
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explain the evidence for this correction"
          />
        </label>
        <label className="field">
          <span>Evidence file</span>
          <input
            type="file"
            onChange={(event) => setFile(event.target.files?.[0])}
          />
        </label>
      </div>
      <div className="comparison">
        <span>
          Original{" "}
          <strong>
            {selected ? formatGrams(selected.co2eGrams) : "No event"}
          </strong>
        </span>
        <span>
          Corrected <strong>{formatGrams(calculated)}</strong>
        </span>
      </div>
      <div className="action-row">
        <Button disabled={busy || !selected}>
          {busy ? "Submitting..." : "Append correction"}
        </Button>
      </div>
    </form>
  );
}

function VoteQueue({
  transactions,
  busy,
  onSubmit,
}: {
  transactions: MultiTransaction[];
  busy: boolean;
  onSubmit: (action: () => Promise<unknown>, success: string) => Promise<void>;
}) {
  const multisig = multisigForControl();
  const [target, setTarget] = useState("");
  const [data, setData] = useState("0x");
  return (
    <section className="section-grid">
      <form
        className="panel wide control-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit(async () => {
            const transaction = await multisig.submit(target, data);
            await transaction.wait();
          }, "Transaction submitted to the consortium queue.");
        }}
      >
        <div className="form-heading">
          <div>
            <h2>Consortium vote</h2>
            <p>
              Submit a contract call, then collect 2 of 3 owner confirmations
              before execution.
            </p>
          </div>
          <span className="status threshold">2 of 3</span>
        </div>
        <div className="form-grid">
          <Field label="Target contract" value={target} onChange={setTarget} />
          <label className="field field-wide">
            <span>Encoded call data</span>
            <textarea
              value={data}
              onChange={(event) => setData(event.target.value)}
            />
          </label>
        </div>
        <div className="action-row">
          <Button disabled={busy || !target}>Submit transaction</Button>
        </div>
      </form>
      <section className="panel narrow">
        <h2>Queued transactions</h2>
        {transactions.length === 0 && <p>No transactions in the queue.</p>}
        {transactions.map((transaction) => (
          <div className="queue-item" key={transaction.id.toString()}>
            <div>
              <strong>#{transaction.id.toString()}</strong>
              <small>{formatAddress(transaction.target)}</small>
            </div>
            <span
              className={
                transaction.executed ? "status ready" : "status threshold"
              }
            >
              {transaction.executed
                ? "Executed"
                : `${transaction.confirmations.toString()} / 2`}
            </span>
            <div className="action-row">
              <Button
                variant="secondary"
                disabled={busy || transaction.executed}
                onClick={() =>
                  void onSubmit(async () => {
                    const call = await multisig.confirm(transaction.id);
                    await call.wait();
                  }, `Transaction #${transaction.id.toString()} confirmed.`)
                }
              >
                Confirm
              </Button>
              <Button
                disabled={
                  busy || transaction.executed || transaction.confirmations < 2n
                }
                onClick={() =>
                  void onSubmit(async () => {
                    const call = await multisig.execute(transaction.id);
                    await call.wait();
                  }, `Transaction #${transaction.id.toString()} executed.`)
                }
              >
                Execute
              </Button>
            </div>
          </div>
        ))}
      </section>
    </section>
  );
}

function CorrectionHistory({
  events,
  corrections,
}: {
  events: EventRecord[];
  corrections: CorrectionRecord[];
}) {
  return (
    <section className="panel">
      <div className="form-heading">
        <div>
          <h2>Correction history</h2>
          <p>
            Raw registry values and effective governance values remain
            separately auditable.
          </p>
        </div>
      </div>
      {events.map((event) => {
        const current = corrections
          .filter((correction) => correction.originalIndex === event.index)
          .at(-1);
        return (
          <div className="data-row" key={event.index.toString()}>
            <span>
              Event {event.index.toString()} · {formatGrams(event.co2eGrams)}
            </span>
            <span>
              {current
                ? `Effective ${formatGrams(
                    current.correctedCo2eGrams,
                  )} · correction #${current.id.toString()}`
                : "Original value"}
            </span>
          </div>
        );
      })}
      {corrections.map((correction) => (
        <div className="card" key={correction.id.toString()}>
          <span className="card-id">
            CORRECTION #{correction.id.toString()}
          </span>
          <strong>
            Event {correction.originalIndex.toString()} ·{" "}
            {formatGrams(correction.correctedCo2eGrams)}
          </strong>
          <small>
            {correction.reason} · {formatAddress(correction.correctedBy)}
            {correction.supersedesCorrectionId > 0n
              ? ` · supersedes #${correction.supersedesCorrectionId.toString()}`
              : ""}
          </small>
        </div>
      ))}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
