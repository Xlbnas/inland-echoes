"use client";

import { m, useReducedMotion } from "motion/react";
import type { CheckResult } from "@/lib/checks-shared";
import type { DiceState } from "@/hooks/useRewriteStream";
import { MOTION_DURATION, MOTION_EASE } from "@/lib/motion";

export function DicePair({ state, result }: { state: DiceState; result: CheckResult | null }) {
  const reduceMotion = useReducedMotion();
  const values = state === "resolved" && result ? result.dice : [null, null];

  return (
    <div
      className={`dice-pair ${state}`}
      aria-hidden="true"
      data-testid="dice-pair"
      data-state={state}
    >
      {values.map((value, index) => (
        <span className="die-shell" key={index}>
          <m.span
            className="die-face"
            data-die={value ?? undefined}
            key={`${index}-${value ?? "idle"}`}
            initial={reduceMotion || value === null ? false : { opacity: 0, y: -2, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              duration: reduceMotion ? 0 : MOTION_DURATION.fast,
              delay: reduceMotion ? 0 : index * 0.085,
              ease: MOTION_EASE.enter,
            }}
          >
            {value ?? "·"}
          </m.span>
        </span>
      ))}
    </div>
  );
}
