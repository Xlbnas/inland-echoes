import { z } from "zod";
import {
  CHECK_DIFFICULTIES,
  CHECK_SKILL_IDS,
  DEFAULT_CHECK_REQUEST,
} from "./checks-shared";
import { STYLE_IDS } from "./types";
import { isValidSiliconFlowModelId } from "./siliconflow-models";

export const providerRequestSchema = z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(40),
  apiKey: z.string().trim().max(512).optional(),
  baseUrl: z.string().trim().max(500).optional(),
  model: z.string().trim().max(120).optional(),
}).superRefine((provider, context) => {
  if (provider.id === "siliconflow" && provider.model && !isValidSiliconFlowModelId(provider.model)) {
    context.addIssue({
      code: "custom",
      path: ["model"],
      message: "SiliconFlow 模型 ID 格式无效",
    });
  }
});

export const checkRequestSchema = z
  .object({
    enabled: z.boolean(),
    skill: z.enum(CHECK_SKILL_IDS),
    skillLevel: z.number().int().min(0).max(6),
    difficulty: z.union([
      z.literal(CHECK_DIFFICULTIES[0].value),
      z.literal(CHECK_DIFFICULTIES[1].value),
      z.literal(CHECK_DIFFICULTIES[2].value),
      z.literal(CHECK_DIFFICULTIES[3].value),
      z.literal(CHECK_DIFFICULTIES[4].value),
      z.literal(CHECK_DIFFICULTIES[5].value),
    ]),
  })
  .strict();

export const rewriteRequestSchema = z.object({
  text: z.string().trim().min(1, "请输入需要改写的文本").max(1000, "输入不能超过 1000 字"),
  style: z.enum(STYLE_IDS),
  providers: z.array(providerRequestSchema).min(1).max(3, "一次最多比较三个模型"),
  check: checkRequestSchema.default(DEFAULT_CHECK_REQUEST),
});
