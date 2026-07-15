import { createHash } from "node:crypto";
import { isIP } from "node:net";
import Redis from "ioredis";
import { normalizeIpAddress } from "./safe-provider-url";

const WINDOW_SECONDS = 60;
const DEFAULT_MAX_UNITS = 60;
const DEFAULT_MAX_MEMORY_KEYS = 10_000;
const DEFAULT_CLEANUP_INTERVAL = 100;

type MemoryEntry = {
  count: number;
  expiresAt: number;
  lastSeenAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
};

export function parseForwardedClientIp(value: string | null) {
  if (!value || value.length > 512) return null;
  const parts = value.split(",").map((part) => part.trim());
  if (parts.length === 0 || parts.length > 20 || parts.some((part) => !part || isIP(part) === 0)) {
    return null;
  }
  if (parts.some((part) => normalizeIpAddress(part) === null)) return null;
  return normalizeIpAddress(parts[0]);
}

export function getClientIdentifier(headers: Headers) {
  if (process.env.TRUST_PROXY !== "true") return "untrusted-direct-client";
  const forwarded = headers.get("x-forwarded-for");
  const realIp = headers.get("x-real-ip");
  const normalized = forwarded
    ? parseForwardedClientIp(forwarded)
    : parseForwardedClientIp(realIp);
  if (!normalized) return forwarded || realIp ? "invalid-proxy-client" : "missing-proxy-client";
  const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 32);
  return `trusted-client-${digest}`;
}

export function calculateRateLimitCost(
  providerCount: number,
  textLength: number,
  checkEnabled: boolean,
) {
  const providerCost = providerCount * 2;
  const lengthCost = textLength <= 200 ? 1 : textLength <= 500 ? 2 : 3;
  return providerCost + lengthCost + (checkEnabled ? 1 : 0);
}

function requirePositiveCost(cost: number) {
  if (!Number.isInteger(cost) || cost <= 0) {
    throw new RangeError("rate limit cost must be a positive integer");
  }
}

export class MemoryRateLimiter {
  private readonly counters = new Map<string, MemoryEntry>();
  private requestsSinceCleanup = 0;

  constructor(
    private readonly maxUnits: number,
    private readonly windowSeconds = WINDOW_SECONDS,
    private readonly maxKeys = DEFAULT_MAX_MEMORY_KEYS,
    private readonly cleanupInterval = DEFAULT_CLEANUP_INTERVAL,
  ) {}

  get size() {
    return this.counters.size;
  }

  private cleanup(now: number) {
    for (const [identifier, entry] of this.counters) {
      if (entry.expiresAt <= now) this.counters.delete(identifier);
    }
    if (this.counters.size < this.maxKeys) return;
    const oldest = [...this.counters.entries()]
      .sort((left, right) => left[1].lastSeenAt - right[1].lastSeenAt)
      .slice(0, this.counters.size - this.maxKeys + 1);
    oldest.forEach(([identifier]) => this.counters.delete(identifier));
  }

  consume(identifier: string, cost: number, now = Date.now()): RateLimitResult {
    requirePositiveCost(cost);
    this.requestsSinceCleanup += 1;
    if (this.requestsSinceCleanup >= this.cleanupInterval || this.counters.size >= this.maxKeys) {
      this.cleanup(now);
      this.requestsSinceCleanup = 0;
    }
    const previous = this.counters.get(identifier);
    const entry = !previous || previous.expiresAt <= now
      ? { count: cost, expiresAt: now + this.windowSeconds * 1000, lastSeenAt: now }
      : { ...previous, count: previous.count + cost, lastSeenAt: now };
    this.counters.set(identifier, entry);
    return {
      allowed: entry.count <= this.maxUnits,
      remaining: Math.max(0, this.maxUnits - entry.count),
      retryAfter: Math.max(1, Math.ceil((entry.expiresAt - now) / 1000)),
    };
  }
}

export const INCRBY_WITH_TTL = `
local count = redis.call("INCRBY", KEYS[1], ARGV[1])
if count == tonumber(ARGV[1]) then
  redis.call("EXPIRE", KEYS[1], ARGV[2])
end
local ttl = redis.call("TTL", KEYS[1])
return {count, ttl}
`;

let redis: Redis | null = null;
let memoryLimiter: MemoryRateLimiter | null = null;
let memoryLimit = 0;

type RedisRateClient = {
  eval(
    script: string,
    numberOfKeys: number,
    key: string,
    cost: string,
    ttl: string,
  ): Promise<unknown>;
};

export async function consumeRedisRateLimit(
  client: RedisRateClient,
  key: string,
  cost: number,
  maxUnits: number,
) {
  requirePositiveCost(cost);
  const result = await client.eval(
    INCRBY_WITH_TTL,
    1,
    key,
    String(cost),
    String(WINDOW_SECONDS + 2),
  ) as [number, number];
  const count = Number(result[0]);
  const ttl = Number(result[1]);
  return {
    allowed: count <= maxUnits,
    remaining: Math.max(0, maxUnits - count),
    retryAfter: Math.max(1, ttl > 0 ? ttl : WINDOW_SECONDS),
  };
}

function configuredMaxUnits() {
  const value = Number(process.env.RATE_LIMIT_UNITS_PER_MINUTE || DEFAULT_MAX_UNITS);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_MAX_UNITS;
}

function memoryRateLimit(identifier: string, cost: number, maxUnits: number) {
  if (!memoryLimiter || memoryLimit !== maxUnits) {
    memoryLimiter = new MemoryRateLimiter(maxUnits);
    memoryLimit = maxUnits;
  }
  return memoryLimiter.consume(identifier, cost);
}

export async function consumeRateLimit(identifier: string, cost: number) {
  requirePositiveCost(cost);
  const maxUnits = configuredMaxUnits();
  if (!process.env.REDIS_URL) return memoryRateLimit(identifier, cost, maxUnits);

  try {
    redis ??= new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    if (redis.status === "wait") await redis.connect();
    const bucket = Math.floor(Date.now() / (WINDOW_SECONDS * 1000));
    const key = `rewrite-rate:${identifier}:${bucket}`;
    return await consumeRedisRateLimit(redis, key, cost, maxUnits);
  } catch {
    return memoryRateLimit(identifier, cost, maxUnits);
  }
}

export function resetRateLimitForTests() {
  memoryLimiter = null;
  memoryLimit = 0;
  redis?.disconnect();
  redis = null;
}
