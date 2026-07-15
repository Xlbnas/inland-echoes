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
    if (result.success) expect(result.data.check.enabled).toBe(false);
  });

  it("接受合法判定并拒绝非法频道、等级和难度", () => {
    const base = {
      text: "今天下雨。",
      style: "psycho_noir",
      providers: [{ id: "mock", label: "本地演示" }],
    };
    expect(rewriteRequestSchema.safeParse({
      ...base,
      check: { enabled: true, skill: "empathy", skillLevel: 4, difficulty: 12 },
    }).success).toBe(true);
    expect(rewriteRequestSchema.safeParse({
      ...base,
      check: { enabled: true, skill: "memory", skillLevel: 4, difficulty: 12 },
    }).success).toBe(false);
    expect(rewriteRequestSchema.safeParse({
      ...base,
      check: { enabled: true, skill: "logic", skillLevel: 7, difficulty: 12 },
    }).success).toBe(false);
    expect(rewriteRequestSchema.safeParse({
      ...base,
      check: { enabled: true, skill: "logic", skillLevel: 3, difficulty: 11 },
    }).success).toBe(false);
  });

  it("拒绝客户端伪造骰点和结果字段", () => {
    const result = rewriteRequestSchema.safeParse({
      text: "今天下雨。",
      style: "psycho_noir",
      providers: [{ id: "mock", label: "本地演示" }],
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
    });
    expect(result.success).toBe(false);
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
