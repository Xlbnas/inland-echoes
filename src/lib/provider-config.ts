import type {
  ProviderCapabilities,
  ProviderRequest,
  PublicProvider,
} from "./types";
import { validateSafeProviderUrl } from "./safe-provider-url";

type ProviderConfig = {
  id: string;
  label: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  mock?: boolean;
  custom: boolean;
};

const builtinProviders = {
  mock: {
    id: "mock",
    label: "本地演示",
    model: "deterministic-mock",
    baseUrl: "mock://local",
    apiKey: "mock",
    mock: true,
    custom: false,
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    custom: false,
  },
  qwen: {
    id: "qwen",
    label: "通义千问",
    model: process.env.QWEN_MODEL || "qwen-plus",
    baseUrl:
      process.env.QWEN_BASE_URL ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKey: process.env.QWEN_API_KEY || "",
    custom: false,
  },
  siliconflow: {
    id: "siliconflow",
    label: "SiliconFlow",
    model: process.env.SILICONFLOW_MODEL || "deepseek-ai/DeepSeek-V4-Flash",
    baseUrl: process.env.SILICONFLOW_BASE_URL || "https://api.siliconflow.cn/v1",
    apiKey: process.env.SILICONFLOW_API_KEY || "",
    custom: false,
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    apiKey: process.env.OPENAI_API_KEY || "",
    custom: false,
  },
} satisfies Record<string, ProviderConfig>;

export class ProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigurationError";
  }
}

export function getProviderCapabilities(): ProviderCapabilities {
  return {
    customProvidersEnabled: process.env.CUSTOM_PROVIDERS_ENABLED === "true",
  };
}

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
      throw new ProviderConfigurationError(`${builtin.label} 尚未配置 API Key`);
    }
    return { ...builtin, apiKey };
  }

  if (!getProviderCapabilities().customProvidersEnabled) {
    throw new ProviderConfigurationError("当前部署未启用自定义模型线路");
  }

  if (!request.baseUrl || !request.model || !request.apiKey) {
    throw new ProviderConfigurationError("自定义供应商需要 Base URL、模型名称和 API Key");
  }

  return {
    id: request.id,
    label: request.label,
    model: request.model,
    baseUrl: validateSafeProviderUrl(request.baseUrl).toString().replace(/\/$/u, ""),
    apiKey: request.apiKey,
    custom: true,
  };
}

export function validateProviderRequests(requests: ProviderRequest[]) {
  requests.forEach(resolveProvider);
}
