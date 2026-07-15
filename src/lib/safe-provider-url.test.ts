import { afterEach, describe, expect, it, vi } from "vitest";
import { Response as UndiciResponse } from "undici";
import {
  buildProviderCompletionUrl,
  createPinnedLookup,
  SAFE_PROVIDER_LIMITS,
  withSafeProviderResponse,
} from "./safe-provider-fetch";
import {
  isRestrictedProviderAddress,
  resolveSafeProviderUrl,
  validateSafeProviderUrl,
  type HostResolver,
} from "./safe-provider-url";

afterEach(() => {
  delete process.env.ALLOW_LOCAL_PROVIDER;
});

const publicResolver: HostResolver = async () => [
  { address: "93.184.216.34", family: 4 },
  { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
];

describe("safe provider URL", () => {
  it.each([
    "https://localhost/v1",
    "https://api.local/v1",
    "https://127.0.0.1/v1",
    "https://169.254.169.254/latest/meta-data",
    "https://10.0.0.1/v1",
    "https://172.16.0.1/v1",
    "https://192.168.0.1/v1",
    "https://[::1]/v1",
    "https://[fc00::1]/v1",
    "https://[fe80::1]/v1",
    "https://[::ffff:127.0.0.1]/v1",
    "https://metadata.google.internal/v1",
    "https://user:secret@example.com/v1",
    "https://example.com/v1#fragment",
    "ftp://example.com/v1",
  ])("默认拒绝危险目标 %s", (url) => {
    expect(() => validateSafeProviderUrl(url)).toThrow("安全要求");
  });

  it("允许合法公网 HTTPS 并保留兼容路径", async () => {
    const resolved = await resolveSafeProviderUrl("https://api.example.com/v1/", {
      resolver: publicResolver,
    });
    expect(resolved.url.toString()).toBe("https://api.example.com/v1");
    expect(buildProviderCompletionUrl(resolved.url.toString()))
      .toBe("https://api.example.com/v1/chat/completions");
  });

  it("ALLOW_LOCAL_PROVIDER 只放行明确私网，不放行 metadata 或其他保留地址", () => {
    process.env.ALLOW_LOCAL_PROVIDER = "true";
    expect(validateSafeProviderUrl("http://localhost:11434/v1").toString())
      .toBe("http://localhost:11434/v1");
    expect(validateSafeProviderUrl("http://192.168.1.8:11434/v1").toString())
      .toBe("http://192.168.1.8:11434/v1");
    expect(() => validateSafeProviderUrl("http://169.254.169.254/v1")).toThrow("安全要求");
    expect(() => validateSafeProviderUrl("http://224.0.0.1/v1")).toThrow("安全要求");
  });

  it("即使开启本地模式，HTTP 域名也必须解析到明确私网", async () => {
    process.env.ALLOW_LOCAL_PROVIDER = "true";
    await expect(resolveSafeProviderUrl("http://public.example/v1", {
      resolver: publicResolver,
    })).rejects.toThrow("安全要求");
    await expect(resolveSafeProviderUrl("http://ollama.local/v1", {
      resolver: async () => [{ address: "192.168.1.8", family: 4 }],
    })).resolves.toMatchObject({ hostname: "ollama.local" });
  });

  it("拒绝解析到私网或公私混合地址的域名", async () => {
    await expect(resolveSafeProviderUrl("https://private.example/v1", {
      resolver: async () => [{ address: "10.0.0.8", family: 4 }],
    })).rejects.toThrow("安全要求");
    await expect(resolveSafeProviderUrl("https://mixed.example/v1", {
      resolver: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "192.168.1.8", family: 4 },
      ],
    })).rejects.toThrow("安全要求");
  });

  it("解析器通过依赖注入工作且不访问真实互联网", async () => {
    const resolver = vi.fn(publicResolver);
    await expect(resolveSafeProviderUrl("https://safe.example/v1", { resolver }))
      .resolves.toMatchObject({ hostname: "safe.example" });
    expect(resolver).toHaveBeenCalledWith("safe.example");
  });

  it("连接 lookup 只返回预先验证的地址", async () => {
    const lookup = createPinnedLookup([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);
    const result = await new Promise<{ address?: string; family?: number }>((resolve, reject) => {
      lookup("attacker-controlled.example", { family: 4 }, (error, address, family) => {
        if (error) reject(error);
        else resolve({ address: typeof address === "string" ? address : undefined, family });
      });
    });
    expect(result).toEqual({ address: "93.184.216.34", family: 4 });
  });

  it("拒绝自定义线路重定向且固定设置 manual", async () => {
    const fetcher = vi.fn(async (_url, init) => {
      expect(init?.redirect).toBe("manual");
      expect(init?.dispatcher).toBeDefined();
      return new UndiciResponse(null, { status: 302, headers: { location: "https://other.example" } });
    });
    await expect(withSafeProviderResponse(
      "https://api.example.com/v1/chat/completions",
      { method: "POST", body: "{}" },
      async () => "unreachable",
      { resolver: publicResolver, fetcher },
    )).rejects.toThrow("安全要求");
  });

  it("覆盖所有要求的保留网段并设置响应限制", () => {
    expect([
      "0.0.0.1", "100.64.0.1", "192.0.2.1", "198.18.0.1",
      "198.51.100.1", "203.0.113.1", "224.0.0.1", "255.255.255.255",
      "2001:db8::1", "ff00::1",
    ].every(isRestrictedProviderAddress)).toBe(true);
    expect(SAFE_PROVIDER_LIMITS).toMatchObject({
      maximumResponseBytes: 8 * 1024 * 1024,
      maximumSseFrameBytes: 256 * 1024,
    });
  });
});
