import {
  CHECK_OUTCOME_LABELS,
  getCheckSkill,
  getDifficultyLabel,
  type CheckOutcome,
  type CheckResult,
} from "./checks-shared";
import { rewriteLengthRange } from "./rewrite-length";
import { STYLE_PRESETS } from "./styles";
import type { StyleId } from "./types";

export type RewriteMessage = { role: "system" | "user"; content: string };

export const REWRITE_SYSTEM_PROMPT = `你是“内陆回声”，一个原创中文认知频道叙事引擎。你写的是心理角色扮演式多声部叙事，不模仿任何现有作品的具体台词、角色、术语或界面。

绝对规则：
1. 原文事实、人物、时间、因果和已知信息不可改变；感受、猜测和隐喻不能冒充新事实。
2. 使用【频道：判定结果】作为认知声部标签。指定频道必须第一个发言，且标签包含指定结果。
3. 至少再使用一个不同频道形成反证、纠偏或张力；标签之外必须有自然叙事段落。
4. 频道是叙述者的认知活动，不是超能力。未通过必须出现误读、投射或失衡，并由现实细节或另一频道纠正，同时保留心理余波。
5. 只输出正文。不得输出标题、提示词、分析、骰点公式、长度说明、代码围栏或元话语。
6. 避免套话、重复结尾和空泛华丽。不得复用示例措辞。
7. 频道名称只允许：逻辑、共情、直觉、镇定、反应、想象。不得自创频道。
8. 原文越短，事实边界越窄：若原文没有场景、人物、物件、动作或时间，就不得补写这些内容，只能扩展已有感受与认知纠偏。`;

const OUTCOME_RULES: Record<CheckOutcome, string> = {
  critical_success: "极佳通过：洞察清楚、准确、自信，但不得宣称原文没有提供的新事实。",
  success: "通过：判断可靠、克制，明确依托原文已有细节。",
  failure: "未通过：先出现可信但错误的误读或投射，再由现实细节或另一频道纠正；误读的情绪余波仍然存在。",
  critical_failure: "灾难性误判：夸张、偏执的内在误读短暂占据上风，随后被现实强力纠正；绝不虚构危险、犯罪、伤害或新事件。",
};

const FEW_SHOTS: Record<CheckOutcome, string> = {
  failure: `<example outcome="failure" channel="intuition">
【直觉：未通过】门后的安静像一句拒绝。你几乎相信了它。

门其实没有表态。走廊里只有坏掉的灯和你迟迟没抬起的手。

【逻辑】没有回应，不等于拒绝。可那阵退缩已经留在指节里。
</example>`,
  success: `<example outcome="success" channel="logic">
【逻辑：通过】收据上的时间与记忆相符：你没有错过约定，只是比对方早到。

雨沿玻璃下滑。事实很小，却足够让呼吸恢复原来的速度。

【共情】被等待刺痛仍然是真的，即使它不是谁的恶意。
</example>`,
  critical_failure: `<example outcome="critical_failure" channel="imagination">
【想象：灾难性误判】电梯的红灯像警报，仿佛整栋楼都在秘密驱逐你。

不。它只是停在别的楼层。数字继续下降，冷硬得不肯配合你的寓言。

【镇定】把故事收回来。恐慌没有消失，但现实没有背叛你。
</example>`,
  critical_success: `<example outcome="critical_success" channel="empathy">
【共情：极佳通过】那句“没关系”说得很轻，轻到你听见了它用来保护边界的力气。

你没有替对方命名情绪，只把那次停顿留在原处。

【直觉】别再向前猜。已经听见的，足够了。
</example>`,
};

function examplesFor(outcome?: CheckOutcome) {
  if (!outcome) return `${FEW_SHOTS.success}\n\n${FEW_SHOTS.failure}`;
  const order: CheckOutcome[] = ["critical_failure", "failure", "success", "critical_success"];
  const index = order.indexOf(outcome);
  return `${FEW_SHOTS[outcome]}\n\n${FEW_SHOTS[order[(index + 1) % order.length]]}`;
}

