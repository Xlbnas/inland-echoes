import { describe, expect, it } from "vitest";
import { fidelityAuditSchema } from "./fidelity-audit";

describe("fidelity audit schema", () => {
  it("接受完整结构并拒绝非法 severity", () => {
    const base = { supported: true, changedFacts: [], unsupportedClaims: [], missingCriticalFacts: [] };
    expect(fidelityAuditSchema.safeParse(base).success).toBe(true);
    expect(fidelityAuditSchema.safeParse({
      ...base,
      supported: false,
      unsupportedClaims: [{ claim: "新增场景", reason: "原文没有", severity: "critical" }],
    }).success).toBe(false);
  });
});
