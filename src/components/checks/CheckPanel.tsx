"use client";

import { AnimatePresence, m, useReducedMotion } from "motion/react";
import {
  CHECK_DIFFICULTIES,
  CHECK_SKILLS,
  calculateSuccessChance,
  type CheckRequest,
  type CheckResult as CheckResultValue,
} from "@/lib/checks-shared";
import type { DiceState } from "@/hooks/useRewriteStream";
import {
  disclosureVariants,
  introCheckVariants,
  MECHANICAL_SPRING,
  MOTION_DURATION,
  MOTION_EASE,
} from "@/lib/motion";
import { CheckResult } from "./CheckResult";
import { DicePair } from "./DicePair";

export function CheckPanel({
  value,
  onChange,
  disabled,
  diceState,
  result,
}: {
  value: CheckRequest;
  onChange: (value: CheckRequest) => void;
  disabled: boolean;
  diceState: DiceState;
  result: CheckResultValue | null;
}) {
  const reduceMotion = useReducedMotion();
  const chance = calculateSuccessChance(value.skillLevel, value.difficulty);
  const update = (next: Partial<CheckRequest>) => onChange({ ...value, ...next });

  return (
    <m.section
      className={`check-panel ${value.enabled ? "enabled" : "collapsed"}`}
      aria-labelledby="check-title"
      variants={introCheckVariants}
      layout
      transition={MECHANICAL_SPRING}
      data-state={value.enabled ? "open" : "closed"}
    >
      <header className="check-panel-header">
        <div>
          <span className="check-kicker">附页 / 认知检验单</span>
          <h2 id="check-title">2D6 认知频道判定</h2>
        </div>
        <button
          type="button"
          className="check-toggle"
          aria-pressed={value.enabled}
          aria-expanded={value.enabled}
          aria-controls="check-panel-body"
          onClick={() => update({ enabled: !value.enabled })}
          disabled={disabled}
        >
          <span aria-hidden="true" />
          {value.enabled ? "已启用" : "未启用"}
        </button>
      </header>

      <AnimatePresence initial={false} mode="popLayout">
        {!value.enabled ? (
          <m.p
            key="collapsed-note"
            className="check-collapsed-note"
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.08 : MOTION_DURATION.fast }}
          >
            关闭时保持原有改写流程，不发送判定结果。
          </m.p>
        ) : (
          <m.div
            key="check-body"
            id="check-panel-body"
            className="check-panel-body"
            initial={reduceMotion ? false : "closed"}
            animate="open"
            exit="closed"
            variants={disclosureVariants}
            data-state="open"
          >
            <div className="check-controls">
              <fieldset disabled={disabled}>
                <legend>认知频道</legend>
                <div className="skill-grid">
                  {CHECK_SKILLS.map((skill) => {
                    const selected = value.skill === skill.id;
                    return (
                      <button
                        key={skill.id}
                        type="button"
                        className={selected ? "selected" : ""}
                        aria-pressed={selected}
                        onClick={() => update({ skill: skill.id })}
                      >
                        {selected ? (
                          <m.span
                            className="skill-indicator"
                            layoutId="skill-indicator"
                            transition={MECHANICAL_SPRING}
                            aria-hidden="true"
                          />
                        ) : null}
                        <span className="skill-label">{skill.label}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="check-numbers">
                <label htmlFor="skill-level">
                  <span>频道等级</span>
                  <AnimatePresence initial={false} mode="popLayout">
                    <m.output
                      key={value.skillLevel}
                      htmlFor="skill-level"
                      initial={reduceMotion ? false : { opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduceMotion ? undefined : { opacity: 0, y: -3 }}
                      transition={{ duration: reduceMotion ? 0.08 : MOTION_DURATION.instant }}
                    >
                      {value.skillLevel}
                    </m.output>
                  </AnimatePresence>
                </label>
                <input
                  id="skill-level"
                  name="skill-level"
                  type="range"
                  min="0"
                  max="6"
                  step="1"
                  value={value.skillLevel}
                  onChange={(event) => update({ skillLevel: Number(event.target.value) })}
                  disabled={disabled}
                />
                <label htmlFor="check-difficulty">判定难度</label>
                <select
                  id="check-difficulty"
                  name="check-difficulty"
                  value={value.difficulty}
                  onChange={(event) => update({ difficulty: Number(event.target.value) as CheckRequest["difficulty"] })}
                  disabled={disabled}
                >
                  {CHECK_DIFFICULTIES.map((difficulty) => (
                    <option key={difficulty.value} value={difficulty.value}>
                      {difficulty.label} · {difficulty.value}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="check-readout">
              <div className="chance-readout">
                <span>估算成功率</span>
                <AnimatePresence initial={false} mode="popLayout">
                  <m.strong
                    key={chance.toFixed(1)}
                    initial={reduceMotion ? false : { opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, y: -3 }}
                    transition={{
                      duration: reduceMotion ? 0.08 : MOTION_DURATION.fast,
                      ease: MOTION_EASE.enter,
                    }}
                  >
                    {chance.toFixed(1)}%
                  </m.strong>
                </AnimatePresence>
                <small>枚举 36 种骰点，双一必败、双六必胜。</small>
              </div>
              <DicePair state={diceState} result={result} />
              {result ? <CheckResult result={result} /> : (
                <p className="check-rule">投掷 2D6 + 等级；合计达到难度即通过。</p>
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </m.section>
  );
}
