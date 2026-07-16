import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

afterEach(() => {
  delete process.env.CUSTOM_PROVIDERS_ENABLED;
  delete process.env.SILICONFLOW_API_KEY;
  delete process.env.SILICONFLOW_RECOMMENDED_MODELS_JSON;
  delete process.env.SILICONFLOW_ALLOW_CUSTOM_MODEL_WITH_SERVER_KEY;
});

describe("GET /api/providers", () => {
  it("返回默认关闭的服务端能力值", async () => {
    const response = GET();
    await expect(response.json()).resolves.toMatchObject({
      capabilities: { customProvidersEnabled: false },
    });
  });

  it("只在明确开启时返回自定义线路能力", async () => {
    process.env.CUSTOM_PROVIDERS_ENABLED = "true";
    const response = GET();
    await expect(response.json()).resolves.toMatchObject({
      capabilities: { customProvidersEnabled: true },
    });
  });

  it("返回 SiliconFlow 推荐目录与部署策略但不泄露 Key", async () => {
    process.env.SILICONFLOW_API_KEY = "super-secret";
    process.env.SILICONFLOW_RECOMMENDED_MODELS_JSON = JSON.stringify([{
      id: "vendor/model", label: "综合候选", profile: "balanced", description: "项目测试目录",
      strengths: ["稳定"], cautions: ["待复测"], benchmarkStatus: "candidate",
    }]);
    const payload = await GET().json();
    const siliconflow = payload.providers.find((provider: { id: string }) => provider.id === "siliconflow");
    expect(siliconflow.capabilities).toMatchObject({
      selectableModel: true,
      customModelAllowed: true,
      customModelRequiresUserKey: true,
      recommendedModels: [expect.objectContaining({ id: "vendor/model" })],
    });
    expect(JSON.stringify(payload)).not.toContain("super-secret");
  });
});
