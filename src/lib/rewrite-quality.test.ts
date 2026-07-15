import { describe, expect, it } from "vitest";
import { validateRewriteQuality } from "./rewrite-quality";
import type { CheckResult } from "./checks-shared";

const check: CheckResult = {
  skill: "intuition",
  skillLevel: 3,
  difficulty: 10,
  dice: [2, 2],
  total: 7,
  margin: -3,
  outcome: "failure",
};
const checkedValid = `【直觉：未通过】这阵热意像一封没有署名的警告，你差一点就相信整个下午都在针对你。

窗外没有阴谋，只有晒白的墙和迟迟不动的空气。焦躁是真的，可它只是身体对闷热的回答。

【逻辑】天气很热，并不等于世界怀有敌意。把预感收回来，掌心残留的汗仍提醒你刚才确实慌过。`;
const uncheckedInner = `【共情】先承认那阵焦躁，它确实压在呼吸上，却没有替现实说话。
【直觉】别急着给热意安排阴谋，身体只是在发出自己的回声。

空气仍旧沉闷，事实也仍旧有限。你把多余的猜测放回心里，只留下可以确认的感受。`;
const uncheckedNarrative = "热意停在皮肤上，沉闷而直接。焦躁跟着呼吸浮起，却没有得到新的理由。你不替天气安排立场，也不让感受冒充证据，只把此刻有限而清楚的事实留在原处。";

describe("validateRewriteQuality", () => {
  it("开启判定时继续接受带纠偏的严格结构", () => {
    expect(validateRewriteQuality(
      "今天天气好热，让我的内心焦躁不安",
      checkedValid,
      "inner_monologue",
      check,
    ).valid).toBe(true);
  });

  it("开启判定时报告稳定的结构违规", () => {
    const result = validateRewriteQuality(
      "短句",
      "【逻辑：通过】短。",
      "inner_monologue",
      check,
      true,
    );
    expect(result.violations.map((item) => item.code)).toEqual(expect.arrayContaining([
      "too_short",
      "truncated",
      "missing_counter_channel",
      "missing_narrative",
      "missing_selected_channel",
      "wrong_outcome_label",
      "failure_not_expressed",
    ]));
  });

  it("关闭判定的内心风格要求至少两个无 outcome 频道", () => {
    expect(validateRewriteQuality("热。", uncheckedInner, "inner_monologue").valid).toBe(true);
    const result = validateRewriteQuality(
      "热。",
      uncheckedInner.replace("【直觉】", "【共情】"),
      "inner_monologue",
    );
    expect(result.violations.map((item) => item.code)).toContain("missing_counter_channel");
  });

  it.each(["psycho_noir", "dark_humor", "lyrical"] as const)(
    "关闭判定的 %s 风格无需频道也可通过",
    (style) => expect(validateRewriteQuality("热。", uncheckedNarrative, style).valid).toBe(true),
  );

  it("关闭判定时拒绝结果文字和未知频道，但不触发判定专属违规", () => {
    const result = validateRewriteQuality(
      "热。",
      `【系统：未通过】${uncheckedNarrative}`,
      "psycho_noir",
    );
    const codes = result.violations.map((item) => item.code);
    expect(codes).toEqual(expect.arrayContaining(["unexpected_outcome_label", "unknown_channel"]));
    expect(codes).not.toEqual(expect.arrayContaining([
      "missing_selected_channel",
      "wrong_outcome_label",
      "failure_not_expressed",
    ]));
  });
});
