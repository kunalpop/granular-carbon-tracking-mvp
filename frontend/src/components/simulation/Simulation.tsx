import { useEffect, useState } from "react";
import Button from "../../shared/Button";
import Stage from "../../shared/Stage";
import { EMISSION_FACTORS } from "../../services/emissionFactors";
import { registerEmissionEvent } from "./registerEmissionEvent";
import { getSelectedRole, type AccountRole } from "../../services/getSigner";

const SCALE = 1000n;
const EVENTS_CACHE_KEY = "registered-emission-events-cache";
const PRODUCT_CACHE_KEY = "registered-product-cache";

function loadRegisteredProductDescription(): string {
  try {
    const saved = JSON.parse(window.localStorage.getItem(PRODUCT_CACHE_KEY) ?? "null") as { description?: string } | null;
    return saved?.description ?? EMISSION_FACTORS.referenceProduct;
  } catch {
    return EMISSION_FACTORS.referenceProduct;
  }
}

type RecordedEvent = {
  stageId: number;
  co2eKg: number;
  eventHash: string;
};

export default function Simulation() {
  const [currentStage, setCurrentStage] = useState(0);
  const [selectedRole, setSelectedRole] = useState<AccountRole>(() => getSelectedRole());
  const [drafts, setDrafts] = useState<Record<number, { activityValue: number; emissionFactor: number }>>({});
  const [productDescription, setProductDescription] = useState(loadRegisteredProductDescription);
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
  const canSeeAllStages = selectedRole === "deployer" || selectedRole === "auditor";
  const recordedStages = new Set(recordedEvents.map((item) => item.stageId));
  const visibleStages = canSeeAllStages
    ? stages.filter((item) => recordedStages.has(item.stageId))
    : stages.filter((item) => item.actorRole === selectedRole);
  const stage = visibleStages[currentStage] ?? visibleStages[0];
  const activeStage = stage ?? stages[0];
  const draft = drafts[activeStage.stageId] ?? { activityValue: activeStage.activityValue, emissionFactor: activeStage.emissionFactor_gCO2ePerUnit };
  const previousStagesRecorded = stages
    .filter((item) => item.stageId < activeStage.stageId)
    .every((item) => recordedStages.has(item.stageId));
  const eventLocked = !canSeeAllStages && !recordedStages.has(activeStage.stageId) && !previousStagesRecorded;

  useEffect(() => {
    window.localStorage.setItem(EVENTS_CACHE_KEY, JSON.stringify(recordedEvents));
  }, [recordedEvents]);

  useEffect(() => {
    const updateRole = () => {
      setSelectedRole(getSelectedRole());
      setCurrentStage(0);
    };
    window.addEventListener("control-account-change", updateRole);
    return () => window.removeEventListener("control-account-change", updateRole);
  }, []);

  useEffect(() => {
    const updateProduct = () => setProductDescription(loadRegisteredProductDescription());
    window.addEventListener("product-registration-change", updateProduct);
    return () => window.removeEventListener("product-registration-change", updateProduct);
  }, []);
  const event = {
    stageId: activeStage.stageId,
    title: activeStage.name,
    owner: activeStage.actorRole,
    activity: `${draft.activityValue} ${activeStage.activityUnit}`,
    emissionFactor: `${draft.emissionFactor / Number(SCALE)} gCO2e per ${activeStage.activityUnit}`,
    emissionSchema: EMISSION_FACTORS.schemaVersion,
    co2eKg: (draft.activityValue * draft.emissionFactor) / 1000,
    reportingStandard: activeStage.methodology,
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
    if (eventLocked || canSeeAllStages) return;
    setRecordingError(undefined);
    setRecordingStages((previous) => new Set(previous).add(activeStage.stageId));
    try {
      const result = await registerEmissionEvent(
        { ...activeStage, activityValue: draft.activityValue, emissionFactor_gCO2ePerUnit: draft.emissionFactor },
        EMISSION_FACTORS.schemaVersion,
      );
      const nextRecordedEvents = [
        ...recordedEvents.filter((item) => item.stageId !== activeStage.stageId),
        {
          stageId: activeStage.stageId,
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
        next.delete(activeStage.stageId);
        return next;
      });
    }
  };

  const stageLimit = (activeStage as { co2eLimitKg?: number }).co2eLimitKg;
  const thresholdBreached =
    stageLimit !== undefined && co2eForStage(activeStage) > stageLimit;

  if (canSeeAllStages && recordedEvents.length === 0) {
    return (
      <>
        <div className="page-heading">
          <div>
            <div className="kicker">Lifecycle simulation</div>
            <h1>Walk the lifecycle</h1>
          </div>
          <p>No events have been recorded by participants yet.</p>
        </div>
        <section className="panel">
          <p>Recorded events will appear here after participants submit them.</p>
        </section>
      </>
    );
  }

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
            {visibleStages.length > 1 && currentStage > 0 ? (
              <Button
                variant="secondary"
                className="slider-arrow"
                onClick={() => setCurrentStage((index) => Math.max(0, index - 1))}
                aria-label="Previous event"
              >
                ←
              </Button>
            ) : (
              <span className="slider-arrow-placeholder" aria-hidden="true" />
            )}
            <Stage
              {...event}
              editable={!canSeeAllStages && !recordedStages.has(activeStage.stageId)}
              canRecord={!canSeeAllStages}
              locked={eventLocked}
              onActivityChange={(value) => setDrafts((current) => ({ ...current, [activeStage.stageId]: { ...draft, activityValue: Number(value) || 0 } }))}
              onEmissionFactorChange={(value) => setDrafts((current) => ({ ...current, [activeStage.stageId]: { ...draft, emissionFactor: (Number(value) || 0) * Number(SCALE) } }))}
              recorded={recordedStages.has(activeStage.stageId)}
              recording={recordingStages.has(activeStage.stageId)}
              thresholdBreached={
                recordedStages.has(activeStage.stageId) && thresholdBreached
              }
              onRecord={recordCurrentStage}
            />
            {currentStage < visibleStages.length - 1 ? (
              <Button
                variant="secondary"
                className="slider-arrow"
                onClick={() => setCurrentStage((index) => index + 1)}
                disabled={!recordedStages.has(activeStage.stageId)}
                aria-label="Next event"
              >
                →
              </Button>
            ) : (
              <span className="slider-arrow-placeholder" aria-hidden="true" />
            )}
          </div>
          <p className="slider-position">
            Event {currentStage + 1} of {visibleStages.length}
          </p>
          {recordingError && <p role="alert">{recordingError}</p>}
        </section>

        <section className="panel narrow">
          <h2>Simulation summary</h2>
          <div className="data-row">
            <span>Reference product</span>
            <span>{productDescription}</span>
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
