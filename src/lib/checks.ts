import { randomInt } from "node:crypto";
import {
  calculateSuccessChance,
  resolveCheckOutcome,
  type CheckRequest,
  type CheckResult,
} from "./checks-shared";

export * from "./checks-shared";

export type RollDie = () => number;

function assertDie(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 6) {
    throw new Error("骰子函数必须返回 1 至 6 的整数");
  }
}

export function rollCheck(
  request: CheckRequest,
  rollDie: RollDie = () => randomInt(1, 7),
): CheckResult {
  if (!request.enabled) throw new Error("认知频道判定尚未开启");
  if (!Number.isInteger(request.skillLevel) || request.skillLevel < 0 || request.skillLevel > 6) {
    throw new Error("频道等级必须为 0 至 6 的整数");
  }

  const dieOne = rollDie();
  const dieTwo = rollDie();
  assertDie(dieOne);
  assertDie(dieTwo);

  const total = dieOne + dieTwo + request.skillLevel;
  const result: CheckResult = {
    skill: request.skill,
    skillLevel: request.skillLevel,
    difficulty: request.difficulty,
    dice: Object.freeze([dieOne, dieTwo]) as readonly [number, number],
    total,
    margin: total - request.difficulty,
    outcome: resolveCheckOutcome(dieOne, dieTwo, total, request.difficulty),
  };

  return Object.freeze(result);
}

export { calculateSuccessChance, resolveCheckOutcome };
