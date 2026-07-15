import { getCheckSkill, type CheckResult } from "./checks-shared";
import { resolveProvider } from "./provider-config";
import { buildRepairMessages, buildRewriteMessages, type RewriteMessage } from "./rewrite-prompts";
import { validateRewriteQuality } from "./rewrite-quality";
import { rewriteLengthRange } from "./rewrite-length";
import type { ProviderRequest, StyleId } from "./types";

export type RewriteErrorCode =
  | "auth_error" | "rate_limited" | "upstream_timeout" | "upstream_unavailable"
  | "empty_response" | "truncated_response" | "quality_contract_failed" | "user_aborted";

const PUBLIC_MESSAGES: Record<RewriteErrorCode, string> = {
  auth_error: "线路鉴权失败，请检查 API 密钥",
  rate_limited: "线路请求过多，请稍后重试",
  upstream_timeout: "线路响应超时，请稍后重试",
  upstream_unavailable: "线路暂时不可用，请稍后重试",
  empty_response: "线路没有返回可用正文",
  truncated_response: "线路输出被截断，请重试",
  quality_contract_failed: "线路未能满足改写质量契约，请重试或更换模型",
  user_aborted: "生成已停止",
};

export class RewriteProviderError extends Error {
  constructor(
    public readonly code: RewriteErrorCode,
    public readonly retryable = false,
    public readonly details?: { violations?: string[]; output?: string },
  ) {
    super(PUBLIC_MESSAGES[code]);
    this.name = "RewriteProviderError";
  }
}

type ResolvedProvider = ReturnType<typeof resolveProvider>;
type Completion = { content: string; truncated: boolean; usage?: Record<string, number>; finishReason?: string | null };

function classifyStatus(status: number) {
  if ([400, 401, 403].includes(status)) return new RewriteProviderError("auth_error");
  if (status === 429) return new RewriteProviderError("rate_limited", true);
  return new RewriteProviderError("upstream_unavailable", [502, 503, 504].includes(status));
}

function abortError(signal: AbortSignal, timedOut: boolean) {
  return new RewriteProviderError(signal.aborted && !timedOut ? "user_aborted" : "upstream_timeout");
}

async function parseCompletion(response: Response): Promise<Completion> {
  if (!response.body) throw new RewriteProviderError("empty_response");
  if ((response.headers.get("content-type") || "").includes("application/json")) {
    const payload = await response.json();
    return {
      content: String(payload?.choices?.[0]?.message?.content || "").trim(),
      truncated: payload?.choices?.[0]?.finish_reason === "length",
      usage: payload?.usage,
      finishReason: payload?.choices?.[0]?.finish_reason,
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let truncated = false;
  let finishReason: string | null = null;
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const frames = buffer.split("\n");
    buffer = frames.pop() || "";
    for (const raw of frames) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const payload = JSON.parse(data);
        const choice = payload?.choices?.[0];
        if (typeof choice?.delta?.content === "string") content += choice.delta.content;
        finishReason = choice?.finish_reason ?? finishReason;
        if (choice?.finish_reason === "length") truncated = true;
      } catch {
        // Provider heartbeat frames are intentionally ignored.
      }
    }
    if (done) break;
  }
  return { content: content.trim(), truncated, finishReason };
}

async function requestCompletion(
  provider: ResolvedProvider,
  messages: RewriteMessage[],
  maxTokens: number,
  temperature: number,
  signal: AbortSignal,
): Promise<Completion> {
  const started = Date.now();
  const totalDeadline = 110_000;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (signal.aborted) throw new RewriteProviderError("user_aborted");
    const controller = new AbortController();
    let timedOut = false;
    const remaining = Math.max(1, totalDeadline - (Date.now() - started));
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, remaining);
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    try {
      const response = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: provider.model,
          messages,
          stream: true,
          temperature,
          max_tokens: maxTokens,
          ...(provider.baseUrl.includes("siliconflow.cn") ? { enable_thinking: false } : {}),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = classifyStatus(response.status);
        if (error.retryable && attempt === 0) {
          const retryAfter = Number(response.headers.get("retry-after") || 0);
          if (retryAfter > 0 && retryAfter <= 2) await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
          continue;
        }
        throw error;
      }
      return await parseCompletion(response);
    } catch (error) {
      if (error instanceof RewriteProviderError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") throw abortError(signal, timedOut);
      if (attempt === 0) continue;
      throw new RewriteProviderError("upstream_unavailable");
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  }
  throw new RewriteProviderError("upstream_unavailable");
}

async function* yieldBufferedText(content: string) {
  const chars = Array.from(content);
  for (let index = 0; index < chars.length; index += 24) yield chars.slice(index, index + 24).join("");
}

export type RewriteAttemptResult = { content: string; repaired: boolean; attempts: number; violations: string[] };

export async function generateValidatedRewrite(
  request: ProviderRequest,
  text: string,
  style: StyleId,
  signal: AbortSignal,
  check?: CheckResult,
): Promise<RewriteAttemptResult> {
  const provider = resolveProvider(request);
  if (provider.mock) {
    const prefix = check ? `${getCheckSkill(check.skill).mock[check.outcome]}\n\n` : "【逻辑：通过】先把事实留在原地。\n\n";
    return {
      content: `${prefix}${text}\n\n【直觉】它没有改变，只是在回声里显出另一层边缘。`,
      repaired: false,
      attempts: 1,
      violations: [],
    };
  }
  const { maxTokens } = rewriteLengthRange(text);
  const first = await requestCompletion(provider, buildRewriteMessages(text, style, check), maxTokens, 0.68, signal);
  if (!first.content) throw new RewriteProviderError("empty_response");
  const firstQuality = validateRewriteQuality(text, first.content, check, first.truncated);
  if (firstQuality.valid) return { content: first.content, repaired: false, attempts: 1, violations: [] };
  if (signal.aborted) throw new RewriteProviderError("user_aborted");

  const codes = firstQuality.violations.map((item) => `${item.code}: ${item.message}`);
  const repaired = await requestCompletion(
    provider,
    buildRepairMessages(text, first.content, style, codes, check),
    maxTokens,
    0.25,
    signal,
  );
  if (!repaired.content) throw new RewriteProviderError("empty_response");
  const repairedQuality = validateRewriteQuality(text, repaired.content, check, repaired.truncated);
  if (!repairedQuality.valid) {
    const repairedCodes = repairedQuality.violations.map((item) => `${item.code}: ${item.message}`);
    throw new RewriteProviderError(
      repaired.truncated ? "truncated_response" : "quality_contract_failed",
      false,
      { violations: repairedCodes, output: repaired.content },
    );
  }
  return { content: repaired.content, repaired: true, attempts: 2, violations: codes };
}

export async function* streamProviderRewrite(
  request: ProviderRequest,
  text: string,
  style: StyleId,
  signal: AbortSignal,
  check?: CheckResult,
) {
  const result = await generateValidatedRewrite(request, text, style, signal, check);
  yield* yieldBufferedText(result.content);
}

export function publicProviderError(error: unknown) {
  if (error instanceof RewriteProviderError) return { code: error.code, message: error.message };
  return { code: "upstream_unavailable" as const, message: PUBLIC_MESSAGES.upstream_unavailable };
}
