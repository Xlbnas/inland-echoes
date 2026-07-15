import {
  CHECK_OUTCOME_LABELS,
  CHECK_SKILLS,
  getCheckSkill,
  type CheckResult,
} from "./checks-shared";
import { rewriteLengthRange, unicodeTextLength } from "./rewrite-length";
import type { StyleId } from "./types";

export type RewriteViolationCode =
  | "empty" | "too_short" | "too_long" | "missing_selected_channel"
  | "wrong_outcome_label" | "missing_counter_channel" | "missing_narrative"
  | "meta_output" | "truncated" | "failure_not_expressed" | "possible_fact_invention"
  | "too_many_channels" | "source_copy" | "too_few_sentences"
  | "unexpected_outcome_label" | "unknown_channel";

export type RewriteViolation = { code: RewriteViolationCode; message: string };
export type RewriteQualityResult = {
  valid: boolean;
  outputLength: number;
  channelCount: number;
  violations: RewriteViolation[];
};

const META = /```|<\/?(?:rewrite_request|repair_request|source_text|draft)>|作为(?:一个|AI)|以下是(?:改写|结果)|提示词|无法完成/iu;
const CORRECTION = /不[，。；、]?|只是|其实|现实|证据|也可能|未必|并不等于|收回来|纠正|等等|别再/gu;
const INVENTION = /谋杀|绑架|爆炸|尸体|凶手|持枪|追杀|犯罪|毒药/u;
const OUTCOME_TEXT = /极佳通过|灾难性误判|未通过|判定(?:成功|通过)|骰(?:点|子结果)/u;
const CHANNEL_LABEL = /【([^】：]{1,8})(?:：([^】]{1,12}))?】/gu;

export function validateRewriteQuality(
  source: string,
  output: string,
  style: StyleId,
  check?: CheckResult,
  truncated = false,
): RewriteQualityResult {
  const violations: RewriteViolation[] = [];
  const clean = output.trim();
  const range = rewriteLengthRange(source);
  const outputLength = unicodeTextLength(clean);
  const labels = [...clean.matchAll(CHANNEL_LABEL)];
  const channelNames = labels.map((match) => match[1]);
  const legalNames = new Set(CHECK_SKILLS.map((skill) => skill.label));
  const knownChannels = channelNames.filter((name) => legalNames.has(name));
  const uniqueChannels = new Set(knownChannels);
  const add = (code: RewriteViolationCode, message: string) => violations.push({ code, message });

  if (!clean) add("empty", "输出为空");
  if (outputLength < range.minimumLength) add("too_short", `正文少于 ${range.minimumLength} 字`);
  if (outputLength > range.maximumLength) add("too_long", `正文超过 ${range.maximumLength} 字`);
  if (META.test(clean)) add("meta_output", "包含代码围栏、提示标签或元话语");
  if (truncated || /(?:……|\.\.\.|[,，:：;；、—-])\s*$/u.test(clean)) add("truncated", "输出可能被截断");
  if (channelNames.some((name) => !legalNames.has(name))) add("unknown_channel", "包含未知认知频道");

  const narrative = clean
    .split(/\n/gu)
    .filter((line) => !/【[^】]+】/u.test(line))
    .join("")
    .replace(/\s/gu, "");
  if (narrative.length < 12) add("missing_narrative", "缺少频道标签之外的自然叙事");
  if (source.length >= 12 && clean.includes(source.trim())) add("source_copy", "大段直接复制原文");
  if (range.sourceLength <= 30 && (clean.match(/[。！？!?]/gu)?.length ?? 0) < 2) {
    add("too_few_sentences", "短文本输出不能只有一句");
  }

  if (check) {
    if (uniqueChannels.size < range.minimumChannels) {
      add("missing_counter_channel", `至少需要 ${range.minimumChannels} 个不同频道`);
    }
    if (uniqueChannels.size > range.maximumChannels) {
      add("too_many_channels", `频道数不得超过 ${range.maximumChannels}`);
    }
    const selected = getCheckSkill(check.skill).label;
    if (labels[0]?.[1] !== selected) add("missing_selected_channel", `首个频道必须是${selected}`);
    if (labels[0]?.[2] !== CHECK_OUTCOME_LABELS[check.outcome]) {
      add("wrong_outcome_label", "首个频道的判定标签不正确");
    }
    if (
      (check.outcome === "failure" || check.outcome === "critical_failure") &&
      (clean.match(CORRECTION)?.length ?? 0) < 2
    ) {
      add("failure_not_expressed", "失败结果缺少误读后的现实纠偏或不确定性");
    }
    if (
      (check.outcome === "critical_success" || check.outcome === "critical_failure") &&
      INVENTION.test(clean) &&
      !INVENTION.test(source)
    ) {
      add("possible_fact_invention", "可能新增危险、犯罪或伤害事实");
    }
  } else {
    if (labels.some((label) => Boolean(label[2])) || OUTCOME_TEXT.test(clean)) {
      add("unexpected_outcome_label", "未启用判定时不得出现判定结果");
    }
    if (style === "inner_monologue") {
      if (uniqueChannels.size < 2) add("missing_counter_channel", "内心风格至少需要两个不同频道");
      if (uniqueChannels.size > 4) add("too_many_channels", "内心风格最多使用四个频道");
    } else if (uniqueChannels.size > 2) {
      add("too_many_channels", "当前风格最多偶尔使用两个频道");
    }
  }
  return {
    valid: violations.length === 0,
    outputLength,
    channelCount: uniqueChannels.size,
    violations,
  };
}
