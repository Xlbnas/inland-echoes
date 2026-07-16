import { describe, expect, it } from "vitest";
import { extractSourceFactAnchors, serializeSourceFactAnchors } from "./source-facts";

describe("source fact anchors", () => {
  it("提取数字、日期、时间、金额、百分比和引语", () => {
    const facts = extractSourceFactAnchors("2026年7月4日 09:20 支付￥86.50，折扣20%，他说“收到2份”。");
    expect(facts.dates).toContain("2026年7月4日");
    expect(facts.times).toContain("09:20");
    expect(facts.currencies).toContain("￥86.50");
    expect(facts.percentages).toContain("20%");
    expect(facts.numbers).toEqual(expect.arrayContaining(["2026", "7", "4", "09", "20", "86.50", "20", "2"]));
    expect(facts.quotedSegments).toEqual(["收到2份"]);
  });

  it("序列化时转义引语里的 XML", () => {
    expect(serializeSourceFactAnchors(extractSourceFactAnchors('他说"<tag>"。'))).toContain("&lt;tag&gt;");
  });
});
