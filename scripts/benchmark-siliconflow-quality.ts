#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { SILICONFLOW_BENCHMARK_CASES, type SiliconFlowBenchmarkCase } from "../benchmarks/siliconflow-cases";
import {
  benchmarkJudgeSchema,
  buildModelRecommendations,
  summarizeBenchmarkRows,
  type BenchmarkJudgeScores,
  type BenchmarkRowForSummary,
} from "../src/lib/benchmark-quality";
import { CHECK_OUTCOME_LABELS } from "../src/lib/checks-shared";
import { auditRewriteFidelity } from "../src/lib/fidelity-audit";
import type { FidelityAuditResult } from "../src/lib/fidelity-audit";
import { escapePromptXml } from "../src/lib/prompt-escape";
import { generateValidatedRewrite, publicProviderError, RewriteProviderError } from "../src/lib/provider-stream";
import { validateRewriteQuality } from "../src/lib/rewrite-quality";
import { rewriteLengthRange } from "../src/lib/rewrite-length";

const BASE_URL = (process.env.SILICONFLOW_BASE_URL || "https://api.siliconflow.cn/v1").replace(/\/$/u, "");
const JUDGE_MODEL = process.env.SILICONFLOW_JUDGE_MODEL || process.env.SILICONFLOW_AUDIT_MODEL || "deepseek-ai/DeepSeek-V4-Pro";
const requestedCase = process.argv.find((item) => item.startsWith("--case="))?.slice(7);
const requestedCases = process.argv.find((item) => item.startsWith("--cases="))?.slice(8)
  .split(",").map((item) => item.trim()).filter(Boolean);
const requestedRuns = Math.max(1, Number(process.argv.find((item) => item.startsWith("--runs="))?.slice(7) || 3));
const requestedModels = process.argv.find((item) => item.startsWith("--models="))?.slice(9) || process.env.SILICONFLOW_BENCHMARK_MODELS || process.env.SILICONFLOW_MODEL || "deepseek-ai/DeepSeek-V4-Flash";
const models = [...new Set(requestedModels.split(",").map((item) => item.trim()).filter(Boolean))];
const concurrency = Math.min(2, Math.max(1, Number(process.env.SILICONFLOW_BENCHMARK_CONCURRENCY || 1)));
const perModelConcurrency = Math.min(concurrency, Math.max(1, Number(process.env.SILICONFLOW_BENCHMARK_PER_MODEL_CONCURRENCY || 1)));
const benchmarkAuditEnabled = process.env.SILICONFLOW_BENCHMARK_AUDIT === "true";

type BenchmarkRow = BenchmarkRowForSummary & {
  caseId: string;
  run: number;
  sourceLength: number;
  outputLength?: number;
  attempts?: number;
  repairViolations?: string[];
  violations?: unknown[];
  audit?: unknown;
  judgeError?: string;
  error?: ReturnType<typeof publicProviderError>;
  output?: string;
};

async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function consume() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, consume));
  return results;
}

const activeByModel = new Map<string, number>();
const waitersByModel = new Map<string, Array<() => void>>();

async function withModelLimit<T>(model: string, worker: () => Promise<T>) {
  if ((activeByModel.get(model) || 0) >= perModelConcurrency) {
    await new Promise<void>((resolve) => {
      const waiters = waitersByModel.get(model) || [];
      waiters.push(resolve);
      waitersByModel.set(model, waiters);
    });
  } else {
    activeByModel.set(model, (activeByModel.get(model) || 0) + 1);
  }
  try {
    return await worker();
  } finally {
    const next = waitersByModel.get(model)?.shift();
    if (next) next();
    else activeByModel.set(model, Math.max(0, (activeByModel.get(model) || 1) - 1));
  }
}

function stripJsonFence(value: string) {
  return value.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
}

