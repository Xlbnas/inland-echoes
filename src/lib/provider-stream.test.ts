import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateValidatedRewrite,
  publicProviderError,
  RewriteProviderError,
} from "./provider-stream";

const request = { id: "deepseek", label: "DeepSeek", apiKey: "test-key" };
const source = "天气很热。";
const valid = "热意停在皮肤上，沉闷而直接。焦躁跟着呼吸浮起，却没有得到新的理由。你不替天气安排立场，也不让感受冒充证据，只把此刻有限而清楚的事实留在原处。";
const json = (content: string, finishReason = "stop") => new Response(
  JSON.stringify({ choices: [{ message: { content }, finish_reason: finishReason }] }),
  { status: 200, headers: { "content-type": "application/json" } },
);

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CUSTOM_PROVIDERS_ENABLED;
  delete process.env.SILICONFLOW_RECOMMENDED_MODELS_JSON;
  delete process.env.SILICONFLOW_ALLOW_CUSTOM_MODEL_WITH_SERVER_KEY;
  delete process.env.REWRITE_FACT_AUDIT_ENABLED;
  delete process.env.SILICONFLOW_AUDIT_MODEL;
  delete process.env.SILICONFLOW_API_KEY;
});

describe("generateValidatedRewrite", () => {
  it("向 SiliconFlow 发送稳定消息并关闭 thinking", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json(valid));
    vi.stubGlobal("fetch", fetchMock);
    await generateValidatedRewrite(
      { id: "siliconflow", label: "SiliconFlow", apiKey: "test-key" },
      source,
      "lyrical",
      new AbortController().signal,
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.messages.map((item: { role: string }) => item.role)).toEqual(["system", "user"]);
    expect(body.enable_thinking).toBe(false);
    expect(body.temperature).toBe(0.68);
    expect(body.messages[1].content.split("以下输入—输出对")[0]).not.toContain("<outcome>");
  });

  it("用低温完成一次定向修复", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json("太短。" )).mockResolvedValueOnce(json(valid));
    vi.stubGlobal("fetch", fetchMock);
    const result = await generateValidatedRewrite(
      request,
      source,
      "psycho_noir",
      new AbortController().signal,
    );
    expect(result).toMatchObject({ repaired: true, attempts: 2 });
    const second = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(second.temperature).toBe(0.25);
    expect(second.messages[1].content).toContain("<repair_request>");
  });

  it("推荐与自定义模型 ID 都真正传入 SiliconFlow 上游", async () => {
    process.env.SILICONFLOW_RECOMMENDED_MODELS_JSON = JSON.stringify([{
      id: "vendor/recommended", label: "推荐", profile: "balanced", description: "测试",
      strengths: [], cautions: [], benchmarkStatus: "verified",
    }]);
    const fetchMock = vi.fn().mockImplementation(async () => json(valid));
    vi.stubGlobal("fetch", fetchMock);
    await generateValidatedRewrite(
      { id: "siliconflow", label: "SiliconFlow", model: "vendor/recommended", apiKey: "test-key" },
      source, "lyrical", new AbortController().signal,
    );
    await generateValidatedRewrite(
      { id: "siliconflow", label: "SiliconFlow", model: "vendor/custom", apiKey: "user-key" },
      source, "lyrical", new AbortController().signal,
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).model).toBe("vendor/recommended");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).model).toBe("vendor/custom");
  });

  it("鉴权失败不重试，400 分类为供应商请求无效", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(generateValidatedRewrite(
      request,
      source,
      "lyrical",
      new AbortController().signal,
    )).rejects.toMatchObject({ code: "auth_error" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValue(new Response("bad request", { status: 400 }));
    await expect(generateValidatedRewrite(
      request,
      source,
      "lyrical",
      new AbortController().signal,
    )).rejects.toMatchObject({ code: "invalid_provider_request" });
  });

  it("限流响应只重试一次", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("limited", { status: 429 }))
      .mockResolvedValueOnce(json(valid));
    vi.stubGlobal("fetch", fetchMock);
    await expect(generateValidatedRewrite(
      request,
      source,
      "lyrical",
      new AbortController().signal,
    )).resolves.toMatchObject({ content: valid });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("第二次无效输出只在内部保留诊断", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => json("太短。")));
    try {
      await generateValidatedRewrite(request, source, "lyrical", new AbortController().signal);
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(RewriteProviderError);
      expect(error).toMatchObject({ code: "quality_contract_failed" });
      expect((error as RewriteProviderError).details?.violations)
        .toContain("too_short: 正文少于 70 字");
      expect(publicProviderError(error)).not.toHaveProperty("details");
    }
  });

  it("事实审计器返回非法 JSON 时不伪装成生成失败", async () => {
    process.env.REWRITE_FACT_AUDIT_ENABLED = "true";
    process.env.SILICONFLOW_AUDIT_MODEL = "vendor/auditor";
    process.env.SILICONFLOW_API_KEY = "server-audit-key";
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return body.model === "vendor/auditor"
        ? json("not-json")
        : json(valid);
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(generateValidatedRewrite(request, source, "lyrical", new AbortController().signal))
      .resolves.toMatchObject({ content: valid, attempts: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("调用方中止后不进入修复", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
      controller.abort();
      return json("太短。");
    }));
    await expect(generateValidatedRewrite(request, source, "lyrical", controller.signal))
      .rejects.toMatchObject({ code: "user_aborted" });
  });

  it("拒绝超过单个 SSE frame 限制的上游输出", async () => {
    const frame = `data: ${"x".repeat(256 * 1024)}\n`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(frame, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    })));
    await expect(generateValidatedRewrite(
      request,
      source,
      "lyrical",
      new AbortController().signal,
    )).rejects.toMatchObject({ code: "upstream_unavailable" });
  });

  it("本地演示按开启与关闭判定使用不同合同", async () => {
    const unchecked = await generateValidatedRewrite(
      { id: "mock", label: "本地演示" },
      source,
      "inner_monologue",
      new AbortController().signal,
    );
    expect(unchecked.content).toContain("【逻辑】");
    expect(unchecked.content).toContain("【直觉】");
    expect(unchecked.content).not.toMatch(/通过|未通过|灾难性误判|极佳通过/u);
  });
});
