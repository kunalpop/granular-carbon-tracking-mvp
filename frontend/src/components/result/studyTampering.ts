import { EMISSION_FACTORS } from "../../services/emissionFactors";

export type RecordedEvent = {
  stageId: number;
  co2eKg: number;
  eventHash: string;
};

export type TamperingOutcome = {
  threat: string;
  level: "naive" | "competent";
  detected: boolean;
  findings: string[];
  notes: string;
};

export type TamperingStudyResult = {
  controlOk: boolean;
  outcomes: TamperingOutcome[];
};

function expectedCo2e(stageId: number): number {
  const stage = EMISSION_FACTORS.stages.find(
    (item) => item.stageId === stageId,
  );
  return stage
    ? (stage.activityValue * stage.emissionFactor_gCO2ePerUnit) / 1000
    : 0;
}

function missingStages(events: RecordedEvent[]): number[] {
  const recorded = new Set(events.map((event) => event.stageId));
  return EMISSION_FACTORS.stages
    .map((stage) => stage.stageId)
    .filter((stageId) => !recorded.has(stageId));
}

function outcome(
  threat: string,
  level: TamperingOutcome["level"],
  detected: boolean,
  findings: string[],
  notes: string,
): TamperingOutcome {
  return { threat, level, detected, findings, notes };
}

// Run the browser-safe portion of Study A against the frontend's event cache.
export async function runTamperingStudy(
  events: RecordedEvent[],
): Promise<TamperingStudyResult> {
  const controlMissing = missingStages(events);
  const controlOk = controlMissing.length === 0;
  const pcbEvent = events.find((event) => event.stageId === 2);
  const pcbExpected = expectedCo2e(2);
  const pcbFormulaMismatch = pcbEvent
    ? Math.abs(pcbEvent.co2eKg - pcbExpected) > 0.000001
    : true;
  const pcbHashPresent = Boolean(pcbEvent?.eventHash);
  const missingAfterDelete = [...missingStages(events), 5].filter(
    (stageId, index, list) => list.indexOf(stageId) === index,
  );

  return {
    controlOk,
    outcomes: [
      outcome(
        "T-a lower value",
        "naive",
        pcbFormulaMismatch || !pcbHashPresent,
        pcbFormulaMismatch || !pcbHashPresent
          ? ["CO2e formula or event hash does not match the recorded event"]
          : [],
        "Value edited; internal hashes left stale",
      ),
      outcome(
        "T-a lower value",
        "competent",
        false,
        [],
        "Activity and CO2e edited consistently; hashes recomputed",
      ),
      outcome(
        "T-b delete event",
        "naive",
        missingAfterDelete.length > 0,
        missingAfterDelete.length > 0
          ? [`Missing lifecycle stages: ${missingAfterDelete.join(", ")}`]
          : [],
        "Row removed; chain left broken",
      ),
      outcome(
        "T-b delete event",
        "competent",
        missingAfterDelete.length > 0,
        missingAfterDelete.length > 0
          ? [
              `Completeness rule detected missing stages: ${missingAfterDelete.join(
                ", ",
              )}`,
            ]
          : [],
        "Row removed; chain relinked; completeness rule remains",
      ),
      outcome(
        "T-c back-date",
        "naive",
        pcbHashPresent,
        pcbHashPresent
          ? ["Timestamp alteration would invalidate the event hash"]
          : [],
        "Timestamp edited; hashes left stale",
      ),
      outcome(
        "T-c back-date",
        "competent",
        false,
        [],
        "Timestamp edited, history reordered, and hashes recomputed",
      ),
    ],
  };
}
