import { Agent, fetch as undiciFetch } from "undici";
import type { LookupAddress, LookupOptions } from "node:dns";
import {
  resolveSafeProviderUrl,
  type HostResolver,
  type ResolvedHostAddress,
  UnsafeProviderTargetError,
} from "./safe-provider-url";

export const SAFE_PROVIDER_LIMITS = {
  headersTimeoutMs: 15_000,
  bodyTimeoutMs: 30_000,
  maximumResponseBytes: 8 * 1024 * 1024,
  maximumSseFrameBytes: 256 * 1024,
  maximumOutputBytes: 4 * 1024 * 1024,
} as const;

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

type SafeFetch = (
  url: string | URL,
  init: Parameters<typeof undiciFetch>[1],
) => ReturnType<typeof undiciFetch>;

export function createPinnedLookup(addresses: ResolvedHostAddress[]) {
  return (
    _hostname: string,
    options: LookupOptions,
    callback: LookupCallback,
  ) => {
    const requestedFamily = options.family === "IPv4"
      ? 4
      : options.family === "IPv6"
        ? 6
        : options.family;
    const eligible = requestedFamily === 4 || requestedFamily === 6
      ? addresses.filter((item) => item.family === requestedFamily)
      : addresses;
    if (eligible.length === 0) {
      const error = Object.assign(new Error("No validated address for requested family"), {
        code: "ENOTFOUND",
      });
      callback(error, "");
      return;
    }
    if (options.all) callback(null, eligible);
    else callback(null, eligible[0].address, eligible[0].family);
  };
}

export function buildProviderCompletionUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/$/u, "")}/chat/completions`;
  return url.toString();
}

export async function withSafeProviderResponse<T>(
  rawUrl: string,
  init: RequestInit,
  consume: (response: Response) => Promise<T>,
  options: { resolver?: HostResolver; fetcher?: SafeFetch } = {},
) {
  let resolved;
  try {
    resolved = await resolveSafeProviderUrl(rawUrl, { resolver: options.resolver });
  } catch {
    throw new UnsafeProviderTargetError();
  }
  const dispatcher = new Agent({
    connect: { lookup: createPinnedLookup(resolved.addresses) },
    headersTimeout: SAFE_PROVIDER_LIMITS.headersTimeoutMs,
    bodyTimeout: SAFE_PROVIDER_LIMITS.bodyTimeoutMs,
    maxResponseSize: SAFE_PROVIDER_LIMITS.maximumResponseBytes,
    pipelining: 1,
  });
  try {
    if (init.body !== undefined && init.body !== null && typeof init.body !== "string") {
      throw new UnsafeProviderTargetError();
    }
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    const response = await (options.fetcher ?? undiciFetch)(resolved.url, {
      method: init.method,
      headers,
      body: init.body ?? undefined,
      signal: init.signal,
      redirect: "manual",
      dispatcher,
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new UnsafeProviderTargetError();
    }
    return await consume(response as unknown as Response);
  } finally {
    await dispatcher.close();
  }
}
