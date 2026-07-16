import {
  CHECK_OUTCOME_LABELS,
  CHECK_SKILLS,
  getCheckSkill,
  type CheckResult,
} from "./checks-shared";
import { rewriteLengthRange, unicodeTextLength } from "./rewrite-length";
import { extractSourceFactAnchors } from "./source-facts";
import type { StyleId } from "./types";

export type RewriteViolationCode =
  | "empty" | "too_short" | "too_long" | "missing_selected_channel"
  | "wrong_outcome_label" | "missing_counter_channel" | "missing_narrative"
  | "meta_output" | "truncated" | "failure_not_expressed" | "possible_fact_invention"
  | "too_many_channels" | "source_copy" | "too_few_sentences"
  | "unexpected_outcome_label" | "unknown_channel"
  | "unsupported_number" | "changed_number" | "unsupported_time"
  | "unsupported_quote" | "possible_concrete_detail_invention";

export type RewriteViolation = { code: RewriteViolationCode; message: string };
export type RewriteQualityResult = {
  valid: boolean;
  outputLength: number;
  channelCount: number;
  violations: RewriteViolation[];
};

const META = /```|<\/?(?:rewrite_request|repair_request|source_text|draft)>|作为(?:一个|AI)|以下是(?:改写|结果)|提示词|无法完成/iu;
const SUBJECTIVE_MISREAD = /仿佛|像|似乎|几乎相信|以为|认定|确信|怀疑|觉得|猜(?:测|想)?|一定|肯定|针对|冲着|拒绝|背叛|阴谋|预感|恐怕/u;
const ORDERED_CORRECTION = /事实|现实|证据|其实|然而|并不等于|未必|只(?:是|能|证明)|就是|不能(?:说明|证明|等于)|没有[^。！？]{0,16}(?:表明|证明|意味着)|另一种可能|收回|撤销|纠正|原文只|原文没有/u;
const OUTCOME_TEXT = /极佳通过|灾难性误判|未通过|判定(?:成功|通过)|骰(?:点|子结果)/u;
const CHANNEL_LABEL = /【([^】：]{1,8})(?:：([^】]{1,12}))?】/gu;
const QUOTE_ATTRIBUTION = /(?:说|问|答|写|回复|表示|喊|称|告诉|承诺|邮件|消息)[^。！？\n]{0,12}[“‘"']/u;
const CONCRETE_DETAIL_TERMS = [
  "房间", "窗户", "窗外", "街道", "路灯", "灯光", "手机", "咖啡", "广播", "脚步",
  "门口", "走廊", "电梯", "汽车", "桌子", "椅子", "雨水", "烟雾", "键盘", "屏幕",
  "空气", "皮肤", "声音", "肌肉", "神经", "热浪", "警报", "微风",
  "遥控器", "通风口", "墙壁", "出汗", "后颈", "火源", "伤口", "毒",
] as const;

function normalizeForCopy(value: string) {
  return Array.from(value.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "")).join("");
}

export function longestCommonContiguousLength(left: string, right: string) {
  if (!left || !right) return 0;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  const row = new Uint16Array(shorter.length + 1);
  let longest = 0;
  for (let i = 1; i <= longer.length; i += 1) {
    for (let j = shorter.length; j >= 1; j -= 1) {
      row[j] = longer[i - 1] === shorter[j - 1] ? row[j - 1] + 1 : 0;
      if (row[j] > longest) longest = row[j];
    }
  }
  return longest;
}

function ngramCoverage(source: string, output: string) {
  if (!source) return 0;
  const size = Math.min(10, Math.max(3, Math.floor(source.length / 8)));
  if (source.length < size) return output.includes(source) ? 1 : 0;
  let matches = 0;
  const total = source.length - size + 1;
  for (let index = 0; index < total; index += 1) {
    if (output.includes(source.slice(index, index + size))) matches += 1;
  }
  return matches / total;
}

function isDominatedBySourceCopy(source: string, output: string, channelCount: number) {
  const normalizedSource = normalizeForCopy(source);
  const normalizedOutput = normalizeForCopy(output);
  if (normalizedSource.length < 32 || !normalizedOutput) return false;
  const common = longestCommonContiguousLength(normalizedSource, normalizedOutput);
  const continuousSourceRatio = common / normalizedSource.length;
  const outputCopyRatio = common / normalizedOutput.length;
  const coverage = ngramCoverage(normalizedSource, normalizedOutput);
  const hasSubstantialProcessing = channelCount >= 2 || normalizedOutput.length >= normalizedSource.length * 1.45;
  const nearVerbatim = continuousSourceRatio >= 0.92 && normalizedOutput.length <= normalizedSource.length * 1.18;
  return coverage >= 0.82 && (nearVerbatim || (outputCopyRatio >= 0.72 && !hasSubstantialProcessing));
}

function unsupportedValues(output: string[], source: string[]) {
  const sourceSet = new Set(source);
  return output.filter((value) => !sourceSet.has(value));
}

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
  const add = (code: RewriteViolationCode, message: string) => {
    if (!violations.some((violation) => violation.code === code)) violations.push({ code, message });
  };

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
  if (isDominatedBySourceCopy(source, clean, uniqueChannels.size)) add("source_copy", "输出主要由原文连续复制构成");
  if (range.sourceLength <= 30 && (clean.match(/[。！？!?]/gu)?.length ?? 0) < 2) {
    add("too_few_sentences", "短文本输出不能只有一句");
  }

  const sourceFacts = extractSourceFactAnchors(source);
  const outputFacts = extractSourceFactAnchors(clean);
  const newTimes = unsupportedValues(outputFacts.times, sourceFacts.times);
  if (newTimes.length > 0) add("unsupported_time", `新增或修改了时间：${newTimes.join("、")}`);
  const newNumbers = unsupportedValues(outputFacts.numbers, sourceFacts.numbers);
  if (newNumbers.length > 0) add("unsupported_number", `新增了具体数字：${newNumbers.join("、")}`);
  if (
    sourceFacts.numbers.some((value) => !outputFacts.numbers.includes(value)) &&
    newNumbers.length > 0
  ) add("changed_number", "原文数字被修改");
  const newSpecificFacts = [
    ...unsupportedValues(outputFacts.dates, sourceFacts.dates),
    ...unsupportedValues(outputFacts.currencies, sourceFacts.currencies),
    ...unsupportedValues(outputFacts.percentages, sourceFacts.percentages),
  ];
  if (newSpecificFacts.length > 0) add("unsupported_number", `新增了日期、金额或百分比：${newSpecificFacts.join("、")}`);
  const newQuotes = unsupportedValues(outputFacts.quotedSegments, sourceFacts.quotedSegments)
    .filter((quote) => !source.includes(quote))
    .filter((quote) => sourceFacts.quotedSegments.length > 0 || unicodeTextLength(quote) >= 8 || QUOTE_ATTRIBUTION.test(clean));
  if (newQuotes.length > 0) add("unsupported_quote", "新增或改写了明确引语");

  if (range.sourceLength <= 30) {
    const inventedTerms = CONCRETE_DETAIL_TERMS.filter((term) => clean.includes(term) && !source.includes(term));
    if (inventedTerms.length >= 2) {
      add("possible_concrete_detail_invention", `极短文本疑似新增多个具体细节：${inventedTerms.join("、")}`);
    }
  }

  if (check) {
    if (uniqueChannels.size < range.minimumChannels) add("missing_counter_channel", `至少需要 ${range.minimumChannels} 个不同频道`);
    if (uniqueChannels.size > range.maximumChannels) add("too_many_channels", `频道数不得超过 ${range.maximumChannels}`);
    const selected = getCheckSkill(check.skill).label;
    if (labels[0]?.[1] !== selected) add("missing_selected_channel", `首个频道必须是${selected}`);
    if (labels[0]?.[2] !== CHECK_OUTCOME_LABELS[check.outcome]) add("wrong_outcome_label", "首个频道的判定标签不正确");
    if (check.outcome === "failure" || check.outcome === "critical_failure") {
      const firstLabelEnd = (labels[0]?.index ?? 0) + (labels[0]?.[0].length ?? 0);
      const nextLabelIndex = labels[1]?.index ?? clean.length;
      const firstVoice = clean.slice(firstLabelEnd, nextLabelIndex);
      const subjective = firstVoice.match(SUBJECTIVE_MISREAD);
      const correctionSearchStart = subjective
        ? firstLabelEnd + (subjective.index ?? 0) + subjective[0].length
        : firstLabelEnd;
      const correctionAfterMisread = ORDERED_CORRECTION.test(clean.slice(correctionSearchStart));
      if (!subjective || labels.length < 2 || !correctionAfterMisread) {
        add("failure_not_expressed", "失败结果需要先出现主观误读，再由后续频道或叙事明确纠偏");
      }
    }
  } else {
    if (labels.some((label) => Boolean(label[2])) || OUTCOME_TEXT.test(clean)) add("unexpected_outcome_label", "未启用判定时不得出现判定结果");
    if (style === "inner_monologue") {
      if (uniqueChannels.size < 2) add("missing_counter_channel", "内心风格至少需要两个不同频道");
      if (uniqueChannels.size > 4) add("too_many_channels", "内心风格最多使用四个频道");
    } else if (uniqueChannels.size > 2) add("too_many_channels", "当前风格最多偶尔使用两个频道");
  }

  return { valid: violations.length === 0, outputLength, channelCount: uniqueChannels.size, violations };
}