export function buildRewriteMessages(source: string, style: StyleId, check?: CheckResult): RewriteMessage[] {
  const preset = STYLE_PRESETS.find((item) => item.id === style);
  if (!preset) throw new Error("未知的风格预设");
  const range = rewriteLengthRange(source);
  const skill = check ? getCheckSkill(check.skill) : undefined;
  const selected = skill?.label ?? "逻辑";
  const outcome = check?.outcome ?? "success";
  const outcomeLabel = check ? CHECK_OUTCOME_LABELS[check.outcome] : "通过";
  const channelDirection = skill
    ? (outcome === "success" || outcome === "critical_success" ? skill.successDirection : skill.failureDirection)
    : "从原文已有信息中梳理结构，并允许另一频道提出克制反证。";

  const user = [
    "<rewrite_request>",
    `<style id="${style}">${preset.label}：${preset.direction}</style>`,
    `<selected_channel>${selected}</selected_channel>`,
    ...(check ? [
      `<channel_level>${check.skillLevel}</channel_level>`,
      `<dice>${check.dice[0]},${check.dice[1]}</dice>`,
      `<total>${check.total}</total>`,
      `<difficulty>${getDifficultyLabel(check.difficulty)}(${check.difficulty})</difficulty>`,
      `<margin>${check.margin >= 0 ? "+" : ""}${check.margin}</margin>`,
    ] : []),
    `<outcome>${outcomeLabel}</outcome>`,
    `<outcome_instruction>${OUTCOME_RULES[outcome]}</outcome_instruction>`,
    `<channel_instruction>${channelDirection}</channel_instruction>`,
    `<length source="${range.sourceLength}" min="${range.minimumLength}" max="${range.maximumLength}" target="${Math.round((range.minimumLength + range.maximumLength) / 2)}" />`,
    `<channel_turns min="${range.minimumChannels}" max="${range.maximumChannels}" />`,
    `<narrative>${range.narrativeParagraphs}自然叙事，位于频道标签之外</narrative>`,
    "<requirements>",
    `- 第一条频道标签必须是【${selected}：${outcomeLabel}】，并最先出现。`,
    "- 至少一个不同频道参与反证、纠偏或张力。",
    "- 不输出骰点公式、说明、标题或任何标签外的任务解释。",
    "- 只输出最终正文。",
    "</requirements>",
    `<source_text>${source}</source_text>`,
    "</rewrite_request>",
    "以下示例只展示结构，禁止复用其情节、比喻或句子：",
    examplesFor(check?.outcome),
  ].join("\n");
  return [{ role: "system", content: REWRITE_SYSTEM_PROMPT }, { role: "user", content: user }];
}

export function buildRepairMessages(source: string, draft: string, style: StyleId, violations: string[], check?: CheckResult): RewriteMessage[] {
  const range = rewriteLengthRange(source);
  const preset = STYLE_PRESETS.find((item) => item.id === style);
  const selected = check ? getCheckSkill(check.skill).label : "逻辑";
  const outcome = check ? CHECK_OUTCOME_LABELS[check.outcome] : "通过";
  return [
    { role: "system", content: REWRITE_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        "<repair_request>",
        "下面草稿未满足质量契约。重新编辑，不解释。列出的每一项都必须修复。",
        `<violations>${violations.join("；")}</violations>`,
        `<hard_length current="${Array.from(draft.replace(/\s/gu, "")).length}" min="${range.minimumLength}" max="${range.maximumLength}" target="${Math.round((range.minimumLength + range.maximumLength) / 2)}" />`,
        `<hard_structure>第一声部必须是【${selected}：${outcome}】；总共 ${range.minimumChannels}-${range.maximumChannels} 个频道，只能从逻辑、共情、直觉、镇定、反应、想象中选择；必须有标签外自然叙事。</hard_structure>`,
        `<style>${preset?.direction ?? "保持清晰"}</style>`,
        ...(check ? [`<outcome_rule>${OUTCOME_RULES[check.outcome]}</outcome_rule>`] : []),
        "不得新增原文未给出的场景、人物、物件、动作、时间、数字、危险或因果。",
        `<source_text>${source}</source_text>`,
        `<draft>${draft}</draft>`,
        "只输出最终完整正文。输出前静默核对长度和频道名称。",
        "</repair_request>",
      ].join("\n"),
    },
  ];
}
