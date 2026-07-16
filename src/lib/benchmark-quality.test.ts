import { describe, expect, it } from "vitest";
import { benchmarkJudgeSchema, buildModelRecommendations, summarizeBenchmarkRows, type BenchmarkRowForSummary } from "./benchmark-quality";
import { SILICONFLOW_BENCHMARK_CASES } from "../../benchmarks/siliconflow-cases";

const scores = { fidelity: 9, channel_structure: 9, outcome_alignment: 9, selected_channel_voice: 9, psychological_dialogue_feel: 9, originality: 9, readability: 9, serious_fact_invention: false, note: "ok" };
const row = (overrides: Partial<BenchmarkRowForSummary> = {}): BenchmarkRowForSummary => ({
  model: "model-a", tags: [], generationStatus: "success", localValidationStatus: "passed", auditStatus: "disabled", judgeStatus: "passed", repaired: false, generationLatencyMs: 100, scores, ...overrides,
});

describe("benchmark quality aggregation", () => {
  it("Judge schema 拒绝越界分数和缺失字段", () => {
    expect(benchmarkJudgeSchema.safeParse(scores).success).toBe(true);
    expect(benchmarkJudgeSchema.safeParse({ ...scores, fidelity: 11 }).success).toBe(false);
    const missing = { ...scores } as Partial<typeof scores>;
    delete missing.readability;
    expect(benchmarkJudgeSchema.safeParse(missing).success).toBe(false);
  });

  it("Judge 失败不覆盖生成状态，且全部请求综合分惩罚失败", () => {
    const summary = summarizeBenchmarkRows([row(), row({ judgeStatus: "failed", scores: undefined })]);
    expect(summary.generationSuccessRate).toBe(100);
    expect(summary.judgeSuccessRate).toBe(50);
    expect(summary.allRequestsComposite).toBe(4.5);
  });

  it("没有模型达到门槛时推荐类别为空", () => {
    const summary = { model: "bad", ...summarizeBenchmarkRows([row({ generationStatus: "failed", localValidationStatus: "not_run", judgeStatus: "not_run", scores: undefined })]) };
    expect(buildModelRecommendations([summary])).toEqual([]);
  });

  it("基准至少包含20个独立案例且超长案例不是重复段落", () => {
    expect(SILICONFLOW_BENCHMARK_CASES.length).toBeGreaterThanOrEqual(20);
    const veryLong = SILICONFLOW_BENCHMARK_CASES.filter((item) => item.tags.includes("501-1000"));
    expect(veryLong.length).toBeGreaterThanOrEqual(2);
    for (const testCase of veryLong) {
      const length = Array.from(testCase.source.replace(/\s/gu, "")).length;
      expect(length).toBeGreaterThanOrEqual(501);
      expect(length).toBeLessThanOrEqual(1000);
      const paragraphs = testCase.source.split(/\n\s*\n/gu);
      expect(new Set(paragraphs).size).toBe(paragraphs.length);
    }
  });
});
