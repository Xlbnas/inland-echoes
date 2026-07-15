import {
  CHECK_OUTCOME_LABELS,
  getCheckSkill,
  getDifficultyLabel,
  type CheckResult as CheckResultValue,
} from "@/lib/checks-shared";

export function CheckResult({ result }: { result: CheckResultValue }) {
  const isCritical = result.outcome === "critical_failure" || result.outcome === "critical_success";
  const isSuccess = result.outcome === "success" || result.outcome === "critical_success";
  const detail = result.outcome === "critical_failure"
    ? "双一触发：无视合计，判定为灾难性误判。"
    : result.outcome === "critical_success"
      ? "双六触发：无视难度，判定为极佳通过。"
      : `与难度相差 ${Math.abs(result.margin)} 点。`;

  return (
    <section
      className={`check-result ${isSuccess ? "success" : "failure"} ${isCritical ? "critical" : ""}`}
      aria-live="polite"
      aria-atomic="true"
      data-testid="check-result"
    >
      <div className="check-result-heading">
        <span>{getCheckSkill(result.skill).label} · 等级 {result.skillLevel}</span>
        <strong>{CHECK_OUTCOME_LABELS[result.outcome]}</strong>
      </div>
      <p className="check-formula">
        <b>{result.dice[0]}</b> + <b>{result.dice[1]}</b> + {result.skillLevel} = {result.total}
        <span>难度 {getDifficultyLabel(result.difficulty)} · {result.difficulty}</span>
      </p>
      <p className="check-explanation">{detail}</p>
    </section>
  );
}
