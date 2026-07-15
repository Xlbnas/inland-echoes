import { describe, expect, it } from "vitest";
import { getCheckSkill, type CheckResult } from "@/lib/checks-shared";
import type { RewriteEvent } from "@/lib/types";
import { POST } from "./route";

let requestIndex = 0;

function makeRequest(body: unknown) {
  requestIndex += 1;
  return new Request("http://localhost/api/rewrite", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `198.51.100.${requestIndex}`,
    },
    body: JSON.stringify(body),
  });
}

async function readEvents(response: Response) {
  const text = await response.text();
  return text.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as RewriteEvent);
}

const baseRequest = {
  text: "会议结束了，但没有人真正得到答案。",
  style: "inner_monologue",
  providers: [{ id: "mock", label: "本地演示" }],
};

describe("POST /api/rewrite", () => {
  it("兼容不含 check 的旧请求且不发送判定事件", async () => {
    const response = await POST(makeRequest(baseRequest));
    expect(response.status).toBe(200);
    const events = await readEvents(response);
    expect(events.some((event) => event.type === "check_resolved")).toBe(false);
    expect(events[0]?.type).toBe("provider_start");
    expect(events.at(-1)?.type).toBe("provider_done");
  });

  it.each([
    ["频道", { enabled: true, skill: "memory", skillLevel: 3, difficulty: 10 }],
    ["等级", { enabled: true, skill: "logic", skillLevel: 9, difficulty: 10 }],
    ["难度", { enabled: true, skill: "logic", skillLevel: 3, difficulty: 11 }],
  ])("拒绝非法%s", async (_label, check) => {
    const response = await POST(makeRequest({ ...baseRequest, check }));
    expect(response.status).toBe(400);
  });

  it("拒绝客户端伪造骰点、合计、差值和结果", async () => {
    const response = await POST(makeRequest({
      ...baseRequest,
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
    }));
    expect(response.status).toBe(400);
  });

  it("先发送服务端判定，再开始供应商流", async () => {
    const response = await POST(makeRequest({
      ...baseRequest,
      check: { enabled: true, skill: "empathy", skillLevel: 4, difficulty: 12 },
    }));
    const events = await readEvents(response);
    expect(events[0]?.type).toBe("check_resolved");
    expect(events[1]?.type).toBe("provider_start");

    const result = (events[0] as { type: "check_resolved"; result: CheckResult }).result;
    expect(result.dice).toHaveLength(2);
    expect(result.dice.every((die) => Number.isInteger(die) && die >= 1 && die <= 6)).toBe(true);
    expect(result.total).toBe(result.dice[0] + result.dice[1] + result.skillLevel);

    const output = events
      .filter((event): event is Extract<RewriteEvent, { type: "provider_delta" }> => event.type === "provider_delta")
      .map((event) => event.delta)
      .join("");
    expect(output).toContain(getCheckSkill(result.skill).mock[result.outcome]);
  });

  it("多供应商请求只产生一个共享判定事件", async () => {
    const response = await POST(makeRequest({
      ...baseRequest,
      providers: [
        { id: "mock", label: "本地演示甲" },
        { id: "mock", label: "本地演示乙" },
      ],
      check: { enabled: true, skill: "reaction", skillLevel: 2, difficulty: 10 },
    }));
    const events = await readEvents(response);
    expect(events.filter((event) => event.type === "check_resolved")).toHaveLength(1);
    expect(events.filter((event) => event.type === "provider_start")).toHaveLength(2);
  });
});
