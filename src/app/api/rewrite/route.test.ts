import { afterEach, describe, expect, it, vi } from "vitest";
import { getCheckSkill, type CheckResult } from "@/lib/checks-shared";
import { resetRateLimitForTests } from "@/lib/rate-limit";
import type { RewriteEvent } from "@/lib/types";
import { POST } from "./route";

let requestIndex = 0;

function makeRequest(body: unknown) {
  requestIndex += 1;
  return new Request("http://localhost/api/rewrite", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `198.51.100.${requestIndex}`,
    },
    body: JSON.stringify(body),
  });
}

async function readEvents(response: Response) {
  const text = await response.text();
  return text.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as RewriteEvent);
}

const baseRequest = {
  text: "会议结束了，但没有人真正得到答案。",
  style: "inner_monologue",
  providers: [{ id: "mock", label: "本地演示" }],
};

afterEach(() => {
  delete process.env.CUSTOM_PROVIDERS_ENABLED;
  delete process.env.ALLOW_LOCAL_PROVIDER;
  delete process.env.TRUST_PROXY;
  delete process.env.RATE_LIMIT_UNITS_PER_MINUTE;
  delete process.env.SILICONFLOW_API_KEY;
  delete process.env.SILICONFLOW_RECOMMENDED_MODELS_JSON;
  delete process.env.SILICONFLOW_ALLOW_CUSTOM_MODEL_WITH_SERVER_KEY;
  vi.unstubAllGlobals();
  resetRateLimitForTests();
});

