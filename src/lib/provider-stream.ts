import type { StyleId } from "./types";
import { resolveProvider } from "./provider-config";
import {
  buildRewritePrompt,
  isRewriteLengthValid,
  rewriteLengthRange,
  rewriteTokenBudget,
} from "./styles";
import type { ProviderRequest } from "./types";

function mockRewrite(text: string, style: StyleId) {
  const lines: Record<StyleId, [string, string]> = {
    psycho_noir: [
      "雨水在窗外清点城市的旧账。",
      "事实没有改变，只是换了一件更沉的外套：",
    ],
    dark_humor: [
      "命运敲了敲桌面，像个没有预约却坚持报销的办事员。",
      "它郑重宣布：",
    ],
    inner_monologue: [
      "【逻辑】先把事情说清楚。\n【直觉】清楚从来不是事实的唯一形状。",
      "【共情】你真正想说的是：",
    ],
    lyrical: [
      "光线慢慢越过房间，像一句还没有决定结尾的话。",
      "我听见自己说：",
    ],
  };
  const [opening, bridge] = lines[style];
  return `${opening}\n\n${bridge}${text}\n\n这句话仍然属于你，只是现在，它学会了回望。`;
}

async function* streamMock(text: string, style: StyleId) {
  const output = mockRewrite(text, style);
  for (let index = 0; index < output.length; index += 5) {
    await new Promise((resolve) => setTimeout(resolve, 8));
    yield output.slice(index, index + 5);
  }
}

async function* streamSseResponse(response: Response) {
  if (!response.body) {
    throw new Error("模型接口没有返回内容");
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("模型接口返回格式无法识别");
    }
    yield content;
    if (payload?.choices?.[0]?.finish_reason === "length") {
      throw new Error("模型输出达到长度上限，请重试或缩短原文");
    }
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const payload = JSON.parse(data);
        const delta = payload?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) {
          yield delta;
        }
        if (payload?.choices?.[0]?.finish_reason === "length") {
          throw new Error("模型输出达到长度上限，请重试或缩短原文");
        }
      } catch {
        // Ignore heartbeat or provider-specific non-JSON SSE frames.
      }
    }

    if (done) break;
  }
}

type ResolvedProvider = ReturnType<typeof resolveProvider>;

async function collectRemoteRewrite(
  provider: ResolvedProvider,
  messages: Array<{ role: "user"; content: string }>,
  maxTokens: number,
  temperature: number,
  signal: AbortSignal,
) {
  const response = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      messages,
      stream: true,
      temperature,
      max_tokens: maxTokens,
      ...(provider.baseUrl.includes("siliconflow.cn") ? { enable_thinking: false } : {}),
    }),
    signal,
  });

  if (!response.ok) {
    const body = (await response.text())
      .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[REDACTED]")
      .slice(0, 300);
    throw new Error(`模型接口返回 ${response.status}${body ? `：${body}` : ""}`);
  }

  let content = "";
  let truncated = false;
  try {
    for await (const delta of streamSseResponse(response)) {
      content += delta;
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("达到长度上限")) {
      truncated = true;
    } else {
      throw error;
    }
  }
  return { content: content.trim(), truncated };
}

function buildCompressionPrompt(source: string, draft: string) {
  const { sourceLength, minimumLength, maximumLength } = rewriteLengthRange(source);
  return [
    "你是一名严格的中文文字编辑。下面的改写草稿过长，需要压缩，但不得改变或新增事实。",
    `原文约 ${sourceLength} 字；最终正文必须为 ${minimumLength} 至 ${maximumLength} 字。`,
    "保留关键意象与叙事风格，删除重复描写；只输出压缩后的正文，不要解释。",
    "<source_text>",
    source,
    "</source_text>",
    "<draft>",
    draft,
    "</draft>",
  ].join("\n");
}

async function* yieldBufferedText(content: string) {
  for (let index = 0; index < content.length; index += 8) {
    yield content.slice(index, index + 8);
  }
}

export async function* streamProviderRewrite(
  request: ProviderRequest,
  text: string,
  style: StyleId,
  signal: AbortSignal,
) {
  const provider = resolveProvider(request);
  if (provider.mock) {
    yield* streamMock(text, style);
    return;
  }

  const targetBudget = rewriteTokenBudget(text);
  const firstAttempt = await collectRemoteRewrite(
    provider,
    [{ role: "user", content: buildRewritePrompt(text, style) }],
    Math.min(1600, Math.max(800, targetBudget * 4)),
    0.65,
    signal,
  );

  if (!firstAttempt.truncated && isRewriteLengthValid(text, firstAttempt.content)) {
    yield* yieldBufferedText(firstAttempt.content);
    return;
  }
  if (!firstAttempt.content) {
    throw new Error("模型没有返回可用正文，请更换模型或重试");
  }

  const secondAttempt = await collectRemoteRewrite(
    provider,
    [{ role: "user", content: buildCompressionPrompt(text, firstAttempt.content) }],
    Math.min(1400, targetBudget + 100),
    0.2,
    signal,
  );

  if (secondAttempt.truncated || !isRewriteLengthValid(text, secondAttempt.content)) {
    throw new Error("模型未能满足长度约束，请重试或更换模型");
  }
  yield* yieldBufferedText(secondAttempt.content);
}
