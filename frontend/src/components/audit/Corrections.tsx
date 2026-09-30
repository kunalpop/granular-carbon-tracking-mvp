import { Interface } from "ethers";
import { useEffect, useState } from "react";
import Stage from "../../shared/Stage";
import { EMISSION_FACTORS } from "../../services/emissionFactors";
import {
  eventRegistryForControl,
  governanceForControl,
  multisigForControl,
} from "../../services/controlContracts";
import { submitCorrection } from "./submitCorrection";

type ChainEvent = {
  index: number;
  stageId: number;
  activity: number;
  unit: string;
  emissionFactor: number;
  co2eKg: number;
  eventHash: string;
  thresholdKg: number;
  corrected: boolean;
  eventOwner: string;
  auditStatus: number;
};

const SELECTED_PRODUCT_KEY = "selected-product-id";
function productId() {
  const selected = window.localStorage.getItem(SELECTED_PRODUCT_KEY);
  return selected && selected !== "new" ? selected : "1";
}

export default function Corrections() {
  const [events, setEvents] = useState<ChainEvent[]>([]);
  const [drafts, setDrafts] = useState<
    Record<number, { activity: number; factor: number; reason: string }>
  >({});
  const [busy, setBusy] = useState<number | null>(null);
  const [discarding, setDiscarding] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState<Set<number>>(new Set());
  const [discarded, setDiscarded] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 4000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const load = async () => {
    try {
      const id = productId();
      const registry = eventRegistryForControl();
      const governance = governanceForControl();
      const count = Number(await registry.eventCount(id));
      const discardedIndexes = new Set<number>();
      const next: ChainEvent[] = [];
      for (let index = 0; index < count; index++) {
        if (await governance.discardedCorrectionTask(id, index)) discardedIndexes.add(index);
        const event = await registry.eventAt(id, index);
        const stage = EMISSION_FACTORS.stages.find(
          (item) => item.stageId === Number(event.stageId),
        );
        const threshold =
          Number(await governance.stageThresholdGrams(event.stageId)) / 1000;
        const activity = Number(event.activityData) / 1000;
        const factor = Number(event.emissionFactor) / 1000;
        const auditStatus = Number(await registry.auditStatus(id, index));
        next.push({
          index,
          stageId: Number(event.stageId),
          activity,
          unit: event.activityUnit,
          emissionFactor: factor,
          co2eKg: Number(event.co2eGrams) / 1000,
          eventHash: event.eventHash,
          thresholdKg: threshold,
          corrected: false,
          eventOwner: event.actor,
          auditStatus,
        });
        if (!stage) continue;
      }
      const submittedIndexes = new Set<number>();
      const multisig = multisigForControl();
      const transactionCount = Number(await multisig.transactionCount());
      const decoder = new Interface(["function correctEvent(uint256,uint256,uint256,int256,string,bytes32)"]);
      for (let transactionId = 0; transactionId < transactionCount; transactionId++) {
        const transaction = await multisig.transactionAt(transactionId);
        try {
          const args = decoder.decodeFunctionData("correctEvent", transaction.data);
          if (String(args[0]) === String(id)) submittedIndexes.add(Number(args[1]));
        } catch {
          // Ignore non-correction multisig transactions.
        }
      }
      setSubmitted(submittedIndexes);
      setDiscarded(discardedIndexes);
      setEvents(next);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load event chain.",
      );
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const correct = async (event: ChainEvent) => {
    const draft = drafts[event.index] ?? {
      activity: event.activity,
      factor: event.emissionFactor,
      reason: `Correction for Stage ${event.stageId}: `,
    };
    setBusy(event.index);
    setError("");
    setMessage("");
    try {
      await submitCorrection(
        productId(),
        String(event.index),
        draft.activity,
        draft.factor,
        draft.reason,
        event.eventOwner,
      );
      setSubmitted((current) => new Set(current).add(event.index));
      setMessage(
        `Stage ${event.stageId} correction proposed to the consortium.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Correction failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="panel">
      {message && <p className="feedback success">{message}</p>}
      {error && <p className="feedback error">{error}</p>}
      {events.length === 0 && (
        <p>No recorded events are available for correction.</p>
      )}
      <div className="audit-corrections">
        {events.filter((event) => !discarded.has(event.index) && event.auditStatus !== 2).map((event) => {
          const stage = EMISSION_FACTORS.stages.find(
            (item) => item.stageId === event.stageId,
          );
          if (!stage) return null;
          const draft = drafts[event.index] ?? {
            activity: event.activity,
            factor: event.emissionFactor,
            reason: `Correction for Stage ${event.stageId}: `,
          };
          const breached =
            event.thresholdKg > 0 && Math.abs(event.co2eKg) > event.thresholdKg;
          const initialReason = `Correction for Stage ${event.stageId}: `;
          const changed =
            draft.activity !== event.activity ||
            draft.factor !== event.emissionFactor ||
            draft.reason !== initialReason;
          return (
            <div className="correction-card" key={event.index}>
              <Stage
                stageId={event.stageId}
                title={stage.name}
                owner={stage.actorRole}
                activity={`${draft.activity} ${event.unit}`}
                emissionFactor={`${draft.factor} gCO2e per ${event.unit}`}
                emissionSchema={stage.methodology}
                co2eKg={event.co2eKg}
                reportingStandard={stage.methodology}
                previousEvent={
                  event.index > 0
                    ? `event-${events[event.index - 1]?.stageId}`
                    : null
                }
                eventIndex={event.index}
                reason={draft.reason}
                onReasonChange={(value) =>
                  setDrafts((current) => ({
                    ...current,
                    [event.index]: { ...draft, reason: value },
                  }))
                }
                editable={
                  busy !== event.index && !event.corrected && !submitted.has(event.index)
                }
                canRecord={!event.corrected && !submitted.has(event.index)}
                recordDisabled={!changed}
                actionLabel="Submit"
                recording={busy === event.index}
                discarding={discarding === event.index}
                recorded={event.corrected}
                pendingVote={submitted.has(event.index)}
                thresholdBreached={breached}
                thresholdKg={event.thresholdKg}
                onActivityChange={(value) =>
                  setDrafts((current) => ({
                    ...current,
                    [event.index]: { ...draft, activity: Number(value) || 0 },
                  }))
                }
                onActivityBlur={() =>
                  setDrafts((current) => ({
                    ...current,
                    [event.index]: {
                      ...draft,
                      activity:
                        Number.isFinite(draft.activity) && draft.activity > 0
                          ? draft.activity
                          : event.activity,
                    },
                  }))
                }
                onEmissionFactorChange={(value) =>
                  setDrafts((current) => ({
                    ...current,
                    [event.index]: { ...draft, factor: Number(value) || 0 },
                  }))
                }
                onEmissionFactorBlur={() =>
                  setDrafts((current) => ({
                    ...current,
                    [event.index]: {
                      ...draft,
                      factor:
                        Number.isFinite(draft.factor) && draft.factor !== 0
                          ? draft.factor
                          : event.emissionFactor,
                    },
                  }))
                }
                onRecord={() => void correct(event)}
                onDiscard={() => {
                  void (async () => {
                    setDiscarding(event.index);
                    setError("");
                    try {
                      const governance = governanceForControl();
                      const transaction = await governance.discardCorrectionTask(productId(), event.index);
                      await transaction.wait();
                      setDiscarded((current) => new Set(current).add(event.index));
                      setMessage(`Stage ${event.stageId} task discarded.`);
                    } catch (cause) {
                      setError(cause instanceof Error ? cause.message : "Unable to discard task.");
                    } finally {
                      setDiscarding(null);
                    }
                  })();
                }}

              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
