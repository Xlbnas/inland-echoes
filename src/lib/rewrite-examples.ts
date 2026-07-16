import type { CheckOutcome } from "./checks-shared";
import { escapePromptXml } from "./prompt-escape";
import { unicodeTextLength } from "./rewrite-length";
import type { StyleId } from "./types";

type RewriteExample = {
  id: string;
  source: string;
  style: StyleId;
  selectedChannel?: string;
  outcome?: CheckOutcome;
  allowedFacts: string[];
  forbiddenAdditions: string[];
  output: string;
};

const EXAMPLES: RewriteExample[] = [
  {
    id: "tiny-intuition-failure",
    source: "我害怕。",
    style: "inner_monologue",
    selectedChannel: "直觉",
    outcome: "failure",
    allowedFacts: ["叙述者害怕"],
    forbiddenAdditions: ["地点、他人、物件、动作和恐惧原因"],
    output: "【直觉：未通过】这份害怕几乎让你认定，某个最坏的答案已经成立。\n\n可原文只给出了害怕，没有给出答案，更没有给出正在发生的危险。情绪可以很响，现实仍旧沉默。\n\n【逻辑】把结论收回去。害怕是真的；被害怕证明的事情，并不存在。",
  },
  {
    id: "tiny-empathy-critical-success",
    source: "我很难过。",
    style: "lyrical",
    selectedChannel: "共情",
    outcome: "critical_success",
    allowedFacts: ["叙述者难过"],
    forbiddenAdditions: ["失去的人、发生的事件、天气、房间和身体动作"],
    output: "【共情：极佳通过】难过不需要先交代来历，才配被承认。你准确地听见了它，却没有替它编造原因。\n\n这份感受停留在它自己的边界里，沉重，但不冒充证词。\n\n【镇定】先允许它存在。至于发生过什么，原文没有说，你也不越过那条线。",
  },
  {
    id: "short-logic-success",
    source: "会议结束了，没有结论。",
    style: "psycho_noir",
    selectedChannel: "逻辑",
    outcome: "success",
    allowedFacts: ["会议已经结束", "会议没有结论"],
    forbiddenAdditions: ["参会者身份、会议地点、争论内容和后续决定"],
    output: "【逻辑：通过】可以确认的只有两件事：会议结束，结论缺席。除此之外，没有证据支持谁获胜，谁退让，或者下一步已经确定。\n\n记录停在这里，冷而完整。空白令人失望，却仍然只是空白。\n\n【共情】你想从没有结论里读出态度；那份焦躁是真的，但它不能补签一份并不存在的决定。",
  },
  {
    id: "imagination-critical-failure",
    source: "他没有回复。",
    style: "dark_humor",
    selectedChannel: "想象",
    outcome: "critical_failure",
    allowedFacts: ["某位男性没有回复"],
    forbiddenAdditions: ["未回复的原因、他的位置、设备、第三人和后续动作"],
    output: "【想象：灾难性误判】没有回复——于是你的脑内部门立刻宣布，这是一份关于厌弃的正式公报，印章齐全，证据为零。\n\n事实没有配合这场发布会。原文只说明回复尚未出现，没有说明沉默的原因。\n\n【逻辑】撤销公报。你仍会不安，但不安不能代替对方作证。",
  },
  {
    id: "unchecked-inner",
    source: "我后悔了。",
    style: "inner_monologue",
    allowedFacts: ["叙述者后悔"],
    forbiddenAdditions: ["后悔的事件、他人、地点、物件和补救动作"],
    output: "【共情】后悔已经出现，不必先把它驳回。\n【逻辑】但它没有说明发生过什么，也没有证明一切无法挽回。\n\n你把感受和事实分开放好。前者仍在发疼，后者仍保持原文那样有限。",
  },
  {
    id: "unchecked-narrative",
    source: "我终于承认自己累了。",
    style: "lyrical",
    allowedFacts: ["叙述者终于承认疲惫"],
    forbiddenAdditions: ["疲惫原因、时间、地点、旁人和具体动作"],
    output: "我终于不再把疲惫改写成别的名字。它只是被承认，于是句子里那股一直绷紧的力慢慢松开了一点。没有新的解释，也没有突然出现的答案；我只守住这份迟来的诚实，让它按自己的重量留在心里。",
  },
];

function renderExample(example: RewriteExample) {
  return [
    `<example id="${example.id}">`,
    `<source_text>${escapePromptXml(example.source)}</source_text>`,
    "<conditions>",
    `<style>${example.style}</style>`,
    `<selected_channel>${example.selectedChannel || "关闭判定"}</selected_channel>`,
    `<outcome>${example.outcome || "关闭判定"}</outcome>`,
    "</conditions>",
    `<allowed_facts>${example.allowedFacts.map((fact) => `<fact>${escapePromptXml(fact)}</fact>`).join("")}</allowed_facts>`,
    `<forbidden_additions>${example.forbiddenAdditions.map((fact) => `<item>${escapePromptXml(fact)}</item>`).join("")}</forbidden_additions>`,
    `<output>${escapePromptXml(example.output)}</output>`,
    "</example>",
  ].join("\n");
}

export function selectRewriteExamples(source: string, style: StyleId, outcome?: CheckOutcome) {
  const sourceLength = unicodeTextLength(source);
  if (!outcome) {
    const exact = EXAMPLES.find((example) => !example.outcome && example.style === style);
    const fallback = style === "inner_monologue"
      ? EXAMPLES.find((example) => example.id === "unchecked-inner")
      : EXAMPLES.find((example) => example.id === "unchecked-narrative");
    return [exact || fallback].filter((example): example is RewriteExample => Boolean(example)).map(renderExample);
  }

  const exact = EXAMPLES.find((example) => example.outcome === outcome);
  const tinyBoundary = sourceLength <= 30
    ? EXAMPLES.find((example) => example.id === "tiny-intuition-failure")
    : undefined;
  return [exact, tinyBoundary]
    .filter((example, index, values): example is RewriteExample =>
      Boolean(example) && values.findIndex((candidate) => candidate?.id === example?.id) === index)
    .slice(0, 2)
    .map(renderExample);
}
