import Redis from "ioredis";

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_PER_MINUTE || 20);
const memoryCounters = new Map<string, { count: number; expiresAt: number }>();
let redis: Redis | null = null;

function memoryRateLimit(ip: string) {
  const now = Date.now();
  const entry = memoryCounters.get(ip);
  if (!entry || entry.expiresAt <= now) {
    memoryCounters.set(ip, { count: 1, expiresAt: now + WINDOW_SECONDS * 1000 });
    return { allowed: true, remaining: MAX_REQUESTS - 1 };
  }

  entry.count += 1;
  return {
    allowed: entry.count <= MAX_REQUESTS,
    remaining: Math.max(0, MAX_REQUESTS - entry.count),
  };
}

export async function rateLimit(ip: string) {
  if (!process.env.REDIS_URL) {
    return memoryRateLimit(ip);
  }

  try {
    redis ??= new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    if (redis.status === "wait") await redis.connect();
    const bucket = Math.floor(Date.now() / (WINDOW_SECONDS * 1000));
    const key = `rewrite-rate:${ip}:${bucket}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, WINDOW_SECONDS + 2);
    return {
      allowed: count <= MAX_REQUESTS,
      remaining: Math.max(0, MAX_REQUESTS - count),
    };
  } catch {
    return memoryRateLimit(ip);
  }
}