describe("POST /api/rewrite", () => {
  it("兼容不含 check 的旧请求且不发送判定事件", async () => {
    const response = await POST(makeRequest(baseRequest));
    expect(response.status).toBe(200);
    const events = await readEvents(response);
    expect(events.some((event) => event.type === "check_resolved")).toBe(false);
    expect(events[0]?.type).toBe("provider_start");
    expect(events.at(-1)?.type).toBe("provider_done");
    const output = events
      .filter((event): event is Extract<RewriteEvent, { type: "provider_delta" }> => event.type === "provider_delta")
      .map((event) => event.delta)
      .join("");
    expect(output).not.toMatch(/逻辑：通过|未通过|灾难性误判|极佳通过/u);
  });

  it.each([
    ["频道", { enabled: true, skill: "memory", skillLevel: 3, difficulty: 10 }],
    ["等级", { enabled: true, skill: "logic", skillLevel: 9, difficulty: 10 }],
    ["难度", { enabled: true, skill: "logic", skillLevel: 3, difficulty: 11 }],
  ])("拒绝非法%s", async (_label, check) => {
    const response = await POST(makeRequest({ ...baseRequest, check }));
    expect(response.status).toBe(400);
  });

  it("拒绝客户端伪造骰点、合计、差值和结果", async () => {
    const response = await POST(makeRequest({
      ...baseRequest,
      check: {
        enabled: true,
        skill: "logic",
        skillLevel: 3,
        difficulty: 10,
        dice: [6, 6],
        total: 15,
        margin: 5,
        outcome: "critical_success",
      },
    }));
    expect(response.status).toBe(400);
  });

  it("先发送服务端判定，再开始供应商流", async () => {
    const response = await POST(makeRequest({
      ...baseRequest,
      check: { enabled: true, skill: "empathy", skillLevel: 4, difficulty: 12 },
    }));
    const events = await readEvents(response);
    expect(events[0]?.type).toBe("check_resolved");
    expect(events[1]?.type).toBe("provider_start");

    const result = (events[0] as { type: "check_resolved"; result: CheckResult }).result;
    expect(result.dice).toHaveLength(2);
    expect(result.dice.every((die) => Number.isInteger(die) && die >= 1 && die <= 6)).toBe(true);
    expect(result.total).toBe(result.dice[0] + result.dice[1] + result.skillLevel);

    const output = events
      .filter((event): event is Extract<RewriteEvent, { type: "provider_delta" }> => event.type === "provider_delta")
      .map((event) => event.delta)
      .join("");
    expect(output).toContain(getCheckSkill(result.skill).mock[result.outcome]);
  });

  it("多供应商请求只产生一个共享判定事件", async () => {
    const response = await POST(makeRequest({
      ...baseRequest,
      providers: [
        { id: "mock", label: "本地演示甲" },
        { id: "mock", label: "本地演示乙" },
      ],
      check: { enabled: true, skill: "reaction", skillLevel: 2, difficulty: 10 },
    }));
    const events = await readEvents(response);
    expect(events.filter((event) => event.type === "check_resolved")).toHaveLength(1);
    expect(events.filter((event) => event.type === "provider_start")).toHaveLength(2);
  });

  it("关闭判定不改变多供应商开始与完成顺序", async () => {
    const response = await POST(makeRequest({
      ...baseRequest,
      providers: [
        { id: "mock", label: "本地演示甲" },
        { id: "mock", label: "本地演示乙" },
      ],
    }));
    const events = await readEvents(response);
    expect(events.filter((event) => event.type === "check_resolved")).toHaveLength(0);
    expect(events
      .filter((event): event is Extract<RewriteEvent, { type: "provider_start" }> => event.type === "provider_start")
      .map((event) => event.label))
      .toEqual(["本地演示甲", "本地演示乙"]);
    expect(events.filter((event) => event.type === "provider_done")).toHaveLength(2);
  });

  it("默认拒绝未知自定义供应商且 ALLOW_LOCAL_PROVIDER 不能绕过", async () => {
    const customRequest = {
      ...baseRequest,
      providers: [{
        id: "custom-test",
        label: "测试线路",
        baseUrl: "https://api.example.com/v1",
        model: "test-model",
        apiKey: "test-key",
      }],
    };
    const disabled = await POST(makeRequest(customRequest));
    expect(disabled.status).toBe(400);
    await expect(disabled.json()).resolves.toEqual({ error: "当前部署未启用自定义模型线路" });

    process.env.ALLOW_LOCAL_PROVIDER = "true";
    const stillDisabled = await POST(makeRequest({
      ...customRequest,
      providers: [{
        ...customRequest.providers[0],
        baseUrl: "http://localhost:11434/v1",
      }],
    }));
    expect(stillDisabled.status).toBe(400);
  });

  it("SSRF 字面目标在流开始前被拒绝", async () => {
    process.env.CUSTOM_PROVIDERS_ENABLED = "true";
    const response = await POST(makeRequest({
      ...baseRequest,
      providers: [{
        id: "custom-test",
        label: "测试线路",
        baseUrl: "https://169.254.169.254/v1",
        model: "test-model",
        apiKey: "test-key",
      }],
    }));
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("该自定义线路地址不符合安全要求");
    expect(payload.code).toBe("unsafe_provider_target");
  });

  it("不信任代理时伪造不同 XFF 仍共享同一加权限流桶", async () => {
    process.env.RATE_LIMIT_UNITS_PER_MINUTE = "3";
    resetRateLimitForTests();
    const first = await POST(makeRequest(baseRequest));
    const second = await POST(makeRequest(baseRequest));
    expect(first.status).toBe(200);
    expect(first.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(second.status).toBe(429);
    expect(Number(second.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("推荐 SiliconFlow 模型可用服务器 Key，结果标签包含实际模型且 Base URL 不可覆盖", async () => {
    process.env.SILICONFLOW_API_KEY = "server-key";
    process.env.SILICONFLOW_RECOMMENDED_MODELS_JSON = JSON.stringify([{
      id: "vendor/recommended", label: "推荐", profile: "balanced", description: "测试",
      strengths: [], cautions: [], benchmarkStatus: "verified",
    }]);
    const content = "事实停在原文给出的边界里，没有新的场景替它作证。感受仍然可以被听见，却不再冒充结论；叙述只沿着已有信息展开，并把所有未经确认的猜测留在心里。";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content }, finish_reason: "stop" }],
    }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(makeRequest({
      text: "我很累。",
      style: "lyrical",
      providers: [{ id: "siliconflow", label: "伪造标签", model: "vendor/recommended", baseUrl: "https://evil.example/v1" }],
    }));
    expect(response.status).toBe(200);
    const events = await readEvents(response);
    expect(events[0]).toMatchObject({ type: "provider_start", label: "SiliconFlow · recommended" });
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.siliconflow.cn/v1/chat/completions");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).model).toBe("vendor/recommended");
  });

  it("自定义 SiliconFlow 模型无临时 Key 时拒绝，带 Key 时可调用", async () => {
    process.env.SILICONFLOW_API_KEY = "server-key";
    const denied = await POST(makeRequest({
      ...baseRequest,
      providers: [{ id: "siliconflow", label: "SiliconFlow", model: "vendor/custom" }],
    }));
    expect(denied.status).toBe(400);
    await expect(denied.json()).resolves.toMatchObject({ error: expect.stringContaining("请填写你自己的临时 API Key") });

    const content = "事实停在原文给出的边界里，没有新的场景替它作证。感受仍然可以被听见，却不再冒充结论；叙述只沿着已有信息展开，并把所有未经确认的猜测留在心里。";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content }, finish_reason: "stop" }],
    }), { headers: { "content-type": "application/json" } })));
    const allowed = await POST(makeRequest({
      text: "我很累。",
      style: "lyrical",
      providers: [{ id: "siliconflow", label: "SiliconFlow", model: "vendor/custom", apiKey: "user-key" }],
    }));
    expect(allowed.status).toBe(200);
  });

  it("管理员显式开启后 API 允许自定义模型使用服务器 Key，并拒绝 URL 模型 ID", async () => {
    process.env.SILICONFLOW_API_KEY = "server-key";
    process.env.SILICONFLOW_ALLOW_CUSTOM_MODEL_WITH_SERVER_KEY = "true";
    const content = "事实停在原文给出的边界里，没有新的场景替它作证。感受仍然可以被听见，却不再冒充结论；叙述只沿着已有信息展开，并把所有未经确认的猜测留在心里。";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content }, finish_reason: "stop" }],
    }), { headers: { "content-type": "application/json" } })));
    const allowed = await POST(makeRequest({
      text: "我很累。",
      style: "lyrical",
      providers: [{ id: "siliconflow", label: "SiliconFlow", model: "vendor/custom" }],
    }));
    expect(allowed.status).toBe(200);

    const invalid = await POST(makeRequest({
      ...baseRequest,
      providers: [{ id: "siliconflow", label: "SiliconFlow", model: "https://evil.example/model", apiKey: "user-key" }],
    }));
    expect(invalid.status).toBe(400);
  });
});