async function judge(apiKey: string, testCase: SiliconFlowBenchmarkCase, output: string) {
  const prompt = `你是独立中文改写质量评审。只输出 JSON 对象，所有分数为 0-10 数字。字段必须是 fidelity、channel_structure、outcome_alignment、selected_channel_voice、psychological_dialogue_feel、originality、readability、serious_fact_invention(boolean)、note。\n事实账本：${testCase.factLedger.map(escapePromptXml).join("；")}\n闭世界评分：事实账本和原文未列出的人物、地点、物件、动作、天气、灯光、声音、时间、数字及因果都不应被断言成现实；即使细节很常见也算无依据。原文不超过30字时，新增房间、窗户、街道、灯、空气、皮肤、手机、门、脚步、咖啡、雨、广播等具体细节必须明显降低 fidelity；如果它改变事件理解或制造具体场景，serious_fact_invention=true。心理猜测可以存在，但必须被清楚标成主观误读并随后纠正。\n原文：<source>${escapePromptXml(testCase.source)}</source>\n指定频道：${testCase.check.skill}；结果：${CHECK_OUTCOME_LABELS[testCase.check.outcome]}\n候选：<candidate>${escapePromptXml(output)}</candidate>`;
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      messages: [
        { role: "system", content: "严格、保守，只按原文事实账本和指定结构评分。不要因文风偏好惩罚事实保真。" },
        { role: "user", content: prompt },
      ],
      temperature: 0.05,
      max_tokens: 600,
      enable_thinking: false,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(110_000),
  });
  if (!response.ok) throw new Error(`judge_http_${response.status}`);
  const payload = await response.json();
  const raw = String(payload?.choices?.[0]?.message?.content || "");
  return {
    scores: benchmarkJudgeSchema.parse(JSON.parse(stripJsonFence(raw))),
    usage: (payload?.usage || {}) as Record<string, number>,
  };
}

async function runJob(apiKey: string, model: string, testCase: SiliconFlowBenchmarkCase, run: number): Promise<BenchmarkRow> {
  const started = performance.now();
  let output: string | undefined;
  let generated: Awaited<ReturnType<typeof generateValidatedRewrite>> | undefined;
  let generationStatus: BenchmarkRow["generationStatus"] = "failed";
  let localValidationStatus: BenchmarkRow["localValidationStatus"] = "not_run";
  let violations: unknown[] | undefined;
  let safeError: ReturnType<typeof publicProviderError> | undefined;

  try {
    generated = await generateValidatedRewrite(
      { id: "siliconflow", label: "SiliconFlow", model, apiKey },
      testCase.source,
      testCase.style,
      new AbortController().signal,
      testCase.check,
    );
    output = generated.content;
    generationStatus = "success";
    const quality = validateRewriteQuality(testCase.source, output, testCase.style, testCase.check);
    localValidationStatus = quality.valid ? "passed" : "failed";
    violations = quality.violations;
  } catch (error) {
    safeError = publicProviderError(error);
    const details = error instanceof RewriteProviderError ? error.details : undefined;
    output = details?.output;
    if (output) {
      generationStatus = "success";
      localValidationStatus = "failed";
      violations = details?.violations;
    } else if (safeError.code === "upstream_timeout") generationStatus = "timeout";
    else if (safeError.code === "invalid_provider_request") generationStatus = "unavailable";
    else generationStatus = "failed";
  }
  const generationLatencyMs = Math.round(performance.now() - started);

  let auditStatus: BenchmarkRow["auditStatus"] = benchmarkAuditEnabled ? "unavailable" : "disabled";
  let audit: FidelityAuditResult | null | undefined = generated?.audit;
  if (benchmarkAuditEnabled && output) {
    if (!audit) audit = await auditRewriteFidelity(testCase.source, output, new AbortController().signal, true);
    if (audit) auditStatus = audit.supported ? "passed" : "failed";
  }

  let judgeStatus: BenchmarkRow["judgeStatus"] = output ? "failed" : "not_run";
  let scores: BenchmarkJudgeScores | undefined;
  let judgeUsage: Record<string, number> | undefined;
  let judgeError: string | undefined;
  if (output) {
    try {
      const judged = await judge(apiKey, testCase, output);
      scores = judged.scores;
      judgeUsage = judged.usage;
      judgeStatus = "passed";
    } catch (error) {
      judgeError = error instanceof Error ? error.message : "judge_failed";
      judgeStatus = /Zod|JSON|parse|invalid/iu.test(judgeError) ? "invalid_response" : "failed";
    }
  }

  const usage = { ...(generated?.usage || {}) };
  for (const [key, value] of Object.entries(judgeUsage || {})) usage[`judge_${key}`] = Number(value || 0);
  return {
    model,
    caseId: testCase.id,
    run,
    tags: testCase.tags,
    sourceLength: rewriteLengthRange(testCase.source).sourceLength,
    outputLength: output ? rewriteLengthRange(output).sourceLength : undefined,
    generationStatus,
    localValidationStatus,
    auditStatus,
    judgeStatus,
    repaired: generated?.repaired || (Boolean(output) && localValidationStatus === "failed"),
    attempts: generated?.attempts,
    repairViolations: generated?.violations,
    generationLatencyMs,
    violations,
    audit,
    scores,
    usage,
    judgeError,
    error: safeError,
    output,
  };
}

