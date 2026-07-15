import { describe, expect, it } from "vitest";
import {
  calculateSuccessChance,
  resolveCheckOutcome,
  rollCheck,
  type CheckRequest,
} from "./checks";

const request: CheckRequest = {
  enabled: true,
  skill: "logic",
  skillLevel: 3,
  difficulty: 10,
};

function fixedDice(...values: number[]) {
  let index = 0;
  return () => values[index++]!;
}

describe("resolveCheckOutcome", () => {
  it("让双一无条件成为灾难性误判", () => {
    expect(resolveCheckOutcome(1, 1, 20, 6)).toBe("critical_failure");
  });

  it("让双六无条件成为极佳通过", () => {
    expect(resolveCheckOutcome(6, 6, 12, 16)).toBe("critical_success");
  });

  it("普通骰点合计达到难度时通过", () => {
    expect(resolveCheckOutcome(3, 4, 10, 10)).toBe("success");
  });

  it("普通骰点合计低于难度时未通过", () => {
    expect(resolveCheckOutcome(2, 3, 8, 10)).toBe("failure");
  });
});

describe("rollCheck", () => {
  it("只调用两次骰子函数并计算合计与差值", () => {
    let calls = 0;
    const result = rollCheck(request, () => {
      calls += 1;
      return calls === 1 ? 4 : 5;
    });
    expect(calls).toBe(2);
    expect(result).toMatchObject({ dice: [4, 5], total: 12, margin: 2, outcome: "success" });
  });

  it("返回被冻结的结果和骰点", () => {
    const result = rollCheck(request, fixedDice(2, 2));
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.dice)).toBe(true);
  });

  it("拒绝越界骰点", () => {
    expect(() => rollCheck(request, fixedDice(0, 6))).toThrow("1 至 6");
  });

  it("拒绝在判定关闭时投骰", () => {
    expect(() => rollCheck({ ...request, enabled: false }, fixedDice(3, 3))).toThrow("尚未开启");
  });
});

describe("calculateSuccessChance", () => {
  it("枚举全部 36 种结果并保留双一和双六特例", () => {
    expect(calculateSuccessChance(0, 6)).toBeCloseTo((26 / 36) * 100, 8);
    expect(calculateSuccessChance(6, 16)).toBeCloseTo((6 / 36) * 100, 8);
  });

  it("等级提升不会降低估算成功率", () => {
    expect(calculateSuccessChance(4, 12)).toBeGreaterThan(calculateSuccessChance(2, 12));
  });
});
