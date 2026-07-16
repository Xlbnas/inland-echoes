import { afterEach, describe, expect, it } from "vitest";
import {
  getProviderCapabilities,
  resolveProvider,
} from "./provider-config";

afterEach(() => {
  delete process.env.CUSTOM_PROVIDERS_ENABLED;
  delete process.env.ALLOW_LOCAL_PROVIDER;
  delete process.env.SILICONFLOW_API_KEY;
  delete process.env.SILICONFLOW_MODEL;
  delete process.env.SILICONFLOW_RECOMMENDED_MODELS_JSON;
  delete process.env.SILICONFLOW_ALLOW_CUSTOM_MODEL_WITH_SERVER_KEY;
});

const custom = {
  id: "custom-test",
  label: "测试线路",
  baseUrl: "https://api.example.com/v1",
  model: "test-model",
  apiKey: "test-key",
};

describe("provider capabilities", () => {
  it("默认关闭自定义线路", () => {
    expect(getProviderCapabilities()).toEqual({ customProvidersEnabled: false });
    expect(() => resolveProvider(custom)).toThrow("当前部署未启用自定义模型线路");
  });

  it("只有明确设置 true 才启用自定义线路", () => {
    process.env.CUSTOM_PROVIDERS_ENABLED = "true";
    expect(resolveProvider(custom)).toMatchObject({ custom: true, baseUrl: custom.baseUrl });
  });

  it("ALLOW_LOCAL_PROVIDER 不能绕过自定义线路总开关", () => {
    process.env.ALLOW_LOCAL_PROVIDER = "true";
    expect(() => resolveProvider({ ...custom, baseUrl: "http://localhost:11434/v1" }))
      .toThrow("当前部署未启用自定义模型线路");
  });

  it("推荐模型可以使用服务器 Key，且客户端 Base URL 不生效", () => {
    process.env.SILICONFLOW_API_KEY = "server-key";
    process.env.SILICONFLOW_RECOMMENDED_MODELS_JSON = JSON.stringify([{
      id: "vendor/recommended", label: "推荐", profile: "balanced", description: "测试目录",
      strengths: [], cautions: [], benchmarkStatus: "verified",
    }]);
    expect(resolveProvider({
      id: "siliconflow", label: "伪造标签", model: "vendor/recommended", baseUrl: "https://evil.example/v1",
    })).toMatchObject({
      label: "SiliconFlow",
      model: "vendor/recommended",
      baseUrl: "https://api.siliconflow.cn/v1",
      apiKey: "server-key",
    });
  });

  it("自定义模型默认要求用户临时 Key", () => {
    process.env.SILICONFLOW_API_KEY = "server-key";
    expect(() => resolveProvider({ id: "siliconflow", label: "SiliconFlow", model: "vendor/custom" }))
      .toThrow("使用自定义 SiliconFlow 模型时，请填写你自己的临时 API Key");
    expect(resolveProvider({ id: "siliconflow", label: "SiliconFlow", model: "vendor/custom", apiKey: "user-key" }))
      .toMatchObject({ model: "vendor/custom", apiKey: "user-key" });
  });

  it("管理员显式开启后自定义模型可以使用服务器 Key", () => {
    process.env.SILICONFLOW_API_KEY = "server-key";
    process.env.SILICONFLOW_ALLOW_CUSTOM_MODEL_WITH_SERVER_KEY = "true";
    expect(resolveProvider({ id: "siliconflow", label: "SiliconFlow", model: "vendor/custom" }))
      .toMatchObject({ model: "vendor/custom", apiKey: "server-key" });
  });

  it("其他内置供应商忽略客户端 model 和 Base URL", () => {
    expect(resolveProvider({ id: "deepseek", label: "DeepSeek", apiKey: "user-key", model: "evil/model", baseUrl: "https://evil.example" }))
      .toMatchObject({ model: "deepseek-chat", baseUrl: "https://api.deepseek.com" });
  });
});
