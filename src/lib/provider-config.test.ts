import { afterEach, describe, expect, it } from "vitest";
import {
  getProviderCapabilities,
  resolveProvider,
} from "./provider-config";

afterEach(() => {
  delete process.env.CUSTOM_PROVIDERS_ENABLED;
  delete process.env.ALLOW_LOCAL_PROVIDER;
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
});
