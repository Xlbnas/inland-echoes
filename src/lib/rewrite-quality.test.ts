import { describe, expect, it } from "vitest";
import { validateRewriteQuality } from "./rewrite-quality";
import type { CheckResult } from "./checks-shared";

const check: CheckResult = { skill: "intuition", skillLevel: 3, difficulty: 10, dice: [2, 2], total: 7, margin: -3, outcome: "failure" };
const valid = `【直觉：未通过】这阵热意像一封没有署名的警告，你差一点就相信整个下午都在针对你。\n\n窗外没有阴谋，只有晒白的墙和迟迟不动的空气。焦躁是真的，可它只是身体对闷热的回答。\n\n【逻辑】天气很热，并不等于世界怀有敌意。把预感收回来，掌心残留的汗仍提醒你刚才确实慌过。`;

describe("validateRewriteQuality", () => {
  it("accepts structured failure with correction and narrative", () => expect(validateRewriteQuality("今天天气好热，让我的内心焦躁不安", valid, check).valid).toBe(true));
  it("reports deterministic structural violations", () => {
    const result = validateRewriteQuality("短句", "【逻辑：通过】短。", check, true);
    expect(result.violations.map((item) => item.code)).toEqual(expect.arrayContaining(["too_short", "truncated", "missing_counter_channel", "missing_narrative", "missing_selected_channel", "wrong_outcome_label", "failure_not_expressed"]));
  });
});
