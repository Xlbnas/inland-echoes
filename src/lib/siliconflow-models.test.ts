import { afterEach, describe, expect, it } from "vitest";
import { getRecommendedSiliconFlowModels, isRecommendedSiliconFlowModel, isValidSiliconFlowModelId } from "./siliconflow-models";

afterEach(() => {
  delete process.env.SILICONFLOW_RECOMMENDED_MODELS_JSON;
  delete process.env.SILICONFLOW_MODEL;
});

describe("SiliconFlow model catalog", () => {
  it("解析经过 Zod 校验的推荐目录", () => {
    process.env.SILICONFLOW_RECOMMENDED_MODELS_JSON = JSON.stringify([{
      id: "vendor/model-a", label: "质量候选", profile: "quality", description: "项目实测候选",
      strengths: ["事实保真"], cautions: ["响应较慢"], benchmarkStatus: "verified", verifiedAt: "2026-07-15T00:00:00.000Z",
    }]);
    expect(getRecommendedSiliconFlowModels()[0]).toMatchObject({ id: "vendor/model-a", benchmarkStatus: "verified" });
    expect(isRecommendedSiliconFlowModel("vendor/model-a")).toBe(true);
  });

  it("非法 JSON 安全回退到部署默认候选", () => {
    process.env.SILICONFLOW_MODEL = "vendor/default";
    process.env.SILICONFLOW_RECOMMENDED_MODELS_JSON = "not-json";
    expect(getRecommendedSiliconFlowModels()).toEqual([expect.objectContaining({ id: "vendor/default", benchmarkStatus: "candidate" })]);
  });

  it.each(["", "https://example.com/model", "model name", "../model", "model?x", "model#x"])(
    "拒绝非法模型 ID：%s",
    (model) => expect(isValidSiliconFlowModelId(model)).toBe(false),
  );
});
