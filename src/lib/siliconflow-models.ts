import { z } from "zod";

export const SILICONFLOW_MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/u;

function validModelId(modelId: string) {
  const value = modelId.trim();
  return SILICONFLOW_MODEL_ID_PATTERN.test(value) &&
    !value.includes("..") &&
    !/[?#\s\u0000-\u001f\u007f]/u.test(value) &&
    !/^https?:\/\//iu.test(value);
}

export type SiliconFlowModelProfile = "balanced" | "quality" | "fast" | "long_text";

export type SiliconFlowModelSelection =
  | { mode: "recommended"; modelId: string }
  | { mode: "custom"; modelId: string };

export type RecommendedSiliconFlowModel = {
  id: string;
  label: string;
  profile: SiliconFlowModelProfile;
  description: string;
  strengths: string[];
  cautions: string[];
  benchmarkStatus: "verified" | "candidate" | "failed" | "unavailable";
  verifiedAt?: string;
};

const modelSchema = z.object({
  id: z.string().trim().refine(validModelId, "模型 ID 格式无效"),
  label: z.string().trim().min(1).max(40),
  profile: z.enum(["balanced", "quality", "fast", "long_text"]),
  description: z.string().trim().min(1).max(160),
  strengths: z.array(z.string().trim().min(1).max(80)).max(8).default([]),
  cautions: z.array(z.string().trim().min(1).max(80)).max(8).default([]),
  benchmarkStatus: z.enum(["verified", "candidate", "failed", "unavailable"]).default("candidate"),
  verifiedAt: z.string().datetime({ offset: true }).optional(),
}).strict();

const catalogSchema = z.array(modelSchema).min(1).max(20);

function fallbackCatalog(): RecommendedSiliconFlowModel[] {
  const id = process.env.SILICONFLOW_MODEL?.trim() || "deepseek-ai/DeepSeek-V4-Flash";
  const safeId = validModelId(id)
    ? id
    : "deepseek-ai/DeepSeek-V4-Flash";
  return [{
    id: safeId,
    label: "部署默认候选",
    profile: "balanced",
    description: "当前部署默认模型，尚未通过本轮完整横向基准。",
    strengths: ["保持现有部署兼容性"],
    cautions: ["待完成真实模型基准验证"],
    benchmarkStatus: "candidate",
  }];
}

export function getRecommendedSiliconFlowModels(): RecommendedSiliconFlowModel[] {
  const raw = process.env.SILICONFLOW_RECOMMENDED_MODELS_JSON?.trim();
  if (!raw) return fallbackCatalog();
  try {
    const parsed = catalogSchema.parse(JSON.parse(raw));
    const seen = new Set<string>();
    return parsed.filter((model) => {
      if (seen.has(model.id)) return false;
      seen.add(model.id);
      return true;
    });
  } catch {
    return fallbackCatalog();
  }
}

export function getSelectableSiliconFlowModels() {
  return getRecommendedSiliconFlowModels().filter(
    (model) => model.benchmarkStatus !== "failed" && model.benchmarkStatus !== "unavailable",
  );
}

export function isRecommendedSiliconFlowModel(modelId: string) {
  return getSelectableSiliconFlowModels().some((model) => model.id === modelId);
}

export function isValidSiliconFlowModelId(modelId: string) {
  return validModelId(modelId);
}

export function siliconFlowModelShortName(modelId: string) {
  return modelId.split("/").filter(Boolean).at(-1) || modelId;
}
