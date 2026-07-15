#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { CHECK_OUTCOME_LABELS, type CheckOutcome, type CheckResult, type CheckSkillId } from "../src/lib/checks-shared";
import { generateValidatedRewrite, publicProviderError, RewriteProviderError } from "../src/lib/provider-stream";
import { validateRewriteQuality } from "../src/lib/rewrite-quality";
import { rewriteLengthRange } from "../src/lib/rewrite-length";
import type { StyleId } from "../src/lib/types";

const BASE_URL = (process.env.SILICONFLOW_BASE_URL || "https://api.siliconflow.cn/v1").replace(/\/$/, "");
const MODEL = process.env.SILICONFLOW_MODEL || "deepseek-ai/DeepSeek-V4-Flash";
const JUDGE_MODEL = process.env.SILICONFLOW_JUDGE_MODEL || "deepseek-ai/DeepSeek-V4-Pro";
const requestedCase = process.argv.find((item) => item.startsWith("--case="))?.slice(7);
const requestedRuns = Number(process.argv.find((item) => item.startsWith("--runs="))?.slice(7) || 3);

type Case = { id: string; source: string; style: StyleId; skill: CheckSkillId; outcome: CheckOutcome; check: CheckResult };
const outcomeDice: Record<CheckOutcome, readonly [number, number]> = { critical_failure: [1, 1], failure: [2, 2], success: [4, 5], critical_success: [6, 6] };

function makeCheck(skill: CheckSkillId, outcome: CheckOutcome): CheckResult {
  const dice = outcomeDice[outcome];
  const skillLevel = 3;
  const total = dice[0] + dice[1] + skillLevel;
  const difficulty = outcome === "failure" ? 10 : 8;
  return { skill, outcome, dice, skillLevel, total, difficulty, margin: total - difficulty };
}

const longRecord = "周三下午，档案室的空调坏了。林把十二份表格按日期排好，发现第七份缺少签名。他给主管发了邮件，主管回复说先保留原样，等周五会议再决定。窗外施工声持续到下班，他没有修改任何数字，只在便签上记录了缺失项。";
const cases: Case[] = [
  ["extreme_heat", "热。", "psycho_noir", "intuition", "failure"],
  ["short_anxiety", "今天天气好热，让我的内心焦躁不安。", "inner_monologue", "composure", "success"],
  ["short_door", "我站在门口，想起那封一直没有寄出的信。", "lyrical", "empathy", "critical_success"],
  ["short_meeting", "会议结束了，但没有人真正得到答案。", "dark_humor", "logic", "critical_failure"],
  ["coffee", "凌晨三点，我在厨房里找到最后一杯冷咖啡。窗外没有车，冰箱的声音显得格外清楚。", "psycho_noir", "reaction", "success"],
  ["wallet", "我在末班公交车上捡到一个钱包，里面有身份证、两张银行卡和三百元现金。我按地址送还，失主确认东西没有少并向我道谢。我没有收酬谢。", "inner_monologue", "imagination", "failure"],
  ["interview", "周一早上九点，我冒雨赶到公司参加晋升面谈。主管迟到了二十分钟，只说预算被冻结，这次不会有人晋升。他让我继续负责原来的项目，并承诺三个月后再讨论。", "dark_humor", "logic", "success"],
  ["station", "列车晚点四十分钟。我坐在站台长椅上，把已经看过三遍的通知又读了一遍。广播只说明设备故障，没有给出新的到站时间。旁边的人开始打电话，我把票收回口袋。", "lyrical", "reaction", "critical_failure"],
  ["archive_260", longRecord + longRecord.slice(0, 90), "psycho_noir", "composure", "critical_success"],
  ["archive_430", longRecord.repeat(2), "inner_monologue", "empathy", "failure"],
  ["archive_650", longRecord.repeat(3), "dark_humor", "imagination", "success"],
  ["archive_900", longRecord.repeat(4), "lyrical", "intuition", "critical_success"],
].map(([id, source, style, skill, outcome]) => ({
  id,
  source,
  style: style as StyleId,
  skill: skill as CheckSkillId,
  outcome: outcome as CheckOutcome,
  check: makeCheck(skill as CheckSkillId, outcome as CheckOutcome),
})) as Case[];

async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length); let cursor = 0;
  async function consume() { while (cursor < items.length) { const index = cursor++; results[index] = await worker(items[index], index); } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, consume));
  return results;
}

function sanitize(error: unknown) { return publicProviderError(error); }