async function main() {
  const apiKey = process.env.SILICONFLOW_API_KEY?.trim();
  if (!apiKey) throw new Error("SILICONFLOW_API_KEY 未设置；没有发起请求");
  if (!models.length) throw new Error("没有可测试的模型 ID");
  if (benchmarkAuditEnabled) {
    process.env.REWRITE_FACT_AUDIT_ENABLED = "true";
    process.env.SILICONFLOW_AUDIT_MODEL ||= JUDGE_MODEL;
  }
  const selectedIds = requestedCases?.length ? new Set(requestedCases) : requestedCase ? new Set([requestedCase]) : null;
  const selectedCases = selectedIds
    ? SILICONFLOW_BENCHMARK_CASES.filter((item) => selectedIds.has(item.id))
    : SILICONFLOW_BENCHMARK_CASES;
  if (!selectedCases.length) throw new Error(`找不到案例：${requestedCases?.join(",") || requestedCase}`);
  if (selectedIds && selectedCases.length !== selectedIds.size) {
    const found = new Set(selectedCases.map((item) => item.id));
    throw new Error(`找不到案例：${[...selectedIds].filter((id) => !found.has(id)).join(",")}`);
  }
  const jobs = selectedCases.flatMap((testCase) => Array.from({ length: requestedRuns }, (_, index) => index + 1)
    .flatMap((run) => models.map((model) => ({ model, testCase, run }))));
  console.log(`Running ${jobs.length} generations (${models.length} models × ${selectedCases.length} cases × ${requestedRuns}), global concurrency=${concurrency}, per-model concurrency=${perModelConcurrency}; judge=${JUDGE_MODEL}`);
  const rows = await mapLimit(jobs, concurrency, async ({ model, testCase, run }) => {
    const row = await withModelLimit(model, () => runJob(apiKey, model, testCase, run));
    const marker = row.generationStatus === "success" ? "generated" : row.generationStatus;
    console.log(`[${marker}] ${model} ${testCase.id} #${run} local=${row.localValidationStatus} judge=${row.judgeStatus} ${row.generationLatencyMs}ms`);
    return row;
  });

  const modelSummaries = models.map((model) => ({
    model,
    ...summarizeBenchmarkRows(rows.filter((row) => row.model === model)),
  }));
  const recommendations = buildModelRecommendations(modelSummaries);
  const leaderboard = [...modelSummaries].sort((left, right) => right.allRequestsComposite - left.allRequestsComposite);
  const isFullRun = selectedCases.length >= 20 && requestedRuns >= 3;
  const report = {
    createdAt: new Date().toISOString(),
    models,
    judgeModel: JUDGE_MODEL,
    benchmarkAuditEnabled,
    runsPerCase: requestedRuns,
    caseCount: selectedCases.length,
    penaltyRule: "全部请求综合分将生成失败、最终合同失败、Judge 失败/无效和严重事实发明计为 0；仅成功平均分单独列出。",
    modelSummaries,
    leaderboard,
    recommendations: isFullRun ? recommendations : [],
    recommendationStatus: isFullRun ? "full_matrix" : "quick_run_not_eligible",
    rows,
  };
  await mkdir("benchmark-results", { recursive: true });
  const stamp = report.createdAt.replace(/[:.]/gu, "-");
  const jsonPath = `benchmark-results/siliconflow-quality-${stamp}.json`;
  const mdPath = `benchmark-results/siliconflow-quality-${stamp}.md`;
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  await writeFile(mdPath, `# SiliconFlow quality benchmark\n\n- Models: ${models.join(", ")}\n- Matrix: ${selectedCases.length} cases × ${requestedRuns}\n- Recommendation status: ${report.recommendationStatus}\n- Penalty: ${report.penaltyRule}\n\n\`\`\`json\n${JSON.stringify({ leaderboard, recommendations: report.recommendations }, null, 2)}\n\`\`\`\n`, { mode: 0o600 });
  const recommendationPath = "benchmark-results/siliconflow-recommendations.generated.json";
  await writeFile(recommendationPath, `${JSON.stringify({ createdAt: report.createdAt, eligible: isFullRun, recommendations: report.recommendations, leaderboard }, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ leaderboard, recommendations: report.recommendations, reports: [jsonPath, mdPath, recommendationPath] }, null, 2));
  if (isFullRun && recommendations.length === 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "benchmark_failed");
  process.exitCode = 1;
});
