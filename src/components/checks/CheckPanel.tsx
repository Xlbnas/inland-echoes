import {
  CHECK_DIFFICULTIES,
  CHECK_SKILLS,
  calculateSuccessChance,
  type CheckRequest,
  type CheckResult as CheckResultValue,
} from "@/lib/checks-shared";
import type { DiceState } from "@/hooks/useRewriteStream";
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
  const chance = calculateSuccessChance(value.skillLevel, value.difficulty);
  const update = (next: Partial<CheckRequest>) => onChange({ ...value, ...next });

  return (
    <section className={`check-panel ${value.enabled ? "enabled" : "collapsed"}`} aria-labelledby="check-title">
      <header className="check-panel-header">
        <div>
          <span className="check-kicker">附页 / 认知检验单</span>
          <h2 id="check-title">2D6 认知频道判定</h2>
        </div>
        <button
          type="button"
          className="check-toggle"
          aria-pressed={value.enabled}
          onClick={() => update({ enabled: !value.enabled })}
          disabled={disabled}
        >
          <span aria-hidden="true" />
          {value.enabled ? "已启用" : "未启用"}
        </button>
      </header>

      {!value.enabled ? (
        <p className="check-collapsed-note">关闭时保持原有改写流程，不发送判定结果。</p>
      ) : (
        <div className="check-panel-body">
          <div className="check-controls">
            <fieldset disabled={disabled}>
              <legend>认知频道</legend>
              <div className="skill-grid">
                {CHECK_SKILLS.map((skill) => (
                  <button
                    key={skill.id}
                    type="button"
                    className={value.skill === skill.id ? "selected" : ""}
                    aria-pressed={value.skill === skill.id}
                    onClick={() => update({ skill: skill.id })}
                  >
                    {skill.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="check-numbers">
              <label htmlFor="skill-level">
                <span>频道等级</span>
                <output htmlFor="skill-level">{value.skillLevel}</output>
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
              <strong>{chance.toFixed(1)}%</strong>
              <small>枚举 36 种骰点，双一必败、双六必胜。</small>
            </div>
            <DicePair state={diceState} result={result} />
            {result ? <CheckResult result={result} /> : (
              <p className="check-rule">投掷 2D6 + 等级；合计达到难度即通过。</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