async function judge(apiKey: string, testCase: Case, output: string) {
  const prompt = `你是独立中文改写质量评审。对候选按 0-10 分，只输出 JSON 对象。字段：fidelity、channel_structure、outcome_alignment、selected_channel_voice、game_dialogue_feel、originality、readability、length、instruction_following、serious_fact_invention(boolean)、note。\n原文：<source>${testCase.source}</source>\n指定频道：${testCase.skill}；结果：${CHECK_OUTCOME_LABELS[testCase.outcome]}\n候选：<candidate>${output}</candidate>`;
  const response = await fetch(`${BASE_URL}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: JUDGE_MODEL, messages: [{ role: "system", content: "严格、保守、只按原文事实与指定结构评分。" }, { role: "user", content: prompt }], temperature: 0.1, max_tokens: 600, enable_thinking: false, response_format: { type: "json_object" } }), signal: AbortSignal.timeout(110_000) });
  if (!response.ok) throw new Error(`judge_http_${response.status}`);
  const payload = await response.json();
  const raw = String(payload?.choices?.[0]?.message?.content || "").replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
  return { scores: JSON.parse(raw), usage: payload.usage || {} };
}

async function main() {
  const apiKey = process.env.SILICONFLOW_API_KEY?.trim();
  if (!apiKey) throw new Error("SILICONFLOW_API_KEY 未设置；没有发起请求");
  const selectedCases = requestedCase ? cases.filter((item) => item.id === requestedCase) : cases;
  const jobs = selectedCases.flatMap((testCase) => Array.from({ length: requestedRuns }, (_, run) => ({ testCase, run: run + 1 })));
  console.log(`Running ${jobs.length} real generations (${selectedCases.length} fixed cases × ${requestedRuns}), concurrency=2; model=${MODEL}; judge=${JUDGE_MODEL}`);
  const rows = await mapLimit(jobs, 2, async ({ testCase, run }) => {
    const started = performance.now();
    try {
      const generated = await generateValidatedRewrite({ id: "siliconflow", label: "SiliconFlow", model: MODEL, baseUrl: BASE_URL, apiKey }, testCase.source, testCase.style, new AbortController().signal, testCase.check);
      const quality = validateRewriteQuality(
        testCase.source,
        generated.content,
        testCase.style,
        testCase.check,
      );
      const judged = await judge(apiKey, testCase, generated.content);
      const row = { caseId: testCase.id, run, style: testCase.style, skill: testCase.skill, outcome: testCase.outcome, sourceLength: rewriteLengthRange(testCase.source).sourceLength, outputLength: quality.outputLength, attempts: generated.attempts, repaired: generated.repaired, repairViolations: generated.violations, latencyMs: Math.round(performance.now() - started), localValid: quality.valid, violations: quality.violations, scores: judged.scores, usage: judged.usage, output: generated.content };
      console.log(`[ok] ${testCase.id} #${run} ${row.latencyMs}ms repaired=${row.repaired}`); return row;
    } catch (error) {
      const safe = sanitize(error); console.error(`[fail] ${testCase.id} #${run} ${safe.code}`);
      const details = error instanceof RewriteProviderError ? error.details : undefined;
      return { caseId: testCase.id, run, style: testCase.style, skill: testCase.skill, outcome: testCase.outcome, sourceLength: rewriteLengthRange(testCase.source).sourceLength, error: safe, violations: details?.violations, output: details?.output, latencyMs: Math.round(performance.now() - started) };
    }
  });
  const success = rows.filter((row) => !("error" in row));
  const average = (key: string) => success.length ? Number((success.reduce((sum, row) => sum + Number((row as { scores: Record<string, number> }).scores[key] || 0), 0) / success.length).toFixed(2)) : 0;
  const summary = {
    requests: rows.length, successes: success.length, successRate: Number((success.length / rows.length * 100).toFixed(2)),
    localPassRate: Number((success.filter((row) => (row as { localValid: boolean }).localValid).length / rows.length * 100).toFixed(2)),
    repairs: success.filter((row) => (row as { repaired: boolean }).repaired).length,
    seriousFactInventions: success.filter((row) => Boolean((row as { scores: Record<string, unknown> }).scores.serious_fact_invention)).length,
    averages: Object.fromEntries(["fidelity", "channel_structure", "outcome_alignment", "selected_channel_voice", "game_dialogue_feel", "originality", "readability", "length", "instruction_following"].map((key) => [key, average(key)])),
  };
  const isFullRun = selectedCases.length === cases.length && requestedRuns >= 3;
  const accepted = isFullRun && success.length === rows.length && summary.localPassRate === 100 && summary.successRate >= 95 && summary.averages.fidelity >= 9 && summary.averages.outcome_alignment >= 8.5 && summary.averages.channel_structure >= 8.5 && summary.averages.game_dialogue_feel >= 8 && summary.seriousFactInventions === 0;
  const report = { createdAt: new Date().toISOString(), model: MODEL, judgeModel: JUDGE_MODEL, cases: selectedCases, runsPerCase: requestedRuns, summary, accepted, rows };
  await mkdir("benchmark-results", { recursive: true });
  const stamp = report.createdAt.replace(/[:.]/g, "-");
  const jsonPath = `benchmark-results/siliconflow-quality-${stamp}.json`;
  const mdPath = `benchmark-results/siliconflow-quality-${stamp}.md`;
  await writeFile(jsonPath, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  await writeFile(mdPath, `# SiliconFlow quality benchmark\n\n- Requests: ${summary.successes}/${summary.requests}\n- Local pass: ${summary.localPassRate}%\n- Repairs: ${summary.repairs}\n- Accepted: ${accepted}\n- Scores: ${JSON.stringify(summary.averages)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ summary, accepted, reports: [jsonPath, mdPath] }, null, 2));
  if (!accepted) process.exitCode = 2;
}

main().catch((error) => { console.error(sanitize(error).code); process.exitCode = 1; });
