import { afterEach, describe, expect, it } from "vitest";
import {
  calculateRateLimitCost,
  consumeRedisRateLimit,
  getClientIdentifier,
  INCRBY_WITH_TTL,
  MemoryRateLimiter,
  parseForwardedClientIp,
  resetRateLimitForTests,
} from "./rate-limit";

afterEach(() => {
  delete process.env.TRUST_PROXY;
  resetRateLimitForTests();
});

describe("trusted proxy identity", () => {
  it("不信任代理时不同伪造头仍使用同一标识", () => {
    expect(getClientIdentifier(new Headers({ "x-forwarded-for": "1.1.1.1" })))
      .toBe(getClientIdentifier(new Headers({ "x-forwarded-for": "8.8.8.8" })));
  });

  it("只在信任代理时严格解析合法 IP", () => {
    process.env.TRUST_PROXY = "true";
    expect(parseForwardedClientIp("1.1.1.1, 8.8.8.8")).toBe("1.1.1.1");
    expect(getClientIdentifier(new Headers({ "x-forwarded-for": "1.1.1.1" })))
      .toMatch(/^trusted-client-[a-f0-9]{32}$/u);
  });

  it("非法或超长代理头只进入固定安全桶", () => {
    process.env.TRUST_PROXY = "true";
    const invalid = getClientIdentifier(new Headers({ "x-forwarded-for": "not-an-ip" }));
    const oversized = getClientIdentifier(new Headers({ "x-forwarded-for": "1".repeat(513) }));
    expect(invalid).toBe("invalid-proxy-client");
    expect(oversized).toBe("invalid-proxy-client");
  });
});

describe("weighted rate limiting", () => {
  it("多供应商和长文本消耗更多单位", () => {
    expect(calculateRateLimitCost(1, 100, false)).toBe(3);
    expect(calculateRateLimitCost(3, 600, true)).toBe(10);
    expect(calculateRateLimitCost(1, 600, false))
      .toBeGreaterThan(calculateRateLimitCost(1, 100, false));
  });

  it("内存实现保持剩余单位非负并拒绝非法 cost", () => {
    const limiter = new MemoryRateLimiter(5);
    expect(limiter.consume("client", 3, 0)).toMatchObject({ allowed: true, remaining: 2 });
    expect(limiter.consume("client", 3, 1)).toMatchObject({ allowed: false, remaining: 0 });
    expect(() => limiter.consume("client", 0)).toThrow("positive integer");
    expect(() => limiter.consume("client", 1.5)).toThrow("positive integer");
  });

  it("惰性清理过期项并限制最大 key 数", () => {
    const limiter = new MemoryRateLimiter(60, 60, 2, 2);
    limiter.consume("expired", 1, 0);
    limiter.consume("current", 1, 61_000);
    expect(limiter.size).toBe(1);
    limiter.consume("next", 1, 61_001);
    limiter.consume("newest", 1, 61_002);
    expect(limiter.size).toBeLessThanOrEqual(2);
  });

  it("Redis 使用原子 INCRBY+TTL 且与内存语义一致", async () => {
    let count = 0;
    const client = {
      async eval(script: string, _keys: number, _key: string, cost: string) {
        expect(script).toContain("INCRBY");
        expect(script).toContain("EXPIRE");
        count += Number(cost);
        return [count, 62];
      },
    };
    const memory = new MemoryRateLimiter(5);
    const memoryFirst = memory.consume("client", 3, 0);
    const redisFirst = await consumeRedisRateLimit(client, "key", 3, 5);
    const memorySecond = memory.consume("client", 3, 1);
    const redisSecond = await consumeRedisRateLimit(client, "key", 3, 5);
    expect(redisFirst).toMatchObject({ allowed: memoryFirst.allowed, remaining: memoryFirst.remaining });
    expect(redisSecond).toMatchObject({ allowed: memorySecond.allowed, remaining: memorySecond.remaining });
    expect(INCRBY_WITH_TTL).toContain("INCRBY");
  });
});
