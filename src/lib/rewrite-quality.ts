import { CHECK_OUTCOME_LABELS, CHECK_SKILLS, getCheckSkill, type CheckResult } from "./checks-shared";
import { rewriteLengthRange, unicodeTextLength } from "./rewrite-length";

export type RewriteViolationCode =
  | "empty" | "too_short" | "too_long" | "missing_selected_channel"
  | "wrong_outcome_label" | "missing_counter_channel" | "missing_narrative"
  | "meta_output" | "truncated" | "failure_not_expressed" | "possible_fact_invention"
  | "too_many_channels" | "source_copy" | "too_few_sentences";

export type RewriteViolation = { code: RewriteViolationCode; message: string };
export type RewriteQualityResult = { valid: boolean; outputLength: number; channelCount: number; violations: RewriteViolation[] };

const META = /```|<\/?(?:rewrite_request|repair_request|source_text|draft)>|作为(?:一个|AI)|以下是(?:改写|结果)|提示词|无法完成/iu;
const CORRECTION = /不[，。；、]?|只是|其实|现实|证据|也可能|未必|并不等于|收回来|纠正|等等|别再/gu;
const INVENTION = /谋杀|绑架|爆炸|尸体|凶手|持枪|追杀|犯罪|毒药/u;

export function validateRewriteQuality(source: string, output: string, check?: CheckResult, truncated = false): RewriteQualityResult {
  const violations: RewriteViolation[] = [];
  const clean = output.trim();
  const range = rewriteLengthRange(source);
  const outputLength = unicodeTextLength(clean);
  const labels = [...clean.matchAll(/【([^】：]{1,8})(?:：([^】]{1,12}))?】/gu)];
  const channelNames = labels.map((match) => match[1]);
  const knownChannels = channelNames.filter((name) => CHECK_SKILLS.some((skill) => skill.label === name));
  const uniqueChannels = new Set(knownChannels);
  const add = (code: RewriteViolationCode, message: string) => violations.push({ code, message });

  if (!clean) add("empty", "输出为空");
  if (outputLength < range.minimumLength) add("too_short", `正文少于 ${range.minimumLength} 字`);
  if (outputLength > range.maximumLength) add("too_long", `正文超过 ${range.maximumLength} 字`);
  if (META.test(clean)) add("meta_output", "包含代码围栏、提示标签或元话语");
  if (truncated || /(?:……|\.\.\.|[,，:：;；、—-])\s*$/u.test(clean)) add("truncated", "输出可能被截断");
  if (uniqueChannels.size < range.minimumChannels) add("missing_counter_channel", `至少需要 ${range.minimumChannels} 个不同频道`);
  if (uniqueChannels.size > range.maximumChannels) add("too_many_channels", `频道数不得超过 ${range.maximumChannels}`);
  const narrative = clean.replace(/【[^】]+】[^\n]*/gu, "").replace(/\s/gu, "");
  if (narrative.length < 12) add("missing_narrative", "缺少频道标签之外的自然叙事");
  if (source.length >= 12 && clean.includes(source.trim())) add("source_copy", "大段直接复制原文");
  if (range.sourceLength <= 30 && (clean.match(/[。！？!?]/gu)?.length ?? 0) < 2) add("too_few_sentences", "短文本输出不能只有一句");
  if (check) {
    const selected = getCheckSkill(check.skill).label;
    if (labels[0]?.[1] !== selected) add("missing_selected_channel", `首个频道必须是${selected}`);
    if (labels[0]?.[2] !== CHECK_OUTCOME_LABELS[check.outcome]) add("wrong_outcome_label", "首个频道的判定标签不正确");
    if ((check.outcome === "failure" || check.outcome === "critical_failure") && (clean.match(CORRECTION)?.length ?? 0) < 2) {
      add("failure_not_expressed", "失败结果缺少误读后的现实纠偏或不确定性");
    }
    if ((check.outcome === "critical_success" || check.outcome === "critical_failure") && INVENTION.test(clean) && !INVENTION.test(source)) {
      add("possible_fact_invention", "可能新增危险、犯罪或伤害事实");
    }
  }
  return { valid: violations.length === 0, outputLength, channelCount: uniqueChannels.size, violations };
}
