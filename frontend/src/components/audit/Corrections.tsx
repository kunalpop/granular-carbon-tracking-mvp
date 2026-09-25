import { useEffect, useState } from "react";
import Stage from "../../shared/Stage";
import { EMISSION_FACTORS } from "../../services/emissionFactors";
import {
  eventRegistryForControl,
  governanceForControl,
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
};

const PRODUCT_CACHE_KEY = "registered-product-cache";
function productId() {
  const raw = window.localStorage.getItem(PRODUCT_CACHE_KEY);
  return raw ? (JSON.parse(raw) as { productId: string }).productId : "1";
}

export default function Corrections() {
  const [events, setEvents] = useState<ChainEvent[]>([]);
  const [drafts, setDrafts] = useState<
    Record<number, { activity: number; factor: number; reason: string }>
  >({});
  const [busy, setBusy] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const id = productId();
      const registry = eventRegistryForControl();
      const governance = governanceForControl();
      const count = Number(await registry.eventCount(id));
      const next: ChainEvent[] = [];
      for (let index = 0; index < count; index++) {
        const event = await registry.eventAt(id, index);
        const stage = EMISSION_FACTORS.stages.find(
          (item) => item.stageId === Number(event.stageId),
        );
        const threshold =
          Number(await governance.stageThresholdGrams(event.stageId)) / 1000;
        const activity = Number(event.activityData) / 1000;
        const factor = Number(event.emissionFactor) / 1000;
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
        });
        if (!stage) continue;
      }
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
        {events.map((event) => {
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
          const changed =
            draft.activity !== event.activity ||
            draft.factor !== event.emissionFactor;
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
                  !busy && !event.corrected && !submitted.has(event.index)
                }
                canRecord={!event.corrected && !submitted.has(event.index)}
                recordDisabled={!changed}
                actionLabel="Submit"
                recording={busy === event.index}
                recorded={event.corrected || submitted.has(event.index)}
                thresholdBreached={breached}
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
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
