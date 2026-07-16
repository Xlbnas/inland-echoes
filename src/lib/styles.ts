import type { StyleId } from "./types";
import { rewriteLengthRange as calculateRewriteLengthRange, unicodeTextLength } from "./rewrite-length";

export const STYLE_PRESETS: Array<{
  id: StyleId;
  label: string;
  shortLabel: string;
  description: string;
  direction: string;
}> = [
  {
    id: "psycho_noir",
    label: "心理黑色侦探",
    shortLabel: "侦探",
    description: "冷峻观察、证据压力与克制的哲思。",
    direction:
      "采用心理黑色侦探叙事：以观察、证据和心理压力为核心，句子偏冷；不得自动加入城市、雨、霓虹或烟，除非原文已有。",
  },
  {
    id: "dark_humor",
    label: "黑色幽默",
    shortLabel: "幽默",
    description: "荒诞、讽刺，但不牺牲原文信息。",
    direction:
      "采用干燥的黑色幽默，笑点只来自原文事实之间的反差；不用随机荒诞物件，不嘲弄人物痛苦，不依赖宇宙、命运或官僚机器等通用笑料。",
  },
  {
    id: "inner_monologue",
    label: "多声部内心独白",
    shortLabel: "内心",
    description: "让理智、直觉与情绪短暂交锋。",
    direction:
      "写成多声部内心独白，每个频道承担不同认知功能且语气可辨；标签之外仍有自然叙事，不让每句话都带标签。",
  },
  {
    id: "lyrical",
    label: "抒情意识流",
    shortLabel: "抒情",
    description: "更柔软、更有节奏感的第一人称叙事。",
    direction:
      "采用抒情意识流，节奏和意象只从原文已有感觉生长；不自动新增场景，不堆砌比喻，关闭判定时可以完全不用频道。",
  },
];

export function rewriteLengthRange(text: string) {
  return calculateRewriteLengthRange(text);
}

export function isRewriteLengthValid(source: string, output: string) {
  const { minimumLength, maximumLength } = rewriteLengthRange(source);
  const outputLength = unicodeTextLength(output);
  return outputLength >= minimumLength && outputLength <= maximumLength;
}

export function rewriteTokenBudget(text: string) {
  return rewriteLengthRange(text).maxTokens;
}
