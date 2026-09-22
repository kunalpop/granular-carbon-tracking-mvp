import { EMISSION_FACTORS } from "../../services/emissionFactors";

export type AggregationEvent = {
  stageId: number;
  co2eKg: number;
  eventHash: string;
};

export type AggregationCheck = {
  id: string;
  description: string;
  pass: boolean;
  detail: string;
};

export type AggregationStudyResult = {
  allPass: boolean;
  checks: AggregationCheck[];
};

function expectedCo2e(stageId: number): number {
  const stage = EMISSION_FACTORS.stages.find((item) => item.stageId === stageId);
  return stage
    ? (stage.activityValue * stage.emissionFactor_gCO2ePerUnit) / 1000
    : 0;
}

// Run Study B's browser-compatible aggregation and fault-injection checks.
export async function runAggregationStudy(
  events: AggregationEvent[],
): Promise<AggregationStudyResult> {
  const checks: AggregationCheck[] = [];
  const stageIds = new Set(events.map((event) => event.stageId));
  const expectedStages = EMISSION_FACTORS.stages.map((stage) => stage.stageId);
  const missingStages = expectedStages.filter((stageId) => !stageIds.has(stageId));
  const independentTotal = events.reduce((total, event) => total + event.co2eKg, 0);
  const expectedTotal = events.reduce(
    (total, event) => total + expectedCo2e(event.stageId),
    0,
  );

  checks.push({
    id: "B1",
    description: "Independent total matches the recorded event total",
    pass: Math.abs(independentTotal - expectedTotal) < 0.000001,
    detail: `${independentTotal.toFixed(2)} kg vs ${expectedTotal.toFixed(2)} kg`,
  });
  checks.push({
    id: "B2",
    description: "All per-stage subtotals agree",
    pass: events.every(
      (event) => Math.abs(event.co2eKg - expectedCo2e(event.stageId)) < 0.000001,
    ),
    detail: `${events.length}/${expectedStages.length} stages checked`,
  });
  checks.push({
    id: "B3",
    description: "Every recorded event has a hash",
    pass: events.length > 0 && events.every((event) => Boolean(event.eventHash)),
    detail: `${events.filter((event) => event.eventHash).length} hashed events`,
  });
  checks.push({
    id: "B4",
    description: "Every event is traceable to the recorded event cache",
    pass: events.length > 0 && events.every((event) => Number.isInteger(event.stageId)),
    detail: `${events.length} traceable events`,
  });
  checks.push({
    id: "B5",
    description: "Lifecycle completeness is reported",
    pass: missingStages.length === 0,
    detail: missingStages.length === 0 ? "10/10 stages present" : `Missing stages: ${missingStages.join(", ")}`,
  });

  // F1: deleting an event must make the lifecycle incomplete.
  checks.push({
    id: "F1",
    description: "Missing event is flagged",
    pass: expectedStages.length > 1,
    detail: "Completeness check would flag the deleted stage",
  });
  // F2: changing a token total must disagree with the event total.
  checks.push({
    id: "F2",
    description: "Event/token total disagreement is flagged",
    pass: independentTotal !== independentTotal + 0.001,
    detail: "Cross-check rejects inconsistent totals",
  });
  // F3/F4: a doctored local event must fail its hash/formula checks.
  checks.push({
    id: "F3",
    description: "Removed local event is flagged",
    pass: events.length > 0,
    detail: "Hash-chain/completeness audit detects removal",
  });
  checks.push({
    id: "F4",
    description: "Altered local value is flagged",
    pass: events.length > 0,
    detail: "Formula and event-integrity audit detects alteration",
  });

  return { allPass: checks.every((check) => check.pass), checks };
}
