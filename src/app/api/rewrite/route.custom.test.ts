import { afterEach, describe, expect, it, vi } from "vitest";
import { resetRateLimitForTests } from "@/lib/rate-limit";
import type { RewriteEvent } from "@/lib/types";

const safeResponseMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/safe-provider-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/safe-provider-fetch")>();
  return {
    ...actual,
    withSafeProviderResponse: safeResponseMock,
  };
});

import { POST } from "./route";

const valid = "热意停在皮肤上，沉闷而直接。焦躁跟着呼吸浮起，却没有得到新的理由。你不替天气安排立场，也不让感受冒充证据，只把此刻有限而清楚的事实留在原处。";

afterEach(() => {
  delete process.env.CUSTOM_PROVIDERS_ENABLED;
  safeResponseMock.mockReset();
  resetRateLimitForTests();
});

describe("POST /api/rewrite custom provider", () => {
  it("开启配置后合法 HTTPS 自定义请求进入安全请求层", async () => {
    process.env.CUSTOM_PROVIDERS_ENABLED = "true";
    safeResponseMock.mockImplementation(async (
      _url: string,
      _init: RequestInit,
      consume: (response: Response) => Promise<unknown>,
    ) => consume(new Response(JSON.stringify({
      choices: [{ message: { content: valid }, finish_reason: "stop" }],
    }), { headers: { "content-type": "application/json" } })));

    const response = await POST(new Request("http://localhost/api/rewrite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "天气很热。",
        style: "lyrical",
        providers: [{
          id: "custom-test",
          label: "测试线路",
          baseUrl: "https://api.example.com/v1",
          model: "test-model",
          apiKey: "test-key",
        }],
      }),
    }));
    expect(response.status).toBe(200);
    const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line) as RewriteEvent);
    expect(events[0]?.type).toBe("provider_start");
    expect(events.at(-1)?.type).toBe("provider_done");
    expect(events.slice(1, -1).every((event) => event.type === "provider_delta")).toBe(true);
    expect(safeResponseMock).toHaveBeenCalledTimes(1);
    expect(String(safeResponseMock.mock.calls[0][0])).toBe("https://api.example.com/v1/chat/completions");
  });
});
