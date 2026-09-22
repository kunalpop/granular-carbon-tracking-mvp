import { useState } from "react";
import {
  runTamperingStudy,
  type TamperingStudyResult,
  type RecordedEvent,
} from "./studyTampering";
import {
  runAggregationStudy,
  type AggregationStudyResult,
} from "./studyAggregation";
import {
  runPerformanceStudy,
  type PerformanceStudyResult,
} from "./studyPerformance";

const tabs = ["Tampering", "Aggregation", "Performance"];
const EVENTS_CACHE_KEY = "registered-emission-events-cache";
const STUDIES_COMPLETE_CACHE_KEY = "evaluation-studies-complete";
const TAMPERING_RESULT_CACHE_KEY = "tampering-study-result";
const AGGREGATION_RESULT_CACHE_KEY = "aggregation-study-result";
const PERFORMANCE_RESULT_CACHE_KEY = "performance-study-result";

function readCached<T>(key: string): T | undefined {
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : undefined;
  } catch {
    return undefined;
  }
}

export default function Results() {
  const [tab, setTab] = useState(tabs[0]);
  const [tamperingStudyState, setTamperingStudyState] = useState<
    "idle" | "running" | "complete"
  >(() =>
    readCached<TamperingStudyResult>(TAMPERING_RESULT_CACHE_KEY)
      ? "complete"
      : "idle",
  );
  const [aggregationStudyState, setAggregationStudyState] = useState<
    "idle" | "running" | "complete"
  >(() =>
    readCached<AggregationStudyResult>(AGGREGATION_RESULT_CACHE_KEY)
      ? "complete"
      : "idle",
  );
  const [tamperingResult, setTamperingResult] = useState<TamperingStudyResult | undefined>(
    () => readCached<TamperingStudyResult>(TAMPERING_RESULT_CACHE_KEY),
  );
  const [aggregationResult, setAggregationResult] = useState<AggregationStudyResult | undefined>(
    () => readCached<AggregationStudyResult>(AGGREGATION_RESULT_CACHE_KEY),
  );
  const [performanceStudyState, setPerformanceStudyState] = useState<
    "idle" | "running" | "complete"
  >(() =>
    readCached<PerformanceStudyResult>(PERFORMANCE_RESULT_CACHE_KEY)
      ? "complete"
      : "idle",
  );
  const [performanceResult, setPerformanceResult] = useState<PerformanceStudyResult | undefined>(
    () => readCached<PerformanceStudyResult>(PERFORMANCE_RESULT_CACHE_KEY),
  );
  const title =
    tab === "Tampering"
      ? "Can a changed record be trusted?"
      : tab === "Aggregation"
      ? "Do independent totals agree?"
      : "How does validator scale perform?";
  const handleRunTamperingStudy = async () => {
    setTamperingStudyState("running");
    try {
      const events = JSON.parse(
        window.localStorage.getItem(EVENTS_CACHE_KEY) ?? "[]",
      ) as RecordedEvent[];
      const result = await runTamperingStudy(events);
      setTamperingResult(result);
      window.localStorage.setItem(TAMPERING_RESULT_CACHE_KEY, JSON.stringify(result));
      setTamperingStudyState("complete");
    } catch {
      setTamperingStudyState("idle");
    }
  };
  const handleRunAggregationStudy = async () => {
    setAggregationStudyState("running");
    try {
      const events = JSON.parse(
        window.localStorage.getItem(EVENTS_CACHE_KEY) ?? "[]",
      ) as RecordedEvent[];
      const result = await runAggregationStudy(events);
      setAggregationResult(result);
      window.localStorage.setItem(AGGREGATION_RESULT_CACHE_KEY, JSON.stringify(result));
      setAggregationStudyState("complete");
    } catch {
      setAggregationStudyState("idle");
    }
  };
  const handleRunPerformanceStudy = async () => {
    setPerformanceStudyState("running");
    try {
      const result = await runPerformanceStudy();
      setPerformanceResult(result);
      window.localStorage.setItem(PERFORMANCE_RESULT_CACHE_KEY, JSON.stringify(result));
      setPerformanceStudyState("complete");
    } catch {
      setPerformanceStudyState("idle");
    }
  };
  const tamperingButtonLabel =
    tamperingStudyState === "running"
      ? "Studying Tampering"
      : tamperingStudyState === "complete"
      ? "Tampering Studied"
      : "Run Tampering Study";
  const aggregationButtonLabel =
    aggregationStudyState === "running"
      ? "Studying Aggregation"
      : aggregationStudyState === "complete"
      ? "Aggregation Studied"
      : "Run Aggregation Study";
  const performanceButtonLabel =
    performanceStudyState === "running"
      ? "Studying Performance"
      : performanceStudyState === "complete"
      ? "Performance Studied"
      : "Run Performance Study";
  const allStudiesComplete =
    tamperingStudyState === "complete" &&
    aggregationStudyState === "complete" &&
    performanceStudyState === "complete";

  if (allStudiesComplete && !window.localStorage.getItem(STUDIES_COMPLETE_CACHE_KEY)) {
    window.localStorage.setItem(STUDIES_COMPLETE_CACHE_KEY, "true");
    window.dispatchEvent(new Event("studies-complete"));
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="kicker">Evaluation</div>
          <h1>Test The Evidence</h1>
        </div>
        <p>
          Compare tampering resistance, aggregation correctness, and validator
          performance from the reproducible studies.
        </p>
      </div>
      <div className="result-tabs">
        {tabs.map((item) => (
          <button
            key={item}
            className={tab === item ? "active" : ""}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="section-grid">
        <section className="panel wide">
          <span
            className={
              (tab === "Tampering" && tamperingStudyState === "complete") ||
              (tab === "Aggregation" && aggregationStudyState === "complete") ||
              (tab === "Performance" && performanceStudyState === "complete")
                ? "status ready"
                : "status"
            }
          >
            {tab.toUpperCase()} STUDY
          </span>
          <h2 style={{ marginTop: 20 }}>{title}</h2>
          <p>
            Load the machine-readable evaluation output to inspect every case,
            metric, and limitation.
          </p>
          <div className="action-row">
            <button
              className="button"
              onClick={
                tab === "Tampering"
                  ? handleRunTamperingStudy
                  : tab === "Aggregation"
                  ? handleRunAggregationStudy
                  : tab === "Performance"
                  ? handleRunPerformanceStudy
                  : undefined
              }
              disabled={
                (tab === "Tampering" && tamperingStudyState === "running") ||
                (tab === "Aggregation" && aggregationStudyState === "running") ||
                (tab === "Performance" && performanceStudyState === "running")
              }
            >
              {tab === "Tampering"
                ? tamperingButtonLabel
                : tab === "Aggregation"
                ? aggregationButtonLabel
                : performanceButtonLabel}
            </button>
          </div>
          {tab === "Tampering" && tamperingResult && (
            <p>
              {tamperingResult.outcomes.filter((item) => item.detected).length} of{" "}
              {tamperingResult.outcomes.length} tampering scenarios detected.
            </p>
          )}
        </section>
        <section className="panel narrow">
          {tab === "Tampering" && tamperingResult ? (
            <>
              <h2>Tampering results</h2>
              <div className="data-row">
                <span>Study state</span>
                <span>{tamperingStudyState === "complete" ? "Complete" : "Running"}</span>
              </div>
              <div className="data-row">
                <span>Control audit</span>
                <span>{tamperingResult.controlOk ? "Passed" : "Failed"}</span>
              </div>
              <div className="data-row">
                <span>Scenarios detected</span>
                <span>
                  {tamperingResult.outcomes.filter((item) => item.detected).length} / {tamperingResult.outcomes.length}
                </span>
              </div>
              <div className="data-row">
                <span>Undetected scenarios</span>
                <span>{tamperingResult.outcomes.filter((item) => !item.detected).length}</span>
              </div>
            </>
          ) : tab === "Aggregation" && aggregationResult ? (
            <>
              <h2>Aggregation results</h2>
              <div className="data-row">
                <span>Study state</span>
                <span>Complete</span>
              </div>
              <div className="data-row">
                <span>Checks passed</span>
                <span>
                  {aggregationResult.checks.filter((check) => check.pass).length} / {aggregationResult.checks.length}
                </span>
              </div>
            </>
          ) : tab === "Performance" && performanceResult ? (
            <>
              <h2>Performance results</h2>
              <div className="data-row">
                <span>Study state</span>
                <span>Complete</span>
              </div>
              <div className="data-row">
                <span>4 validators TPS</span>
                <span>{performanceResult.fourValidators.tps.toFixed(2)} tx/s</span>
              </div>
              <div className="data-row">
                <span>7 validators TPS</span>
                <span>{performanceResult.sevenValidators.tps.toFixed(2)} tx/s</span>
              </div>
              <div className="data-row">
                <span>4 validators avg latency</span>
                <span>{performanceResult.fourValidators.latencyMs.avg.toFixed(0)} ms</span>
              </div>
              <div className="data-row">
                <span>7 validators avg latency</span>
                <span>{performanceResult.sevenValidators.latencyMs.avg.toFixed(0)} ms</span>
              </div>
              <div className="data-row">
                <span>Average latency change</span>
                <span>{performanceResult.latencyChangePercent.toFixed(1)}%</span>
              </div>
            </>
          ) : (
            <>
              <h2>Study source</h2>
              <div className="data-row">
                <span>State</span>
                <span>Not loaded</span>
              </div>
              <div className="data-row">
                <span>Fault products</span>
                <span>Excluded</span>
              </div>
              <div className="data-row">
                <span>Evidence mode</span>
                <span>Static artifact</span>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
