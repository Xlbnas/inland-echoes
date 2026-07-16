import {
  calculateRateLimitCost,
  consumeRateLimit,
  getClientIdentifier,
} from "@/lib/rate-limit";
import { rollCheck } from "@/lib/checks";
import {
  ProviderConfigurationError,
  getProviderResultLabel,
  validateProviderRequests,
} from "@/lib/provider-config";
import { publicProviderError, streamProviderRewrite } from "@/lib/provider-stream";
import type { RewriteEvent } from "@/lib/types";
import { rewriteRequestSchema } from "@/lib/validation";
import { UnsafeProviderTargetError } from "@/lib/safe-provider-url";
import { ZodError } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = rewriteRequestSchema.parse(await request.json());
    validateProviderRequests(payload.providers);
    const cost = calculateRateLimitCost(
      payload.providers.length,
      Array.from(payload.text).length,
      payload.check.enabled,
    );
    const limit = await consumeRateLimit(getClientIdentifier(request.headers), cost);
    if (!limit.allowed) {
      return Response.json(
        { error: "请求过于频繁，请稍后再试" },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
      );
    }
    const checkResult = payload.check.enabled ? rollCheck(payload.check) : undefined;
    const encoder = new TextEncoder();
    const abortController = new AbortController();
    request.signal.addEventListener("abort", () => abortController.abort(), {
      once: true,
    });

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;
        const send = (event: RewriteEvent) => {
          if (closed) return;
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };

        if (checkResult) {
          send({ type: "check_resolved", result: checkResult });
        }

        await Promise.all(
          payload.providers.map(async (provider) => {
            send({
              type: "provider_start",
              providerId: provider.id,
              label: getProviderResultLabel(provider),
            });
            try {
              for await (const delta of streamProviderRewrite(
                provider,
                payload.text,
                payload.style,
                abortController.signal,
                checkResult,
              )) {
                send({
                  type: "provider_delta",
                  providerId: provider.id,
                  delta,
                });
              }
              send({ type: "provider_done", providerId: provider.id });
            } catch (error) {
              const safe = publicProviderError(error);
              send({
                type: "provider_error",
                providerId: provider.id,
                message: safe.message,
                code: safe.code,
              });
            }
          }),
        );

        closed = true;
        controller.close();
      },
      cancel() {
        abortController.abort();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-RateLimit-Remaining": String(limit.remaining),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof ProviderConfigurationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof UnsafeProviderTargetError) {
      return Response.json(
        { error: error.message, code: "unsafe_provider_target" },
        { status: 400 },
      );
    }
    if (error instanceof ZodError) {
      return Response.json(
        { error: error.issues[0]?.message || "请求参数无效" },
        { status: 400 },
      );
    }
    return Response.json({ error: "无法解析请求" }, { status: 400 });
  }
}
