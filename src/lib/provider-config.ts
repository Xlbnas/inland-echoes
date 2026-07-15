import type { ProviderRequest, PublicProvider } from "./types";
import { validateCustomBaseUrl } from "./validation";

type ProviderConfig = {
  id: string;
  label: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  mock?: boolean;
};

const builtinProviders = {
  mock: {
    id: "mock",
    label: "本地演示",
    model: "deterministic-mock",
    baseUrl: "mock://local",
    apiKey: "mock",
    mock: true,
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    apiKey: process.env.DEEPSEEK_API_KEY || "",
  },
  qwen: {
    id: "qwen",
    label: "通义千问",
    model: process.env.QWEN_MODEL || "qwen-plus",
    baseUrl:
      process.env.QWEN_BASE_URL ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKey: process.env.QWEN_API_KEY || "",
  },
  siliconflow: {
    id: "siliconflow",
    label: "SiliconFlow",
    model: process.env.SILICONFLOW_MODEL || "deepseek-ai/DeepSeek-V4-Flash",
    baseUrl: process.env.SILICONFLOW_BASE_URL || "https://api.siliconflow.cn/v1",
    apiKey: process.env.SILICONFLOW_API_KEY || "",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    apiKey: process.env.OPENAI_API_KEY || "",
  },
} satisfies Record<string, ProviderConfig>;

export function getPublicProviderCatalog(): PublicProvider[] {
  return [
    {
      id: "mock",
      label: "本地演示",
      model: builtinProviders.mock.model,
      configured: true,
      builtin: true,
      note: "无需密钥，用于体验和自动测试",
    },
    {
      id: "deepseek",
      label: "DeepSeek",
      model: builtinProviders.deepseek.model,
      configured: Boolean(builtinProviders.deepseek.apiKey),
      builtin: true,
      note: "OpenAI 兼容接口",
    },
    {
      id: "qwen",
      label: "通义千问",
      model: builtinProviders.qwen.model,
      configured: Boolean(builtinProviders.qwen.apiKey),
      builtin: true,
      note: "阿里云百炼，适合大陆部署",
    },
    {
      id: "siliconflow",
      label: "SiliconFlow",
      model: builtinProviders.siliconflow.model,
      configured: Boolean(builtinProviders.siliconflow.apiKey),
      builtin: true,
      note: "实测推荐：低成本多模型聚合接口",
    },
    {
      id: "openai",
      label: "OpenAI",
      model: builtinProviders.openai.model,
      configured: Boolean(builtinProviders.openai.apiKey),
      builtin: true,
      note: "仅在官方支持地区使用",
    },
  ];
}

export function resolveProvider(request: ProviderRequest): ProviderConfig {
  const builtin = builtinProviders[request.id as keyof typeof builtinProviders];
  if (builtin) {
    const apiKey = request.apiKey || builtin.apiKey;
    if (!apiKey) {
      throw new Error(`${builtin.label} 尚未配置 API Key`);
    }
    return { ...builtin, apiKey };
  }

  if (!request.baseUrl || !request.model || !request.apiKey) {
    throw new Error("自定义供应商需要 Base URL、模型名称和 API Key");
  }

  return {
    id: request.id,
    label: request.label,
    model: request.model,
    baseUrl: validateCustomBaseUrl(request.baseUrl),
    apiKey: request.apiKey,
  };
}
