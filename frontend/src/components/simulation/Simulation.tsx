import { useEffect, useState } from "react";
import Button from "../../shared/Button";
import Stage from "../../shared/Stage";
import { EMISSION_FACTORS } from "../../services/emissionFactors";
import { registerEmissionEvent } from "./registerEmissionEvent";

const SCALE = 1000n;
const EVENTS_CACHE_KEY = "registered-emission-events-cache";

type RecordedEvent = {
  stageId: number;
  co2eKg: number;
  eventHash: string;
};

export default function Simulation() {
  const [currentStage, setCurrentStage] = useState(0);
  const [recordedEvents, setRecordedEvents] = useState<RecordedEvent[]>(() => {
    try {
      return JSON.parse(
        window.localStorage.getItem(EVENTS_CACHE_KEY) ?? "[]",
      ) as RecordedEvent[];
    } catch {
      return [];
    }
  });
  const [recordingStages, setRecordingStages] = useState<Set<number>>(
    () => new Set(),
  );
  const [recordingError, setRecordingError] = useState<string>();
  const stages = EMISSION_FACTORS.stages;
  const stage = stages[currentStage];
  const recordedStages = new Set(recordedEvents.map((item) => item.stageId));

  useEffect(() => {
    window.localStorage.setItem(EVENTS_CACHE_KEY, JSON.stringify(recordedEvents));
  }, [recordedEvents]);
  const event = {
    stageId: stage.stageId,
    title: stage.name,
    owner: stage.actorRole,
    activity: `${stage.activityValue} ${stage.activityUnit}`,
    emissionFactor: `${stage.emissionFactor_gCO2ePerUnit / Number(SCALE)} gCO2e per ${stage.activityUnit}`,
    emissionSchema: EMISSION_FACTORS.schemaVersion,
    co2eKg: (stage.activityValue * stage.emissionFactor_gCO2ePerUnit) / 1000,
    reportingStandard: stage.methodology,
    previousEvent:
      currentStage > 0
        ? `event-${stages[currentStage - 1].stageId}`
        : null,
  };

  const co2eForStage = (lifecycleStage: (typeof stages)[number]) =>
    (lifecycleStage.activityValue *
      lifecycleStage.emissionFactor_gCO2ePerUnit) /
    1000;

  const registeredStageData = stages.filter((lifecycleStage) =>
    recordedStages.has(lifecycleStage.stageId),
  );
  const totalCo2eKg = registeredStageData.reduce(
    (total, lifecycleStage) => total + co2eForStage(lifecycleStage),
    0,
  );
  const stagesOverLimit = registeredStageData.filter((lifecycleStage) => {
    const limit = (lifecycleStage as { co2eLimitKg?: number }).co2eLimitKg;
    return limit !== undefined && co2eForStage(lifecycleStage) > limit;
  });

  const recordCurrentStage = async () => {
    setRecordingError(undefined);
    setRecordingStages((previous) => new Set(previous).add(stage.stageId));
    try {
      const result = await registerEmissionEvent(
        stage,
        EMISSION_FACTORS.schemaVersion,
      );
      const nextRecordedEvents = [
        ...recordedEvents.filter((item) => item.stageId !== stage.stageId),
        {
          stageId: stage.stageId,
          co2eKg: result.co2eKg,
          eventHash: result.eventHash,
        },
      ];
      setRecordedEvents(nextRecordedEvents);
      window.localStorage.setItem(
        EVENTS_CACHE_KEY,
        JSON.stringify(nextRecordedEvents),
      );
      window.dispatchEvent(new Event("simulation-registration-change"));
    } catch (cause) {
      setRecordingError(
        cause instanceof Error ? cause.message : "Event recording failed.",
      );
    } finally {
      setRecordingStages((previous) => {
        const next = new Set(previous);
        next.delete(stage.stageId);
        return next;
      });
    }
  };

  const stageLimit = (stage as { co2eLimitKg?: number }).co2eLimitKg;
  const thresholdBreached =
    stageLimit !== undefined && co2eForStage(stage) > stageLimit;

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="kicker">Lifecycle simulation</div>
          <h1>Walk the lifecycle</h1>
        </div>
        <p>
          Run the configured lifecycle stages and record one emission event for
          each participant in sequence.
        </p>
      </div>

      <div className="section-grid">
        <section className="panel wide">
          <h2 style={{ marginTop: 20 }}>Emission event pipeline</h2>
          <div className="stage-slider" aria-label="Lifecycle events">
            <Button
              variant="secondary"
              className="slider-arrow"
              onClick={() => setCurrentStage((index) => Math.max(0, index - 1))}
              disabled={currentStage === 0}
              aria-label="Previous event"
            >
              ←
            </Button>
            <Stage
              {...event}
              recorded={recordedStages.has(stage.stageId)}
              recording={recordingStages.has(stage.stageId)}
              thresholdBreached={
                recordedStages.has(stage.stageId) && thresholdBreached
              }
              onRecord={recordCurrentStage}
            />
            {currentStage < stages.length - 1 && (
              <Button
                variant="secondary"
                className="slider-arrow"
                onClick={() => setCurrentStage((index) => index + 1)}
                disabled={!recordedStages.has(stage.stageId)}
                aria-label="Next event"
              >
                →
              </Button>
            )}
          </div>
          <p className="slider-position">
            Event {currentStage + 1} of {stages.length}
          </p>
          {recordingError && <p role="alert">{recordingError}</p>}
        </section>

        <section className="panel narrow">
          <h2>Simulation summary</h2>
          <div className="data-row">
            <span>Reference product</span>
            <span>{EMISSION_FACTORS.referenceProduct}</span>
          </div>
          <div className="data-row">
            <span>Registered Events</span>
            <span>
              {recordedStages.size} / {stages.length}
            </span>
          </div>
          <div className="data-row">
            <span>Total CO2e</span>
            <span>{totalCo2eKg.toFixed(2)} kg</span>
          </div>
          <div className="data-row">
            <span>Stages over CO2e limit</span>
            <span>
              {stagesOverLimit.length > 0
                ? stagesOverLimit.map((lifecycleStage) => lifecycleStage.name).join(", ")
                : "None"}
            </span>
          </div>
        </section>
      </div>
    </>
  );
}
