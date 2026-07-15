#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

const PRICE_SOURCE = "https://siliconflow.cn/pricing";
const PRICE_SNAPSHOT = "2026-07-15";
const BASE_URL = (process.env.SILICONFLOW_BASE_URL || "https://api.siliconflow.cn/v1").replace(/\/$/, "");
const JUDGE_MODEL = process.env.SILICONFLOW_JUDGE_MODEL || "deepseek-ai/DeepSeek-V4-Pro";
const DRY_RUN = process.argv.includes("--dry-run");

const models = [
  { id: "deepseek-ai/DeepSeek-V4-Flash", input: 1, output: 2 },
  { id: "Qwen/Qwen3.5-35B-A3B", input: 0.4, output: 3.2 },
  { id: "stepfun-ai/Step-3.5-Flash", input: 0.7, output: 2.1 },
  { id: "nex-agi/Nex-N2-Pro", input: 1.75, output: 7 },
  { id: "deepseek-ai/DeepSeek-V3.2", input: 4, output: 6 },
  { id: "Qwen/Qwen3.6-35B-A3B", input: 1.8, output: 10.8 },
];

const judgePrice = { input: 12, output: 24 };

const cases = [
  {
    id: "rainy_interview",
    style: "心理黑色侦探",
    direction: "冷峻的感官细节、疲惫的城市气息、克制的哲思；不得改变事实。",
    source:
      "周一早上九点，我冒雨赶到公司参加晋升面谈。主管迟到了二十分钟，只说预算被冻结，这次不会有人晋升。他让我继续负责原来的项目，并承诺三个月后再讨论。",
  },
  {
    id: "lost_wallet",
    style: "多声部内心独白",
    direction: "让逻辑、共情与直觉短暂交锋；保持清晰，不得新增人物或事件。",
    source:
      "我在末班公交车上捡到一个钱包，里面有身份证、两张银行卡和三百元现金。我按身份证地址送过去，失主确认东西没有少，向我道谢。我没有收他提出的一百元酬谢。",
  },
];

function buildPrompt(testCase) {
  const sourceLength = textLength(testCase.source);
  const minimumLength = Math.max(1, Math.floor(sourceLength * 0.8));
  const maximumLength = Math.max(minimumLength, Math.ceil(sourceLength * 1.8));
  return [
    "你是一名中文文学改写编辑。",
    "任务：完整保留原文事实、人物关系与核心含义，将文本改写为原创的心理黑色叙事。",
    `风格：${testCase.style}。${testCase.direction}`,
    `规则：只输出正文；不添加标题或解释；不复制或引用现有作品台词与专有角色；使用简体中文；原文约 ${sourceLength} 字，输出必须为 ${minimumLength} 至 ${maximumLength} 字。`,
    "<source_text>",
    testCase.source,
    "</source_text>",
  ].join("\n");
}

function buildCompressionPrompt(testCase, draft) {
  const sourceLength = textLength(testCase.source);
  const minimumLength = Math.max(1, Math.floor(sourceLength * 0.8));
  const maximumLength = Math.max(minimumLength, Math.ceil(sourceLength * 1.8));
  return [
    "你是一名严格的中文文字编辑。下面的改写草稿过长，需要压缩，但不得改变或新增事实。",
    `原文约 ${sourceLength} 字；最终正文必须为 ${minimumLength} 至 ${maximumLength} 字。`,
    "保留关键意象与叙事风格，删除重复描写；只输出压缩后的正文，不要解释。",
    `<source_text>\n${testCase.source}\n</source_text>`,
    `<draft>\n${draft}\n</draft>`,
  ].join("\n\n");
}

function redact(value) {
  return String(value).replace(/sk-[A-Za-z0-9_-]{8,}/g, "[REDACTED]").slice(0, 500);
}

