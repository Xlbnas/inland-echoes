#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";

const DEFAULT_CANDIDATES = [
  "deepseek-ai/DeepSeek-V4-Flash",
  "Qwen/Qwen3.5-35B-A3B",
  "deepseek-ai/DeepSeek-V3.2",
];

async function main() {
  const apiKey = process.env.SILICONFLOW_API_KEY?.trim();
  if (!apiKey) throw new Error("SILICONFLOW_API_KEY 未设置；没有查询模型列表");
  const baseUrl = (process.env.SILICONFLOW_BASE_URL || "https://api.siliconflow.cn/v1").replace(/\/$/u, "");
  const response = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`模型列表接口返回 HTTP ${response.status}`);
  const payload = await response.json();
  const modelIds = Array.isArray(payload?.data)
    ? payload.data.map((item: unknown) => String((item as { id?: unknown })?.id || "")).filter(Boolean)
    : [];
  const candidates = (process.env.SILICONFLOW_BENCHMARK_MODELS || DEFAULT_CANDIDATES.join(","))
    .split(",").map((item) => item.trim()).filter(Boolean);
  const snapshot = {
    checkedAt: new Date().toISOString(),
    endpoint: "SiliconFlow built-in /models",
    modelCount: modelIds.length,
    candidates: candidates.map((id) => ({ id, available: modelIds.includes(id) })),
    modelIds,
  };
  await mkdir("benchmark-results/model-snapshots", { recursive: true });
  const path = `benchmark-results/model-snapshots/siliconflow-models-${snapshot.checkedAt.replace(/[:.]/gu, "-")}.json`;
  await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ candidates: snapshot.candidates, modelCount: snapshot.modelCount, snapshot: path }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "模型列表查询失败");
  process.exitCode = 1;
});
