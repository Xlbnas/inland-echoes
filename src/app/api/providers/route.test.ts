import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

afterEach(() => {
  delete process.env.CUSTOM_PROVIDERS_ENABLED;
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
});
