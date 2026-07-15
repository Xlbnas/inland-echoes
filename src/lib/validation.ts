import { isIP } from "node:net";
import { z } from "zod";
import { STYLE_IDS } from "./types";

export const providerRequestSchema = z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(40),
  apiKey: z.string().trim().max(512).optional(),
  baseUrl: z.string().trim().max(500).optional(),
  model: z.string().trim().max(120).optional(),
});

export const rewriteRequestSchema = z.object({
  text: z.string().trim().min(1, "请输入需要改写的文本").max(1000, "输入不能超过 1000 字"),
  style: z.enum(STYLE_IDS),
  providers: z.array(providerRequestSchema).min(1).max(3, "一次最多比较三个模型"),
});

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }

  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

export function validateCustomBaseUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("自定义 Base URL 格式无效");
  }

  const allowLocal = process.env.ALLOW_LOCAL_PROVIDER === "true";
  if (url.protocol !== "https:" && !(allowLocal && url.protocol === "http:")) {
    throw new Error("自定义 Base URL 必须使用 HTTPS");
  }

  const hostname = url.hostname.toLowerCase();
  const localName =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local");
  const privateAddress =
    (isIP(hostname) === 4 && isPrivateIpv4(hostname)) ||
    (isIP(hostname) === 6 && (hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd")));

  if (!allowLocal && (localName || privateAddress)) {
    throw new Error("自定义 Base URL 不能指向本机或私有网络");
  }

  url.pathname = url.pathname.replace(/\/$/, "");
  return url.toString().replace(/\/$/, "");
}
