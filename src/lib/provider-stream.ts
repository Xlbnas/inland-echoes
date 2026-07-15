import type { StyleId } from "./types";
import { resolveProvider } from "./provider-config";
import { buildRewritePrompt } from "./styles";
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
      } catch {
        // Ignore heartbeat or provider-specific non-JSON SSE frames.
      }
    }

    if (done) break;
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

  const response = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        {
          role: "user",
          content: buildRewritePrompt(text, style),
        },
      ],
      stream: true,
      temperature: 0.85,
      max_tokens: 1600,
    }),
    signal,
  });

  if (!response.ok) {
    const body = (await response.text()).slice(0, 300);
    throw new Error(`模型接口返回 ${response.status}${body ? `：${body}` : ""}`);
  }

  yield* streamSseResponse(response);
}