async function chat(apiKey, model, messages, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  const started = performance.now();

  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.65,
        max_tokens: options.maxTokens ?? 650,
        enable_thinking: options.enableThinking ?? false,
        ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
      }),
      signal: controller.signal,
    });

    const raw = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${redact(raw)}`);

    const data = JSON.parse(raw);
    const content = data.choices?.[0]?.message?.content?.trim() || "";
    if (!content) throw new Error("模型返回了空正文");
    if (data.choices?.[0]?.finish_reason === "length") {
      throw new Error("模型输出达到长度上限，正文被截断");
    }
    return {
      content,
      usage: data.usage || {},
      latencyMs: Math.round(performance.now() - started),
      finishReason: data.choices?.[0]?.finish_reason || null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function consume() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, consume));
  return results;
}

function estimateCost(usage, price) {
  return (
    ((usage.prompt_tokens || 0) * price.input + (usage.completion_tokens || 0) * price.output) /
    1_000_000
  );
}

function textLength(value) {
  return Array.from(value.replace(/\s/g, "")).length;
}

function isLengthCompliant(source, output) {
  const ratio = textLength(output) / textLength(source);
  return ratio >= 0.8 && ratio <= 1.8;
}

function parseJudge(content) {
  const normalized = content.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(normalized);
  if (!Array.isArray(parsed.evaluations)) throw new Error("评审响应缺少 evaluations");
  return parsed.evaluations;
}

function makeJudgePrompt(testCase, entries) {
  const outputs = entries
    .map((entry) => `<candidate id="${entry.alias}">\n${entry.content}\n</candidate>`)
    .join("\n\n");

  return [
    "你是严格的中文文学编辑，请对匿名候选改写进行盲评。不要根据篇幅或华丽辞藻自动加分。",
    "每项 0-10 分：fidelity 事实保真、style 风格完成度、originality 原创性、readability 可读性、instruction 指令遵循。overall 是五项等权平均，保留一位小数。",
    "只输出 JSON：{\"evaluations\":[{\"id\":\"A\",\"fidelity\":0,\"style\":0,\"originality\":0,\"readability\":0,\"instruction\":0,\"overall\":0,\"strength\":\"\",\"issue\":\"\"}]}。必须覆盖所有候选。",
    `<source_text>\n${testCase.source}\n</source_text>`,
    outputs,
  ].join("\n\n");
}

function markdownReport(report) {
  const lines = [
    "# SiliconFlow 中文改写模型基准",
    "",
    `- 运行时间：${report.createdAt}`,
    `- 价格快照：${report.priceSnapshot}（[官方价格页](${report.priceSource})）`,
    `- 盲评模型：${report.judgeModel}`,
    "",
    "| 模型 | 平均质量 / 10 | 长度合规 | 平均延迟 | 100 次估算费用 | 成功样本 |",
    "|---|---:|---:|---:|---:|---:|",
  ];

  for (const item of report.summary) {
    lines.push(
      `| ${item.model} | ${item.averageScore ?? "-"} | ${item.lengthCompliant}/${item.successes} | ${item.averageLatencyMs} ms | ¥${item.costPer100.toFixed(4)} | ${item.successes}/${cases.length} |`,
    );
  }

  lines.push("", "> 费用由 API usage 与价格快照估算，最终以 SiliconFlow 账单为准。", "");
  return lines.join("\n");
}

async function main() {
  if (DRY_RUN) {
    console.log(`Dry run: ${models.length} models × ${cases.length} cases; judge=${JUDGE_MODEL}`);
    console.log("No network request was made and no API key was read.");
    return;
  }

  const apiKey = process.env.SILICONFLOW_API_KEY?.trim();
  if (!apiKey) {
    console.error("SILICONFLOW_API_KEY 未设置；未发起任何网络请求。");
    process.exitCode = 2;
    return;
  }
  if (!BASE_URL.startsWith("https://")) throw new Error("SILICONFLOW_BASE_URL 必须使用 HTTPS");

  const jobs = cases.flatMap((testCase) => models.map((model) => ({ testCase, model })));
  console.log(`Running ${jobs.length} generation requests with concurrency 3...`);

  const generations = await mapLimit(jobs, 3, async ({ testCase, model }) => {
    try {
      const targetTokens = Math.max(
        80,
        Math.floor((textLength(testCase.source) * 11 + 9) / 10),
      );
      const first = await chat(
        apiKey,
        model.id,
        [{ role: "user", content: buildPrompt(testCase) }],
        {
          maxTokens: Math.min(1600, Math.max(800, targetTokens * 4)),
          enableThinking: false,
        },
      );
      let response = first;
      let attempts = 1;
      let totalCost = estimateCost(first.usage, model);
      let totalLatency = first.latencyMs;

      if (!isLengthCompliant(testCase.source, first.content)) {
        const second = await chat(
          apiKey,
          model.id,
          [{ role: "user", content: buildCompressionPrompt(testCase, first.content) }],
          {
            maxTokens: Math.min(1400, targetTokens + 100),
            temperature: 0.2,
            enableThinking: false,
          },
        );
        response = second;
        attempts = 2;
        totalCost += estimateCost(second.usage, model);
        totalLatency += second.latencyMs;
      }

      if (!isLengthCompliant(testCase.source, response.content)) {
        throw new Error("二次压缩后仍未满足长度约束");
      }

      const lengthRatio = textLength(response.content) / textLength(testCase.source);
      const result = {
        caseId: testCase.id,
        model: model.id,
        content: response.content,
        usage: response.usage,
        latencyMs: totalLatency,
        attempts,
        finishReason: response.finishReason,
        lengthRatio: Number(lengthRatio.toFixed(2)),
        lengthCompliant: lengthRatio >= 0.8 && lengthRatio <= 1.8,
        estimatedCostCny: totalCost,
      };
      console.log(`[ok] ${testCase.id} · ${model.id} · ${result.latencyMs} ms`);
      return result;
    } catch (error) {
      const message = redact(error?.message || error);
      console.error(`[fail] ${testCase.id} · ${model.id} · ${message}`);
      return { caseId: testCase.id, model: model.id, error: message };
    }
  });

  const judgments = [];
  let judgeCostCny = 0;
  for (const [caseIndex, testCase] of cases.entries()) {
    const successful = generations.filter((item) => item.caseId === testCase.id && !item.error);
    const rotated = successful.slice(caseIndex).concat(successful.slice(0, caseIndex));
    const anonymous = rotated.map((item, index) => ({ ...item, alias: String.fromCharCode(65 + index) }));
    if (!anonymous.length) continue;

    try {
      const response = await chat(
        apiKey,
        JUDGE_MODEL,
        [{ role: "user", content: makeJudgePrompt(testCase, anonymous) }],
        { temperature: 0.1, maxTokens: 1400, enableThinking: false, responseFormat: { type: "json_object" } },
      );
      judgeCostCny += estimateCost(response.usage, judgePrice);
      for (const score of parseJudge(response.content)) {
        const match = anonymous.find((item) => item.alias === score.id);
        if (match) judgments.push({ caseId: testCase.id, model: match.model, ...score });
      }
    } catch (error) {
      console.error(`Judge failed for ${testCase.id}: ${redact(error?.message || error)}`);
    }
  }

  const summary = models
    .map((model) => {
      const rows = generations.filter((item) => item.model === model.id && !item.error);
      const scores = judgments.filter((item) => item.model === model.id);
      const totalCost = rows.reduce((sum, item) => sum + item.estimatedCostCny, 0);
      return {
        model: model.id,
        successes: rows.length,
        averageScore: scores.length
          ? Number((scores.reduce((sum, item) => sum + Number(item.overall), 0) / scores.length).toFixed(2))
          : null,
        averageLatencyMs: rows.length
          ? Math.round(rows.reduce((sum, item) => sum + item.latencyMs, 0) / rows.length)
          : 0,
        lengthCompliant: rows.filter((item) => item.lengthCompliant).length,
        totalCostCny: totalCost,
        costPer100: rows.length ? (totalCost / rows.length) * 100 : 0,
      };
    })
    .sort((a, b) => (b.averageScore ?? -1) - (a.averageScore ?? -1));

  const report = {
    createdAt: new Date().toISOString(),
    priceSnapshot: PRICE_SNAPSHOT,
    priceSource: PRICE_SOURCE,
    judgeModel: JUDGE_MODEL,
    judgeCostCny,
    cases,
    generations,
    judgments,
    summary,
  };

  await mkdir("benchmark-results", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = `benchmark-results/siliconflow-${stamp}.json`;
  const markdownPath = `benchmark-results/siliconflow-${stamp}.md`;
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  await writeFile(markdownPath, markdownReport(report), { mode: 0o600 });

  console.table(
    summary.map((item) => ({
      model: item.model,
      score: item.averageScore,
      latency_ms: item.averageLatencyMs,
      cost_100_cny: Number(item.costPer100.toFixed(4)),
      length_ok: `${item.lengthCompliant}/${item.successes}`,
      successes: `${item.successes}/${cases.length}`,
    })),
  );
  console.log(`Reports written to ${jsonPath} and ${markdownPath}`);
}

main().catch((error) => {
  console.error(redact(error?.message || error));
  process.exitCode = 1;
});
