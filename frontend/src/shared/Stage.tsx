import { useState } from "react";
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
  eventIndex?: number;
  reason?: string;
};

type StageProps = StageEvent & {
  recorded?: boolean;
  recording?: boolean;
  thresholdBreached?: boolean;
  onRecord: () => void;
  actionLabel?: string;
  canRecord?: boolean;
  recordDisabled?: boolean;
  locked?: boolean;
  editable?: boolean;
  onActivityChange?: (value: string) => void;
  onActivityBlur?: () => void;
  onEmissionFactorChange?: (value: string) => void;
  onEmissionFactorBlur?: () => void;
  onReasonChange?: (value: string) => void;
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
  actionLabel = "Record Event",
  canRecord = true,
  recordDisabled = false,
  locked = false,
  editable = false,
  onActivityChange,
  onActivityBlur,
  onEmissionFactorChange,
  onEmissionFactorBlur,
  eventIndex,
  reason,
  onReasonChange,
}: StageProps) {
  const [activityInput, setActivityInput] = useState(activity.split(" ")[0]);
  const [emissionFactorInput, setEmissionFactorInput] = useState(emissionFactor.split(" ")[0]);
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
      {locked && <p className="stage-lock-message">Upstream event is not yet recorded.</p>}
      <div className="stage-event-details">
        {eventIndex !== undefined && (
          <div className="data-row">
            <span>Event Index</span>
            <span>{eventIndex}</span>
          </div>
        )}
        <div className="data-row">
          <span>Activity</span>
          {editable && !locked ? (
            <input value={activityInput} onChange={(event) => { setActivityInput(event.target.value); onActivityChange?.(event.target.value); }} onBlur={onActivityBlur} />
          ) : <span>{activity}</span>}
        </div>
        <div className="data-row">
          <span>Emission factor</span>
          {editable && !locked ? (
            <input value={emissionFactorInput} onChange={(event) => { setEmissionFactorInput(event.target.value); onEmissionFactorChange?.(event.target.value); }} onBlur={onEmissionFactorBlur} />
          ) : <span>{emissionFactor}</span>}
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
        {reason !== undefined && (
          <div className="data-row reason-row">
            <span>Reason / evidence</span>
            {editable ? (
              <textarea value={reason} onChange={(event) => onReasonChange?.(event.target.value)} placeholder="Describe the correction or provide evidence" />
            ) : <span>{reason}</span>}
          </div>
        )}
      </div>
      {canRecord && (
        <div className="action-row">
          <Button onClick={onRecord} disabled={recorded || recording || locked || recordDisabled}>
            {recording ? (actionLabel === "Submit" ? "Submitting..." : actionLabel === "Correct" ? "Correct..." : "Recording...") : recorded ? (actionLabel === "Submit" ? "Submitted" : actionLabel === "Correct" ? "Corrected" : "Event Recorded") : actionLabel}
          </Button>
        </div>
      )}
    </article>
  );
}
