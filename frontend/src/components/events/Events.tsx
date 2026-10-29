import { useEffect, useState } from "react";
import Button from "../../shared/Button";
import Stage from "../../shared/Stage";
import { loadEmissionFactorsDirect, type EmissionFactorLibrary } from "../../services/supplyChainIpfs";
import { registerEmissionEvent } from "./registerEmissionEvent";
import { getSelectedRole, getSigner, type AccountRole } from "../../services/getSigner";
import { eventRegistryForControl } from "../../services/useContracts";
import { governanceForControl, loadStageThresholdsFromChainOrIpfs } from "../../services/controlContracts";
import { submitCorrection } from "../audit/submitCorrection";

const SELECTED_PRODUCT_KEY = "selected-product-id";
function loadRegisteredProductDescription(factors?: EmissionFactorLibrary): string {
  return factors?.referenceProduct ?? "Reference product configuration loading from IPFS";
}

type RecordedEvent = {
  eventIndex: number;
  stageId: number;
  activityValue: number;
  emissionFactor: number;
  eventOwner: string;
  co2eKg: number;
  eventHash: string;
  auditStatus: number;
  correctedActivityValue?: number;
  correctedEmissionFactor?: number;
  correctedCo2eKg?: number;
  thresholdKg?: number;
};

export default function Events() {
  const [currentStage, setCurrentStage] = useState(0);
  const [selectedRole, setSelectedRole] = useState<AccountRole>(() =>
    getSelectedRole(),
  );
  const [drafts, setDrafts] = useState<
    Record<number, { activityValue: number; emissionFactor: number }>
  >({});
  const [factors, setFactors] = useState<EmissionFactorLibrary>();
  const [productDescription, setProductDescription] = useState(
    () => loadRegisteredProductDescription(),
  );
  const [recordedEvents, setRecordedEvents] = useState<RecordedEvent[]>([]);
  const [onChainThresholds, setOnChainThresholds] = useState<Record<number, number>>({});
  const [onChainEventThresholds, setOnChainEventThresholds] = useState<Record<number, number>>({});
  const [escalatedEvents, setEscalatedEvents] = useState<Set<number>>(() => new Set());
  const [recordingStages, setRecordingStages] = useState<Set<number>>(
    () => new Set(),
  );
  const [recordingError, setRecordingError] = useState<string>();
  const [editingStages, setEditingStages] = useState<Set<number>>(() => new Set());
  const stages = factors?.stages ?? [];
  const canSeeAllStages =
    selectedRole === "deployer" || selectedRole === "auditor";
  const recordedStages = new Set(recordedEvents.map((item) => item.stageId));
  const visibleStages = canSeeAllStages
    ? stages.filter((item) => recordedStages.has(item.stageId))
    : stages.filter((item) => item.actorRole === selectedRole);
  const stage = visibleStages[currentStage] ?? visibleStages[0];
  const activeStage = stage ?? stages[0];

  useEffect(() => {
    const reloadFactors = () => {
      void loadEmissionFactorsDirect()
        .then((loaded) => {
          setFactors(loaded);
          setProductDescription(loaded.referenceProduct);
          setRecordingError(undefined);
        })
        .catch((cause) => setRecordingError(cause instanceof Error ? cause.message : "Unable to load emission factors from IPFS."));
    };
    reloadFactors();
    window.addEventListener("supply-chain-config-uploaded", reloadFactors);
    return () => window.removeEventListener("supply-chain-config-uploaded", reloadFactors);
  }, []);

  const recordedStage = activeStage ? recordedEvents.find((item) => item.stageId === activeStage.stageId) : undefined;
  const draft = activeStage ? drafts[activeStage.stageId] ?? {
    activityValue: recordedStage?.activityValue ?? activeStage.activityValue,
    emissionFactor: recordedStage?.emissionFactor ?? activeStage.emissionFactor_gCO2ePerUnit,
  } : {
    activityValue: 0,
    emissionFactor: 0,
  };
  const previousStagesRecorded = stages
    .filter((item) => item.stageId < (activeStage?.stageId ?? Number.POSITIVE_INFINITY))
    .every((item) => recordedStages.has(item.stageId));
  const eventLocked =
    !canSeeAllStages &&
    activeStage !== undefined &&
    !recordedStages.has(activeStage.stageId) &&
    !previousStagesRecorded;

  useEffect(() => {
    const updateRole = () => {
      setSelectedRole(getSelectedRole());
      setCurrentStage(0);
    };
    window.addEventListener("control-account-change", updateRole);
    return () =>
      window.removeEventListener("control-account-change", updateRole);
  }, []);

  useEffect(() => {
    const loadSelectedProductEvents = async () => {
      const selectedId = window.localStorage.getItem(SELECTED_PRODUCT_KEY) ?? "new";
      setProductDescription(loadRegisteredProductDescription(factors));
      if (selectedId === "new") {
        setRecordedEvents([]);
        return;
      }

      try {
        const registry = eventRegistryForControl();
        const governance = governanceForControl();
        const productId = BigInt(selectedId);
        const product = await registry.getProduct(productId);
        setProductDescription(String(product.description));
        const count = Number(await registry.eventCount(productId));
        const correctionCount = Number(await governance.correctionCount());
        const thresholds = await loadStageThresholdsFromChainOrIpfs(stages.map((item) => item.stageId));
        setOnChainThresholds(thresholds);
        const corrections = new Map<number, { activity: number; factor: number; co2e: number }>();
        for (let correctionId = 1; correctionId <= correctionCount; correctionId++) {
          const correction = await governance.correctionAt(correctionId);
          if (BigInt(correction.productId.toString()) !== productId) continue;
          corrections.set(Number(correction.originalIndex), {
            activity: Number(correction.correctedActivityData) / 1000,
            factor: Number(correction.correctedEmissionFactor) / 1000,
            co2e: Number(correction.correctedCo2eGrams) / 1000,
          });
        }
        const events = await Promise.all(
          Array.from({ length: count }, (_, index) => registry.eventAt(productId, index)),
        );
        const escalationCount = Number(await governance.escalationCount());
        const escalatedIndexes = new Set<number>();
        for (let index = 0; index < escalationCount; index++) {
          const escalation = await governance.escalationAt(index);
          if (BigInt(escalation[0].toString()) === productId) escalatedIndexes.add(Number(escalation[1]));
        }
        const loadedRecordedEvents = await Promise.all(events.map(async (record, index) => {
          const correction = corrections.get(index);
          return {
            eventIndex: index,
            stageId: Number(record.stageId),
            activityValue: Number(record.activityData) / 1000,
            emissionFactor: Number(record.emissionFactor) / 1000,
            eventOwner: String(record.actor),
            co2eKg: correction?.co2e ?? Number(record.co2eGrams) / 1000,
            eventHash: String(record.eventHash),
            auditStatus: Number(await registry.auditStatus(productId, BigInt(index))),
            correctedActivityValue: correction?.activity,
            correctedEmissionFactor: correction?.factor,
            correctedCo2eKg: correction?.co2e,
            thresholdKg: thresholds[Number(record.stageId)] ?? 0,
          };
        }));
        setRecordedEvents(loadedRecordedEvents);
        setEscalatedEvents(escalatedIndexes);
        setOnChainEventThresholds(Object.fromEntries(loadedRecordedEvents.map((item) => [item.eventIndex, thresholds[item.stageId] ?? 0])));
      } catch {
        setRecordedEvents([]);
      }
    };

    const updateProduct = () => void loadSelectedProductEvents();
    void loadSelectedProductEvents();
    window.addEventListener("product-selection-change", updateProduct);
    window.addEventListener("product-registration-change", updateProduct);
      window.addEventListener("governance-screening-change", updateProduct);
    return () => {
      window.removeEventListener("product-selection-change", updateProduct);
      window.removeEventListener("product-registration-change", updateProduct);
        window.removeEventListener("governance-screening-change", updateProduct);
    };
  }, [factors]);

  if (!factors || !activeStage) {
    return recordingError ? <section className="panel"><p>{recordingError}</p></section> : null;
  }

  const displayedActivity = recordedStage?.correctedActivityValue ?? draft.activityValue;
  const displayedFactor = recordedStage?.correctedEmissionFactor ?? draft.emissionFactor;
  const isEditing = selectedRole === "deployer" && editingStages.has(activeStage.stageId);
  const event = {
    stageId: activeStage.stageId,
    title: activeStage.name,
    owner: activeStage.actorRole,
    activity: `${displayedActivity.toFixed(2)} ${activeStage.activityUnit}`,
    emissionFactor: `${displayedFactor.toFixed(2)} gCO2e per ${
      activeStage.activityUnit
    }`,
    emissionSchema: factors?.schemaVersion ?? "",
    co2eKg: isEditing ? (draft.activityValue * draft.emissionFactor) / 1000 : recordedStage?.co2eKg ??
      (displayedActivity * displayedFactor) / 1000,
    thresholdKg: onChainEventThresholds[recordedStage?.eventIndex ?? activeStage.stageId - 1] ?? onChainThresholds[activeStage.stageId] ?? 0,
    reportingStandard: activeStage.methodology,
    previousEvent:
      currentStage > 0 ? `event-${stages[currentStage - 1].stageId}` : null,
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
    if (eventLocked || canSeeAllStages || !activeStage || !factors) return;
    setRecordingError(undefined);
    setRecordingStages((previous) =>
      new Set(previous).add(activeStage.stageId),
    );
    try {
      const result = await registerEmissionEvent(
        {
          ...activeStage,
          notes: activeStage.notes ?? "",
          activityValue: draft.activityValue,
          emissionFactor_gCO2ePerUnit: draft.emissionFactor,
        },
        factors?.schemaVersion ?? "",
      );
      const onChainThresholdKg = Number(
        await governanceForControl().stageThresholdGrams(activeStage.stageId),
      ) / 1000;
      const nextRecordedEvents = [
        ...recordedEvents.filter(
          (item) => item.stageId !== activeStage.stageId,
        ),
        {
          eventIndex: activeStage.stageId - 1,
          stageId: activeStage.stageId,
          activityValue: draft.activityValue,
          emissionFactor: draft.emissionFactor,
          eventOwner: getSigner(activeStage.actorRole as AccountRole).address,
          co2eKg: result.co2eKg,
          eventHash: result.eventHash,
          auditStatus: 0,
          thresholdKg: onChainThresholdKg,
        },
      ];
      setRecordedEvents(nextRecordedEvents);
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

  if (canSeeAllStages && recordedEvents.length === 0) {
    return (
      <>
        <div className="page-heading">
          <div>
            <div className="kicker">PRODUCT FOOTPRINTS</div>
            <h1>{canSeeAllStages ? "Walk The Product Lifecycle" : "Record Event(s)"}</h1>
          </div>
        </div>
        <section className="panel">
          <p>
            Events recorded by participants will appear here.
          </p>
        </section>
      </>
    );
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="kicker">PRODUCT FOOTPRINTS</div>
          <h1>{canSeeAllStages ? "Walk The Product Lifecycle" : "Record Event(s)"}</h1>
        </div>
      </div>

      <div className="section-grid">
        <section className="panel wide">
          <h2 style={{ marginTop: 20 }}>Emission event pipeline</h2>
          <div className="stage-slider" aria-label="Lifecycle events">
            {visibleStages.length > 1 && currentStage > 0 ? (
              <Button
                variant="secondary"
                className="slider-arrow"
                onClick={() =>
                  setCurrentStage((index) => Math.max(0, index - 1))
                }
                aria-label="Previous event"
              >
                ←
              </Button>
            ) : (
              <span className="slider-arrow-placeholder" aria-hidden="true" />
            )}
            <Stage
              {...event}
              editable={
                (!canSeeAllStages && !recordedStages.has(activeStage.stageId)) ||
                (selectedRole === "deployer" && editingStages.has(activeStage.stageId))
              }
              canRecord={!canSeeAllStages}
              locked={eventLocked}
              onActivityChange={(value) =>
                setDrafts((current) => ({
                  ...current,
                  [activeStage.stageId]: {
                    ...draft,
                    activityValue: Number(value) || 0,
                  },
                }))
              }
              onEmissionFactorChange={(value) =>
                setDrafts((current) => ({
                  ...current,
                  [activeStage.stageId]: {
                    ...draft,
                      emissionFactor: Number(value) || 0,
                  },
                }))
              }
              recorded={recordedStages.has(activeStage.stageId)}
              auditStatus={
                recordedEvents.find((item) => item.stageId === activeStage.stageId)?.auditStatus === 2
                  ? "Audited"
                  : recordedEvents.find((item) => item.stageId === activeStage.stageId)?.auditStatus === 1
                    ? "Pending"
                    : "Unaudited"
              }
              recording={recordingStages.has(activeStage.stageId)}
              thresholdKg={onChainEventThresholds[recordedStage?.eventIndex ?? activeStage.stageId - 1] ?? onChainThresholds[activeStage.stageId] ?? 0}
              thresholdBreached={
                recordedStages.has(activeStage.stageId) && (event.thresholdKg ?? 0) > 0 && event.co2eKg > (event.thresholdKg ?? 0)
              }
              escalated={(escalatedEvents.has(recordedStage?.eventIndex ?? activeStage.stageId - 1) || recordedStage?.auditStatus === 2) && (event.thresholdKg ?? 0) > 0 && event.co2eKg > (event.thresholdKg ?? 0)}
              editControl={selectedRole === "deployer" && recordedStages.has(activeStage.stageId) ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="stage-edit-button"
                  onClick={() => void (async () => {
                    if (!editingStages.has(activeStage.stageId)) {
                      setDrafts((current) => ({ ...current, [activeStage.stageId]: draft }));
                      setEditingStages((current) => new Set(current).add(activeStage.stageId));
                      return;
                    }
                    setRecordingError(undefined);
                    try {
                      const productId = BigInt(window.localStorage.getItem(SELECTED_PRODUCT_KEY) ?? "0");
                      await submitCorrection(
                        productId.toString(),
                        String(recordedStage?.eventIndex ?? activeStage.stageId - 1),
                        draft.activityValue,
                        draft.emissionFactor,
                        "Deployer event edit",
                        recordedStage?.eventOwner ?? getSigner(activeStage.actorRole as AccountRole).address,
                      );
                      setEditingStages((current) => { const next = new Set(current); next.delete(activeStage.stageId); return next; });
                    } catch (cause) {
                      setRecordingError(cause instanceof Error ? cause.message : "Unable to update event on chain.");
                    }
                  })()}
                >
                  {editingStages.has(activeStage.stageId) ? "Done" : "Edit"}
                </Button>
              ) : undefined}
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
                ? stagesOverLimit
                    .map((lifecycleStage) => lifecycleStage.name)
                    .join(", ")
                : "None"}
            </span>
          </div>
        </section>
      </div>
    </>
  );
}
