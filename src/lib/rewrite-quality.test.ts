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
const checkedValid = `【直觉：未通过】这阵热意仿佛一份警告，你差一点就认定整个下午都在针对你。

事实只说明天气很热，也说明内心焦躁；它没有给出恶意，更没有替那份预感作证。焦躁是真的，结论却是投射。

【逻辑】天气很热，并不等于世界怀有敌意。把多余的判断收回来，刚才那阵慌乱仍可以被承认。`;
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

  it("短原文可以完整出现而不被判为 source_copy", () => {
    const result = validateRewriteQuality(
      "我害怕。",
      "【共情】我害怕。这份感受可以被承认，却不能替现实宣布结论。\n【逻辑】原文没有给出原因，也没有给出危险。你把恐惧留在心里，同时收回那些没有证据的答案。",
      "inner_monologue",
    );
    expect(result.violations.map((item) => item.code)).not.toContain("source_copy");
  });

  it("长原文近乎原样重复才触发 source_copy", () => {
    const source = "周一上午我把报告交给主管。主管确认收到，但没有说明何时回复。我在登记表上写下时间，然后回到自己的座位继续工作。";
    const result = validateRewriteQuality(source, source, "lyrical");
    expect(result.violations.map((item) => item.code)).toContain("source_copy");
  });

  it("识别新增和修改数字、时间与引语", () => {
    const source = "9:20，他说“等20分钟”。";
    const output = "9:30，他说“等半小时”。随后又记录了42这个数字。这里保留了一段足够长的叙事加工，但事实已经发生变化，因此必须被确定性校验指出。";
    const codes = validateRewriteQuality(source, output, "lyrical").violations.map((item) => item.code);
    expect(codes).toEqual(expect.arrayContaining(["unsupported_time", "unsupported_number", "changed_number", "unsupported_quote"]));
  });

  it("对原文字词的短修辞引号不算新增明确引用", () => {
    const output = "【共情】这个“热”字可以承载感受，却没有提供新的场景。\n【逻辑】事实仍然只有热，不能把修辞当成引用。\n\n叙述承认情绪，同时保持现实边界，没有替原文补充具体原因。";
    expect(validateRewriteQuality("热。", output, "inner_monologue").violations.map((item) => item.code))
      .not.toContain("unsupported_quote");
  });

  it("极短文本新增多个具体环境名词会标记风险", () => {
    const output = "【直觉：未通过】热浪仿佛警告。\n\n窗户关着，空气没有流动，这些细节都不在原文。\n\n【逻辑】现实只证明原文写了热，应当收回具体场景。";
    expect(validateRewriteQuality("热。", output, "inner_monologue", check).violations.map((item) => item.code))
      .toContain("possible_concrete_detail_invention");
  });

  it("两次否定但没有误读后的纠偏仍然失败", () => {
    const output = "【直觉：未通过】不，不，这件事没有什么。\n\n叙述停在这里，没有进一步说明认知如何出错。\n\n【逻辑】不，不。";
    expect(validateRewriteQuality("我害怕。", output, "inner_monologue", check).violations.map((item) => item.code))
      .toContain("failure_not_expressed");
  });

  it("明确误读后再由现实纠正可以通过失败顺序启发式", () => {
    const output = "【直觉：未通过】这份害怕仿佛证明最坏答案已经发生，你几乎认定了它。\n\n现实没有提供原因，原文也没有给出危险；情绪很响，却不能代替证据。\n\n【逻辑】把结论收回。害怕仍然存在，但它没有证明任何具体事件。";
    expect(validateRewriteQuality("我害怕。", output, "inner_monologue", check).violations.map((item) => item.code))
      .not.toContain("failure_not_expressed");
  });
});
