import { z } from "zod";

const score = z.number().min(0).max(10);
export const benchmarkJudgeSchema = z.object({
  fidelity: score,
  channel_structure: score,
  outcome_alignment: score,
  selected_channel_voice: score,
  psychological_dialogue_feel: score,
  originality: score,
  readability: score,
  serious_fact_invention: z.boolean(),
  note: z.string().max(1000),
}).strict();

export type BenchmarkJudgeScores = z.infer<typeof benchmarkJudgeSchema>;
export type BenchmarkRowForSummary = {
  model: string;
  tags: string[];
  generationStatus: "success" | "failed" | "timeout" | "unavailable";
  localValidationStatus: "passed" | "failed" | "not_run";
  auditStatus: "passed" | "failed" | "disabled" | "unavailable";
  judgeStatus: "passed" | "failed" | "invalid_response" | "not_run";
  repaired: boolean;
  generationLatencyMs: number;
  scores?: BenchmarkJudgeScores;
  usage?: Record<string, number>;
};

const SCORE_KEYS = [
  "fidelity", "channel_structure", "outcome_alignment", "selected_channel_voice",
  "psychological_dialogue_feel", "originality", "readability",
] as const;

function percent(value: number, total: number) {
  return total ? Number(((value / total) * 100).toFixed(2)) : 0;
}

function percentile(values: number[], quantile: number) {
  if (!values.length) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * quantile) - 1)];
}

export function summarizeBenchmarkRows(rows: BenchmarkRowForSummary[]) {
  const total = rows.length;
  const generated = rows.filter((row) => row.generationStatus === "success");
  const localPassed = rows.filter((row) => row.localValidationStatus === "passed");
  const judged = rows.filter((row) => row.judgeStatus === "passed" && row.scores);
  const audited = rows.filter((row) => row.auditStatus === "passed" || row.auditStatus === "failed");
  const successfulScores = Object.fromEntries(SCORE_KEYS.map((key) => [
    key,
    judged.length
      ? Number((judged.reduce((sum, row) => sum + Number(row.scores?.[key] || 0), 0) / judged.length).toFixed(2))
      : 0,
  ])) as Record<(typeof SCORE_KEYS)[number], number>;
  const compositeFor = (row: BenchmarkRowForSummary) => {
    if (
      row.generationStatus !== "success" || row.localValidationStatus !== "passed" ||
      row.judgeStatus !== "passed" || !row.scores || row.scores.serious_fact_invention
    ) return 0;
    return SCORE_KEYS.reduce((sum, key) => sum + row.scores![key], 0) / SCORE_KEYS.length;
  };
  const longRows = rows.filter((row) => row.tags.includes("501-1000"));
  const tokenUsage = rows.reduce((totals, row) => {
    for (const [key, value] of Object.entries(row.usage || {})) totals[key] = (totals[key] || 0) + Number(value || 0);
    return totals;
  }, {} as Record<string, number>);
  return {
    requests: total,
    generationSuccessRate: percent(generated.length, total),
    firstPassContractRate: percent(rows.filter((row) => row.localValidationStatus === "passed" && !row.repaired).length, total),
    repairRate: percent(rows.filter((row) => row.repaired).length, total),
    repairSuccessRate: percent(rows.filter((row) => row.repaired && row.localValidationStatus === "passed").length, rows.filter((row) => row.repaired).length),
    finalContractPassRate: percent(localPassed.length, total),
    auditPassRate: percent(rows.filter((row) => row.auditStatus === "passed").length, audited.length),
    judgeSuccessRate: percent(judged.length, total),
    timeoutRate: percent(rows.filter((row) => row.generationStatus === "timeout").length, total),
    unavailableRate: percent(rows.filter((row) => row.generationStatus === "unavailable").length, total),
    seriousFactInventions: rows.filter((row) => row.scores?.serious_fact_invention).length,
    seriousFactInventionRate: percent(rows.filter((row) => row.scores?.serious_fact_invention).length, total),
    successfulOnlyAverages: successfulScores,
    allRequestsComposite: total ? Number((rows.reduce((sum, row) => sum + compositeFor(row), 0) / total).toFixed(2)) : 0,
    p50LatencyMs: percentile(generated.map((row) => row.generationLatencyMs), 0.5),
    p95LatencyMs: percentile(generated.map((row) => row.generationLatencyMs), 0.95),
    longTextSuccessRate: percent(longRows.filter((row) => row.generationStatus === "success" && row.localValidationStatus === "passed").length, longRows.length),
    tokenUsage,
  };
}

export type ModelBenchmarkSummary = ReturnType<typeof summarizeBenchmarkRows> & { model: string };

function eligible(summary: ModelBenchmarkSummary) {
  const scores = summary.successfulOnlyAverages;
  return summary.generationSuccessRate >= 90 && summary.finalContractPassRate >= 90 &&
    summary.judgeSuccessRate >= 90 && scores.fidelity >= 8.5 && scores.outcome_alignment >= 8.5 &&
    scores.channel_structure >= 8 && scores.psychological_dialogue_feel >= 8 &&
    summary.seriousFactInventions === 0;
}

export function buildModelRecommendations(summaries: ModelBenchmarkSummary[]) {
  const qualified = summaries.filter(eligible);
  if (!qualified.length) return [];
  const qualityScore = (summary: ModelBenchmarkSummary) => {
    const scores = summary.successfulOnlyAverages;
    return scores.fidelity + scores.outcome_alignment + scores.channel_structure + scores.psychological_dialogue_feel;
  };
  const byQuality = [...qualified].sort((a, b) => qualityScore(b) - qualityScore(a))[0];
  const bySpeed = [...qualified].sort((a, b) => a.p50LatencyMs - b.p50LatencyMs)[0];
  const byLong = [...qualified].sort((a, b) => b.longTextSuccessRate - a.longTextSuccessRate || a.p95LatencyMs - b.p95LatencyMs)[0];
  const byBalance = [...qualified].sort((a, b) => b.allRequestsComposite - a.allRequestsComposite || a.p95LatencyMs - b.p95LatencyMs)[0];
  return [
    { profile: "balanced" as const, model: byBalance.model },
    { profile: "quality" as const, model: byQuality.model },
    { profile: "fast" as const, model: bySpeed.model },
    { profile: "long_text" as const, model: byLong.model },
  ];
}
