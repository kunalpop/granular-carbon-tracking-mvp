import fourValidatorResults from "../../../../evaluation/study-c-performance/results/results-4-validators.json";
import sevenValidatorResults from "../../../../evaluation/study-c-performance/results/results-7-validators.json";

type BenchmarkResult = typeof fourValidatorResults;

export type PerformanceStudyResult = {
  fourValidators: BenchmarkResult;
  sevenValidators: typeof sevenValidatorResults;
  tpsChangePercent: number;
  latencyChangePercent: number;
};

// Load the recorded Study C benchmark results for browser-side comparison.
export async function runPerformanceStudy(): Promise<PerformanceStudyResult> {
  return {
    fourValidators: fourValidatorResults,
    sevenValidators: sevenValidatorResults,
    tpsChangePercent:
      ((sevenValidatorResults.tps - fourValidatorResults.tps) /
        fourValidatorResults.tps) *
      100,
    latencyChangePercent:
      ((sevenValidatorResults.latencyMs.avg - fourValidatorResults.latencyMs.avg) /
        fourValidatorResults.latencyMs.avg) *
      100,
  };
}
