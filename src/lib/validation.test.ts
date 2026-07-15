import { afterEach, describe, expect, it } from "vitest";
import { rewriteRequestSchema, validateCustomBaseUrl } from "./validation";

afterEach(() => {
  delete process.env.ALLOW_LOCAL_PROVIDER;
});

describe("rewriteRequestSchema", () => {
  it("accepts a valid multi-provider request", () => {
    const result = rewriteRequestSchema.safeParse({
      text: "今天下雨。",
      style: "psycho_noir",
      providers: [
        { id: "mock", label: "本地演示" },
        { id: "qwen", label: "通义千问", apiKey: "test" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty or oversized request", () => {
    expect(
      rewriteRequestSchema.safeParse({ text: "", style: "lyrical", providers: [] }).success,
    ).toBe(false);
    expect(
      rewriteRequestSchema.safeParse({
        text: "字".repeat(1001),
        style: "lyrical",
        providers: [{ id: "mock", label: "本地演示" }],
      }).success,
    ).toBe(false);
  });
});

describe("validateCustomBaseUrl", () => {
  it("accepts public https URLs", () => {
    expect(validateCustomBaseUrl("https://api.example.com/v1/"))
      .toBe("https://api.example.com/v1");
  });

  it("blocks private and insecure endpoints by default", () => {
    expect(() => validateCustomBaseUrl("http://api.example.com/v1")).toThrow("HTTPS");
    expect(() => validateCustomBaseUrl("https://127.0.0.1:9000/v1")).toThrow("私有网络");
    expect(() => validateCustomBaseUrl("https://192.168.1.2/v1")).toThrow("私有网络");
  });

  it("allows local development only when explicitly enabled", () => {
    process.env.ALLOW_LOCAL_PROVIDER = "true";
    expect(validateCustomBaseUrl("http://localhost:11434/v1"))
      .toBe("http://localhost:11434/v1");
  });
});
