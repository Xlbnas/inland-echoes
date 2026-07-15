export const CHECK_SKILL_IDS = [
  "logic",
  "empathy",
  "intuition",
  "composure",
  "reaction",
  "imagination",
] as const;

export type CheckSkillId = (typeof CHECK_SKILL_IDS)[number];

export const CHECK_OUTCOMES = [
  "critical_failure",
  "failure",
  "success",
  "critical_success",
] as const;

export type CheckOutcome = (typeof CHECK_OUTCOMES)[number];

export const CHECK_DIFFICULTIES = [
  { value: 6, label: "寻常" },
  { value: 8, label: "需要留神" },
  { value: 10, label: "棘手" },
  { value: 12, label: "艰难" },
  { value: 14, label: "严酷" },
  { value: 16, label: "近乎不可能" },
] as const;

export type CheckDifficulty = (typeof CHECK_DIFFICULTIES)[number]["value"];

export type CheckRequest = {
  enabled: boolean;
  skill: CheckSkillId;
  skillLevel: number;
  difficulty: CheckDifficulty;
};

export type CheckResult = {
  skill: CheckSkillId;
  skillLevel: number;
  difficulty: CheckDifficulty;
  dice: readonly [number, number];
  total: number;
  margin: number;
  outcome: CheckOutcome;
};

export const DEFAULT_CHECK_REQUEST: CheckRequest = {
  enabled: false,
  skill: "intuition",
  skillLevel: 3,
  difficulty: 10,
};

type SkillDefinition = {
  id: CheckSkillId;
  label: string;
  successDirection: string;
  failureDirection: string;
  mock: Record<CheckOutcome, string>;
};

export const CHECK_SKILLS: readonly SkillDefinition[] = [
  {
    id: "logic",
    label: "逻辑",
    successDirection: "准确梳理原因、结构与线索之间的关系，表达克制而有用。",
    failureDirection: "陷入过度分析与自我反驳，让推理显得可疑，但只把误读写成主观活动。",
    mock: {
      critical_failure: "【逻辑：灾难性误判】每个因果都长出第二个反证，思绪几乎把自己审讯到失语。",
      failure: "【逻辑：未通过】解释越搭越高，底下那块事实反而开始晃动。",
      success: "【逻辑：通过】先辨认结构，再让原因沿着证据站稳。",
      critical_success: "【逻辑：极佳通过】杂音退开，因果的骨架清楚得近乎冷酷。",
    },
  },
  {
    id: "empathy",
    label: "共情",
    successDirection: "捕捉细微而可信的情绪变化，不替当事人宣判内心。",
    failureDirection: "出现投射与猜疑，并让叙述者意识到这可能只是自己的感受。",
    mock: {
      critical_failure: "【共情：灾难性误判】别人的沉默被擅自填满，直到叙述者听见自己的回声冒充答案。",
      failure: "【共情：未通过】那点情绪像是对方的，也可能只是你把旧伤投在了上面。",
      success: "【共情：通过】语气里最轻的一次停顿，也被温和地留了下来。",
      critical_success: "【共情：极佳通过】无需替谁解释，细微的迟疑已经把边界说得很清楚。",
    },
  },
  {
    id: "intuition",
    label: "直觉",
    successDirection: "写出克制、可信的潜台词，让感觉指向文本已有的细节。",
    failureDirection: "浮现不可靠的预感，并明确它只是叙述者的主观猜测。",
    mock: {
      critical_failure: "【直觉：灾难性误判】预感猛地越过证据，随即被叙述者按回一句不可信的自白。",
      failure: "【直觉：未通过】有什么似乎不对——也可能只是疲惫在替世界配音。",
      success: "【直觉：通过】没有结论，只有一个与细节吻合的低声提示。",
      critical_success: "【直觉：极佳通过】潜台词从缝隙里显形，锋利，却没有多知道任何事。",
    },
  },
  {
    id: "composure",
    label: "镇定",
    successDirection: "保持克制、清楚与稳定，让情绪存在但不淹没叙述。",
    failureDirection: "显出防御、犹疑或短暂失态，随后让叙述者尝试收束。",
    mock: {
      critical_failure: "【镇定：灾难性误判】防线在一句话里失守，慌乱露面，又被仓促塞回标点之后。",
      failure: "【镇定：未通过】声音维持着平稳，只有那次多余的停顿背叛了它。",
      success: "【镇定：通过】情绪被承认，却没有取得方向盘。",
      critical_success: "【镇定：极佳通过】每句话都站得很稳，连沉默也守住了边界。",
    },
  },
  {
    id: "reaction",
    label: "反应",
    successDirection: "用敏锐节奏和直接观察迅速抓住文本已有的变化。",
    failureDirection: "让洞见迟到、节奏断裂，或在事后才拼起原本就有的线索。",
    mock: {
      critical_failure: "【反应：灾难性误判】思绪扑向错误的节拍，真正的变化过去后才传来回声。",
      failure: "【反应：未通过】你慢了半拍，于是句子在洞见抵达前先断了一次。",
      success: "【反应：通过】变化刚出现，观察便干净利落地跟了上去。",
      critical_success: "【反应：极佳通过】节奏像快门合拢，准确截住已经发生的那一瞬。",
    },
  },
  {
    id: "imagination",
    label: "想象",
    successDirection: "使用准确、鲜明且受控的意象，为原有事实增加质感。",
    failureDirection: "让隐喻短暂失控，随后由叙述者收回，不让意象变成新事实。",
    mock: {
      critical_failure: "【想象：灾难性误判】隐喻忽然夺门而出，叙述者追上它，删掉了差点冒充事实的部分。",
      failure: "【想象：未通过】比喻跑得太远；等等，它只是比喻，把它带回来。",
      success: "【想象：通过】意象照亮原有细节，没有替现实添上一笔。",
      critical_success: "【想象：极佳通过】一个精准的画面亮起，又在越界之前安静熄灭。",
    },
  },
] as const;

export const CHECK_OUTCOME_LABELS: Record<CheckOutcome, string> = {
  critical_failure: "灾难性误判",
  failure: "未通过",
  success: "通过",
  critical_success: "极佳通过",
};

export function getCheckSkill(skill: CheckSkillId) {
  const definition = CHECK_SKILLS.find((item) => item.id === skill);
  if (!definition) throw new Error("未知的认知频道");
  return definition;
}

export function getDifficultyLabel(difficulty: CheckDifficulty) {
  return CHECK_DIFFICULTIES.find((item) => item.value === difficulty)?.label ?? String(difficulty);
}

export function resolveCheckOutcome(
  dieOne: number,
  dieTwo: number,
  total: number,
  difficulty: number,
): CheckOutcome {
  if (dieOne === 1 && dieTwo === 1) return "critical_failure";
  if (dieOne === 6 && dieTwo === 6) return "critical_success";
  return total >= difficulty ? "success" : "failure";
}

export function calculateSuccessChance(skillLevel: number, difficulty: number) {
  let successes = 0;
  for (let dieOne = 1; dieOne <= 6; dieOne += 1) {
    for (let dieTwo = 1; dieTwo <= 6; dieTwo += 1) {
      const total = dieOne + dieTwo + skillLevel;
      const outcome = resolveCheckOutcome(dieOne, dieTwo, total, difficulty);
      if (outcome === "success" || outcome === "critical_success") successes += 1;
    }
  }
  return (successes / 36) * 100;
}
