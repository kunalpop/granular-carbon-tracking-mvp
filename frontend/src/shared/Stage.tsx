import Button from "./Button";

export type StageEvent = {
  stageId: number;
  title: string;
  owner: string;
  activity: string;
  emissionFactor: string;
  emissionSchema: string;
  co2eKg: number;
  reportingStandard: string;
  previousEvent: string | null;
};

type StageProps = StageEvent & {
  recorded?: boolean;
  recording?: boolean;
  thresholdBreached?: boolean;
  onRecord: () => void;
};

export default function Stage({
  stageId,
  title,
  owner,
  activity,
  emissionFactor,
  emissionSchema,
  co2eKg,
  reportingStandard,
  previousEvent,
  recorded = false,
  recording = false,
  thresholdBreached = false,
  onRecord,
}: StageProps) {
  const statusLabel = thresholdBreached
    ? "THRESHOLD BREACHED"
    : recorded
      ? "RECORDED"
      : "PENDING";

  return (
    <article className="stage-event-card" id={`event-${stageId}`}>
      <div className="stage-event-heading">
        <span className="card-id">{String(stageId).padStart(2, "0")}</span>
        <span
          className={`status ${
            thresholdBreached ? "threshold" : recorded ? "ready" : ""
          }`}
        >
          {statusLabel}
        </span>
      </div>
      <h3>{title}</h3>
      <div className="stage-event-details">
        <div className="data-row">
          <span>Activity</span>
          <span>{activity}</span>
        </div>
        <div className="data-row">
          <span>Emission factor</span>
          <span>{emissionFactor}</span>
        </div>
        <div className="data-row">
          <span>Emission schema</span>
          <span>{emissionSchema}</span>
        </div>
        <div className="data-row">
          <span>Event owner</span>
          <span>{owner}</span>
        </div>
        <div className="data-row">
          <span>CO2e</span>
          <span>{co2eKg.toFixed(2)} kg</span>
        </div>
        <div className="data-row">
          <span>Reporting standard</span>
          <span>{reportingStandard}</span>
        </div>
        <div className="data-row">
          <span>Previous event</span>
          <span>
            {previousEvent ? (
              <a href={`#${previousEvent}`}>{previousEvent}</a>
            ) : (
              "Genesis event"
            )}
          </span>
        </div>
      </div>
      <div className="action-row">
        <Button onClick={onRecord} disabled={recorded || recording}>
          {recording ? "Recording..." : recorded ? "Event Recorded" : "Record Event"}
        </Button>
      </div>
    </article>
  );
}
