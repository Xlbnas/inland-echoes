import type { CheckResult } from "@/lib/checks-shared";
import type { DiceState } from "@/hooks/useRewriteStream";

export function DicePair({ state, result }: { state: DiceState; result: CheckResult | null }) {
  const values = state === "resolved" && result ? result.dice : [null, null];
  return (
    <div className={`dice-pair ${state}`} aria-hidden="true" data-testid="dice-pair">
      {values.map((value, index) => (
        <span className="die-shell" key={index}>
          <span className="die-face" data-die={value ?? undefined}>
            {value ?? "·"}
          </span>
        </span>
      ))}
    </div>
  );
}
