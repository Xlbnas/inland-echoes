import { escapePromptXml } from "./prompt-escape";

export type SourceFactAnchors = {
  numbers: string[];
  times: string[];
  dates: string[];
  currencies: string[];
  percentages: string[];
  quotedSegments: string[];
};

const DATE = /(?:\d{4}[年./-]\d{1,2}(?:[月./-]\d{1,2}日?)?|\d{1,2}月\d{1,2}日)/gu;
const TIME = /(?:[01]?\d|2[0-3])[:：][0-5]\d|(?:[01]?\d|2[0-3])点(?:[0-5]?\d分?)?/gu;
const CURRENCY = /(?:[¥￥$]\s?\d+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?\s?(?:元|人民币|美元|CNY|RMB|USD))/giu;
const PERCENTAGE = /\d+(?:\.\d+)?\s?[%％]/gu;
const NUMBER = /\d+(?:\.\d+)?/gu;
const QUOTES = /“([^”\n]{1,300})”|‘([^’\n]{1,300})’|"([^"\n]{1,300})"|'([^'\n]{1,300})'/gu;

function uniqueMatches(text: string, pattern: RegExp) {
  return [...text.matchAll(pattern)].map((match) => match[0]).filter(
    (value, index, values) => values.indexOf(value) === index,
  );
}

export function extractSourceFactAnchors(text: string): SourceFactAnchors {
  return {
    numbers: uniqueMatches(text, NUMBER),
    times: uniqueMatches(text, TIME),
    dates: uniqueMatches(text, DATE),
    currencies: uniqueMatches(text, CURRENCY),
    percentages: uniqueMatches(text, PERCENTAGE),
    quotedSegments: [...text.matchAll(QUOTES)]
      .map((match) => match.slice(1).find(Boolean) || "")
      .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index),
  };
}

export function serializeSourceFactAnchors(anchors: SourceFactAnchors) {
  const element = (name: keyof SourceFactAnchors, tag: string = name) =>
    `<${tag}>${anchors[name].map((value) => `<fact>${escapePromptXml(value)}</fact>`).join("")}</${tag}>`;
  return [
    "<source_fact_anchors>",
    element("numbers"),
    element("times"),
    element("dates"),
    element("currencies"),
    element("percentages"),
    element("quotedSegments", "quoted_segments"),
    "</source_fact_anchors>",
  ].join("\n");
}
