import { Interface } from "ethers";
import { useEffect, useState } from "react";
import Stage from "../../shared/Stage";
import { EMISSION_FACTORS } from "../../services/emissionFactors";
import Button from "../../shared/Button";
import {
  eventRegistryForControl,
  formatAddress,
  formatGrams,
  governanceForControl,
  multisigForControl,
} from "../../services/controlContracts";
import {
  ACCOUNT_CHANGE_EVENT,
  getSelectedRole,
} from "../../services/getSigner";

type Tab = "pending" | "history";
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
  eventOwner: string;
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
  const [tab, setTab] = useState<Tab>("pending");
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
        <button
          className={tab === "pending" ? "active" : ""}
          onClick={() => setTab("pending")}
        >
          Pending Corrections
        </button>
        <button
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          Correction History
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
      {tab === "pending" && (
        <VoteQueue transactions={transactions} events={events} busy={busy} onSubmit={submit} />
      )}
      {tab === "history" && (
        <CorrectionHistory events={events} corrections={corrections} />
      )}
    </>
  );
}

function VoteQueue({
  transactions,
  events,
  busy,
  onSubmit,
}: {
  transactions: MultiTransaction[];
  events: EventRecord[];
  busy: boolean;
  onSubmit: (action: () => Promise<unknown>, success: string) => Promise<void>;
}) {
  const correctEventInterface = new Interface([
    "function correctEvent(uint256 productId, uint256 originalIndex, uint256 correctedActivityData, int256 correctedEmissionFactor, string reason, bytes32 evidenceHash)",
  ]);
  const pending = transactions.flatMap((transaction) => {
    if (transaction.executed) return [];
    try {
      const decoded = correctEventInterface.decodeFunctionData("correctEvent", transaction.data);
      const originalIndex = BigInt(decoded[1].toString());
      const event = events.find((item) => item.index === originalIndex);
      if (!event) return [];
      return [{ transaction, event, activity: Number(decoded[2]) / 1000, factor: Number(decoded[3]) / 1000, reason: String(decoded[4]) }];
    } catch {
      return [];
    }
  });

  return (
    <section className="panel">
      <div className="form-heading">
        <div>
          <h2>Pending Corrections</h2>
          <p>Proposed corrections awaiting consortium confirmation.</p>
        </div>
        <span className="status threshold">{pending.length} pending</span>
      </div>
      {pending.length === 0 && <p>No pending corrections.</p>}
      <div className="audit-corrections">
        {pending.map(({ transaction, event, activity, factor, reason }) => {
          const stage = EMISSION_FACTORS.stages.find((item) => item.stageId === Number(event.stageId));
          if (!stage) return null;
          const confirmations = transaction.confirmations ?? 0n;
          const thresholdBreached = Math.abs(Number(event.co2eGrams)) > 0;
          return (
            <div className="correction-card" key={String(transaction.id ?? 0n)}>
              <Stage
                stageId={Number(event.stageId)}
                title={stage.name}
                owner={stage.actorRole}
                activity={`${activity} ${event.activityUnit}`}
                emissionFactor={`${factor} gCO2e per ${event.activityUnit}`}
                emissionSchema={stage.methodology}
                co2eKg={Number(event.co2eGrams) / 1000}
                reportingStandard={stage.methodology}
                previousEvent={event.index > 0n ? `event-${event.index - 1n}` : null}
                eventIndex={Number(event.index)}
                reason={reason}
                editable={false}
                canRecord={false}
                thresholdBreached={thresholdBreached}
                onRecord={() => undefined}
              />
              <div className="action-row">
                <span className="status threshold">{String(confirmations)} / 2 confirmations</span>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void onSubmit(async () => {
                    const call = await multisigForControl().confirm(transaction.id);
                    await call.wait();
                  }, `Correction #${String(transaction.id)} confirmed.`)}
                >Confirm</Button>
                <Button
                  disabled={busy || confirmations < 2n}
                  onClick={() => void onSubmit(async () => {
                    const call = await multisigForControl().execute(transaction.id);
                    await call.wait();
                  }, `Correction #${String(transaction.id)} executed.`)}
                >Execute</Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CorrectionHistory({ corrections }: { events: EventRecord[]; corrections: CorrectionRecord[] }) {
  return (
    <section className="panel">
      <div className="form-heading">
        <div>
          <h2>Correction History</h2>
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

