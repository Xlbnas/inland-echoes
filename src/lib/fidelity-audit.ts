import { z } from "zod";
import { escapePromptXml } from "./prompt-escape";

export const fidelityAuditSchema = z.object({
  supported: z.boolean(),
  changedFacts: z.array(z.object({
    sourceFact: z.string().max(300),
    candidateClaim: z.string().max(300),
    reason: z.string().max(500),
  }).strict()).max(30),
  unsupportedClaims: z.array(z.object({
    claim: z.string().max(300),
    reason: z.string().max(500),
    severity: z.enum(["minor", "major"]),
  }).strict()).max(30),
  missingCriticalFacts: z.array(z.string().max(300)).max(30),
}).strict();

export type FidelityAuditResult = z.infer<typeof fidelityAuditSchema>;

function stripJsonFence(value: string) {
  return value.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
}

export async function auditRewriteFidelity(
  source: string,
  candidate: string,
  signal: AbortSignal,
  forceEnabled = false,
): Promise<FidelityAuditResult | null> {
  if (!forceEnabled && process.env.REWRITE_FACT_AUDIT_ENABLED !== "true") return null;
  const apiKey = process.env.SILICONFLOW_API_KEY?.trim();
  const model = process.env.SILICONFLOW_AUDIT_MODEL?.trim();
  if (!apiKey || !model) return null;
  const baseUrl = (process.env.SILICONFLOW_BASE_URL || "https://api.siliconflow.cn/v1").replace(/\/$/u, "");
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "只比较原文与候选的可验证事实。不要评价文学风格。只输出符合给定字段的 JSON。心理感受、猜测和比喻不是事实，除非候选把它们断言成现实。",
          },
          {
            role: "user",
            content: `<source_text>${escapePromptXml(source)}</source_text>\n<candidate>${escapePromptXml(candidate)}</candidate>\n返回 supported、changedFacts、unsupportedClaims、missingCriticalFacts。supported 仅在没有重大改写或新增事实时为 true。`,
          },
        ],
        temperature: 0.05,
        max_tokens: 700,
        enable_thinking: false,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(45_000)]),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const raw = String(payload?.choices?.[0]?.message?.content || "");
    return fidelityAuditSchema.parse(JSON.parse(stripJsonFence(raw)));
  } catch {
    return null;
  }
}

export function fidelityAuditViolations(result: FidelityAuditResult | null) {
  if (!result || result.supported) return [];
  return [
    ...result.changedFacts.map((item) => `changed_fact: ${item.sourceFact} -> ${item.candidateClaim}（${item.reason}）`),
    ...result.unsupportedClaims.map((item) => `unsupported_claim: ${item.claim}（${item.reason}）`),
    ...result.missingCriticalFacts.map((item) => `missing_critical_fact: ${item}`),
  ];
}
