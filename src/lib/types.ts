import type { CheckResult } from "./checks-shared";
import type { RecommendedSiliconFlowModel } from "./siliconflow-models";

export const STYLE_IDS = [
  "psycho_noir",
  "dark_humor",
  "inner_monologue",
  "lyrical",
] as const;

export type StyleId = (typeof STYLE_IDS)[number];

export type PublicProvider = {
  id: string;
  label: string;
  model: string;
  configured: boolean;
  builtin: boolean;
  note: string;
  capabilities?: {
    selectableModel?: boolean;
    customModelAllowed?: boolean;
    customModelRequiresUserKey?: boolean;
    recommendedModels?: RecommendedSiliconFlowModel[];
  };
};

export type ProviderCapabilities = {
  customProvidersEnabled: boolean;
};

export type ProviderRequest = {
  id: string;
  label: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

export type RewriteEvent =
  | { type: "check_resolved"; result: CheckResult }
  | { type: "provider_start"; providerId: string; label: string }
  | { type: "provider_delta"; providerId: string; delta: string }
  | { type: "provider_done"; providerId: string }
  | { type: "provider_error"; providerId: string; message: string; code?: string };

export type ProviderOutput = {
  label: string;
  generation: number;
  receivedText: string;
  networkDone: boolean;
  status: "idle" | "streaming" | "done" | "error" | "stopped";
  error?: string;
};
