import { afterEach, describe, expect, it, vi } from "vitest";
import { generateValidatedRewrite, RewriteProviderError } from "./provider-stream";

const request = { id: "custom-test", label: "测试线路", baseUrl: "https://example.com/v1", model: "test-model", apiKey: "test-key" };
const source = "天气很热。";
const valid = "【逻辑：通过】热是此刻唯一明确的事实。它压在感受上，却没有携带别的结论。\n\n焦躁从身体里浮起来，来得真实，也只属于这阵热意。\n\n【镇定】先承认不适，再把多余的解释放下；呼吸仍可慢慢回到原处。";
const json = (content: string, finishReason = "stop") => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: finishReason }] }), { status: 200, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("generateValidatedRewrite", () => {
  it("sends stable system and user messages with no thinking flag for SiliconFlow", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(valid)); vi.stubGlobal("fetch", fetchMock);
    await generateValidatedRewrite({ ...request, id: "siliconflow", baseUrl: "https://api.siliconflow.cn/v1" }, source, "inner_monologue", new AbortController().signal);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.messages.map((item: { role: string }) => item.role)).toEqual(["system", "user"]);
    expect(body.enable_thinking).toBe(false);
    expect(body.temperature).toBe(0.68);
  });

  it("repairs one invalid draft with low temperature", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json("太短。" )).mockResolvedValueOnce(json(valid)); vi.stubGlobal("fetch", fetchMock);
    const result = await generateValidatedRewrite(request, source, "psycho_noir", new AbortController().signal);
    expect(result.repaired).toBe(true); expect(result.attempts).toBe(2);
    const second = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(second.temperature).toBe(0.25); expect(second.messages[1].content).toContain("<repair_request>");
  });

  it("classifies auth failures without retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 })); vi.stubGlobal("fetch", fetchMock);
    await expect(generateValidatedRewrite(request, source, "lyrical", new AbortController().signal)).rejects.toMatchObject({ code: "auth_error" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries one rate-limit response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("limited", { status: 429 })).mockResolvedValueOnce(json(valid)); vi.stubGlobal("fetch", fetchMock);
    await expect(generateValidatedRewrite(request, source, "lyrical", new AbortController().signal)).resolves.toMatchObject({ content: valid });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("classifies a second invalid response and keeps diagnostic details internal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => json("太短。")));
    try { await generateValidatedRewrite(request, source, "lyrical", new AbortController().signal); throw new Error("expected failure"); }
    catch (error) {
      expect(error).toBeInstanceOf(RewriteProviderError);
      expect(error).toMatchObject({ code: "quality_contract_failed" });
      expect((error as RewriteProviderError).details?.violations).toContain("too_short: 正文少于 70 字");
    }
  });

  it("stops before repair when the caller aborts", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => { controller.abort(); return json("太短。"); }));
    await expect(generateValidatedRewrite(request, source, "lyrical", controller.signal)).rejects.toMatchObject({ code: "user_aborted" });
  });
});
