import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type ResolvedHostAddress = { address: string; family: 4 | 6 };
export type HostResolver = (hostname: string) => Promise<ResolvedHostAddress[]>;

export class UnsafeProviderTargetError extends Error {
  constructor() {
    super("该自定义线路地址不符合安全要求");
    this.name = "UnsafeProviderTargetError";
  }
}

const MAX_PROVIDER_URL_LENGTH = 500;
const METADATA_HOSTNAMES = new Set([
  "metadata.google.internal",
  "metadata.aws.internal",
  "instance-data",
  "instance-data.ec2.internal",
]);

const RESTRICTED_IPV4: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

const LOCAL_IPV4: ReadonlyArray<readonly [string, number]> = [
  ["10.0.0.0", 8],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
];

function ipv4Value(address: string) {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return null;
  }
  return parts.reduce((value, part) => value * 256 + part, 0) >>> 0;
}

function inIpv4Subnet(address: number, network: string, prefix: number) {
  const networkValue = ipv4Value(network);
  if (networkValue === null) return false;
  const hostBits = 32 - prefix;
  const divisor = 2 ** hostBits;
  return Math.floor(address / divisor) === Math.floor(networkValue / divisor);
}

function ipv6Value(address: string) {
  let input = address.toLowerCase();
  if (input.includes("%")) return null;
  const ipv4Tail = input.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/u)?.[1];
  if (ipv4Tail) {
    const value = ipv4Value(ipv4Tail);
    if (value === null) return null;
    input = `${input.slice(0, -ipv4Tail.length)}${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`;
  }
  if ((input.match(/::/gu)?.length ?? 0) > 1) return null;
  const [leftRaw, rightRaw = ""] = input.split("::");
  const left = leftRaw ? leftRaw.split(":") : [];
  const right = rightRaw ? rightRaw.split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((input.includes("::") && missing < 1) || (!input.includes("::") && missing !== 0)) {
    return null;
  }
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/u.test(group))) {
    return null;
  }
  return groups.reduce(
    (value, group) => (value << BigInt(16)) | BigInt(`0x${group}`),
    BigInt(0),
  );
}

function inIpv6Subnet(address: bigint, network: bigint, prefix: number) {
  const shift = BigInt(128 - prefix);
  return address >> shift === network >> shift;
}

export function normalizeIpAddress(address: string) {
  if (isIP(address) === 4) {
    return address.split(".").map(Number).join(".");
  }
  const value = ipv6Value(address);
  return value === null ? null : value.toString(16).padStart(32, "0");
}

export function isRestrictedProviderAddress(address: string) {
  if (isIP(address) === 4) {
    const value = ipv4Value(address);
    return value === null || RESTRICTED_IPV4.some(([network, prefix]) => inIpv4Subnet(value, network, prefix));
  }
  if (isIP(address) !== 6) return true;
  const value = ipv6Value(address);
  if (value === null) return true;
  const embeddedPrefix = value >> BigInt(32);
  if (embeddedPrefix === BigInt(0) || embeddedPrefix === BigInt("0xffff")) {
    const embedded = Number(value & BigInt("0xffffffff"));
    if (RESTRICTED_IPV4.some(([network, prefix]) => inIpv4Subnet(embedded, network, prefix))) {
      return true;
    }
  }
  return (
    value === BigInt(0) ||
    value === BigInt(1) ||
    inIpv6Subnet(value, BigInt("0xfc00") << BigInt(112), 7) ||
    inIpv6Subnet(value, BigInt("0xfe80") << BigInt(112), 10) ||
    inIpv6Subnet(value, BigInt("0xff00") << BigInt(112), 8) ||
    inIpv6Subnet(value, BigInt("0x20010db8") << BigInt(96), 32)
  );
}

function isExplicitLocalAddress(address: string) {
  if (isIP(address) === 4) {
    const value = ipv4Value(address);
    return value !== null && LOCAL_IPV4.some(([network, prefix]) => inIpv4Subnet(value, network, prefix));
  }
  if (isIP(address) !== 6) return false;
  const value = ipv6Value(address);
  if (value === null) return false;
  if (
    value === BigInt(1) ||
    inIpv6Subnet(value, BigInt("0xfc00") << BigInt(112), 7) ||
    inIpv6Subnet(value, BigInt("0xfe80") << BigInt(112), 10)
  ) {
    return true;
  }
  const embeddedPrefix = value >> BigInt(32);
  if (
    embeddedPrefix === BigInt("0xffff") ||
    (embeddedPrefix === BigInt(0) && value > BigInt("0xffff"))
  ) {
    const embedded = Number(value & BigInt("0xffffffff"));
    return LOCAL_IPV4.some(([network, prefix]) => inIpv4Subnet(embedded, network, prefix));
  }
  return false;
}

function isBlockedAddress(address: string, allowLocal: boolean) {
  return (
    isMetadataAddress(address) ||
    (isRestrictedProviderAddress(address) && !(allowLocal && isExplicitLocalAddress(address)))
  );
}

function bareHostname(url: URL) {
  return url.hostname.replace(/^\[|\]$/gu, "").replace(/\.$/u, "").toLowerCase();
}

function isMetadataHostname(hostname: string) {
  return METADATA_HOSTNAMES.has(hostname) || hostname === "metadata" || hostname.startsWith("metadata.");
}

function isMetadataAddress(address: string) {
  return normalizeIpAddress(address) === normalizeIpAddress("169.254.169.254");
}

export function validateSafeProviderUrl(
  rawUrl: string,
  options: { allowLocal?: boolean } = {},
) {
  if (!rawUrl || rawUrl.length > MAX_PROVIDER_URL_LENGTH) {
    throw new UnsafeProviderTargetError();
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeProviderTargetError();
  }
  const allowLocal = options.allowLocal ?? process.env.ALLOW_LOCAL_PROVIDER === "true";
  if (url.protocol !== "https:" && !(allowLocal && url.protocol === "http:")) {
    throw new UnsafeProviderTargetError();
  }
  const hostname = bareHostname(url);
  if (!hostname || url.username || url.password || url.hash || isMetadataHostname(hostname)) {
    throw new UnsafeProviderTargetError();
  }
  const localHostname = hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local");
  if (!allowLocal && localHostname) throw new UnsafeProviderTargetError();
  if (isIP(hostname) && isBlockedAddress(hostname, allowLocal)) {
    throw new UnsafeProviderTargetError();
  }
  url.pathname = url.pathname.replace(/\/$/u, "");
  return url;
}

export const defaultHostResolver: HostResolver = async (hostname) => {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  return addresses.map(({ address, family }) => ({ address, family: family as 4 | 6 }));
};

export async function resolveSafeProviderUrl(
  rawUrl: string,
  options: { allowLocal?: boolean; resolver?: HostResolver } = {},
) {
  const allowLocal = options.allowLocal ?? process.env.ALLOW_LOCAL_PROVIDER === "true";
  const url = validateSafeProviderUrl(rawUrl, { allowLocal });
  const hostname = bareHostname(url);
  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily as 4 | 6 }]
    : await (options.resolver ?? defaultHostResolver)(hostname);
  if (
    addresses.length === 0 ||
    addresses.some(({ address, family }) =>
      isIP(address) !== family ||
      isBlockedAddress(address, allowLocal) ||
      (url.protocol === "http:" && !isExplicitLocalAddress(address)),
    )
  ) {
    throw new UnsafeProviderTargetError();
  }
  return { url, hostname, addresses };
}
