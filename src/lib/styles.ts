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
    description: "冷峻观察、城市疲惫与克制的哲思。",
    direction:
      "采用心理黑色侦探叙事：冷峻的感官细节、疲惫的城市气息、克制的哲思，不凭空添加事实。",
  },
  {
    id: "dark_humor",
    label: "黑色幽默",
    shortLabel: "幽默",
    description: "荒诞、讽刺，但不牺牲原文信息。",
    direction:
      "加入干燥而荒诞的黑色幽默，用意外但准确的比喻制造反差，避免低俗笑话。",
  },
  {
    id: "inner_monologue",
    label: "多声部内心独白",
    shortLabel: "内心",
    description: "让理智、直觉与情绪短暂交锋。",
    direction:
      "写成多声部内心独白，可用【逻辑】、【共情】、【直觉】等原创认知频道插话，但保持清晰可读。",
  },
  {
    id: "lyrical",
    label: "抒情意识流",
    shortLabel: "抒情",
    description: "更柔软、更有节奏感的第一人称叙事。",
    direction:
      "采用抒情意识流，以第一人称感受和有节奏的意象增强情绪，但不要堆砌比喻。",
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
