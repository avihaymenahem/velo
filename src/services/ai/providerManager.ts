import { getSetting, getSecureSetting } from "@/services/db/settings";
import { AiError } from "./errors";
import type { AiProvider, AiProviderClient } from "./types";
import { DEFAULT_MODELS, MODEL_SETTINGS } from "./types";
import { createClaudeProvider, clearClaudeProvider } from "./providers/claudeProvider";
import { createOpenAIProvider, clearOpenAIProvider } from "./providers/openaiProvider";
import { createGeminiProvider, clearGeminiProvider } from "./providers/geminiProvider";
import { createOllamaProvider, clearOllamaProvider } from "./providers/ollamaProvider";
import { createCopilotProvider, clearCopilotProvider } from "./providers/copilotProvider";
import { createCustomProvider } from "./providers/customProvider";

const API_KEY_SETTINGS: Record<Exclude<AiProvider, "ollama" | "custom">, string> = {
  claude: "claude_api_key",
  openai: "openai_api_key",
  gemini: "gemini_api_key",
  copilot: "copilot_api_key",
};

let cachedProvider: { name: AiProvider; key: string; client: AiProviderClient } | null = null;

export async function getActiveProviderName(): Promise<AiProvider> {
  const setting = await getSetting("ai_provider");
  if (setting === "openai" || setting === "gemini" || setting === "ollama" || setting === "copilot") return setting;
  if (setting === "custom") {
    const apiKey = await getSecureSetting("custom_api_key");
    if (apiKey) return "custom";
  }
  return "claude";
}

export async function getActiveProvider(): Promise<AiProviderClient> {
  const providerName = await getActiveProviderName();
  const aiLanguage = (await getSetting("ai_language")) ?? "auto";

  if (providerName === "ollama") {
    const serverUrl = (await getSetting("ollama_server_url")) ?? "http://localhost:11434";
    const model = (await getSetting("ollama_model")) ?? "llama3.2";
    const cacheKey = `${serverUrl}|${model}|${aiLanguage}`;

    if (cachedProvider && cachedProvider.name === "ollama" && cachedProvider.key === cacheKey) {
      return cachedProvider.client;
    }

    const client = createOllamaProvider(serverUrl, model, aiLanguage);
    cachedProvider = { name: "ollama", key: cacheKey, client };
    return client;
  }

  if (providerName === "custom") {
    const baseUrl = (await getSetting("custom_base_url")) ?? "https://api.openai.com/v1";
    const apiKey = await getSecureSetting("custom_api_key");
    if (!apiKey) {
      throw new AiError("NOT_CONFIGURED", "Custom AI provider API key not configured");
    }
    const model = (await getSetting("custom_model")) ?? "gpt-4o-mini";
    const cacheKey = `${baseUrl}|${apiKey}|${model}|${aiLanguage}`;

    if (cachedProvider && cachedProvider.name === "custom" && cachedProvider.key === cacheKey) {
      return cachedProvider.client;
    }

    const client = createCustomProvider(baseUrl, apiKey, model, aiLanguage);
    cachedProvider = { name: "custom", key: cacheKey, client };
    return client;
  }

  const keySetting = API_KEY_SETTINGS[providerName];
  const apiKey = await getSecureSetting(keySetting);

  if (!apiKey) {
    throw new AiError("NOT_CONFIGURED", `${providerName} API key not configured`);
  }

  const model = (await getSetting(MODEL_SETTINGS[providerName])) ?? DEFAULT_MODELS[providerName];
  const cacheKey = `${apiKey}|${model}|${aiLanguage}`;

  if (cachedProvider && cachedProvider.name === providerName && cachedProvider.key === cacheKey) {
    return cachedProvider.client;
  }

  let client: AiProviderClient;
  switch (providerName) {
    case "claude":
      client = createClaudeProvider(apiKey, model, aiLanguage);
      break;
    case "openai":
      client = createOpenAIProvider(apiKey, model, aiLanguage);
      break;
    case "gemini":
      client = createGeminiProvider(apiKey, model, aiLanguage);
      break;
    case "copilot":
      client = createCopilotProvider(apiKey, model, aiLanguage);
      break;
  }

  cachedProvider = { name: providerName, key: cacheKey, client };
  return client;
}

export async function isAiAvailable(): Promise<boolean> {
  try {
    const enabled = await getSetting("ai_enabled");
    if (enabled === "false") return false;
    const providerName = await getActiveProviderName();

    if (providerName === "ollama") {
      const serverUrl = await getSetting("ollama_server_url");
      return !!serverUrl;
    }

    if (providerName === "custom") {
      const key = await getSecureSetting("custom_api_key");
      return !!key;
    }

    const keySetting = API_KEY_SETTINGS[providerName];
    const key = await getSecureSetting(keySetting);
    return !!key;
  } catch {
    return false;
  }
}

export function clearProviderClients(): void {
  cachedProvider = null;
  clearClaudeProvider();
  clearOpenAIProvider();
  clearGeminiProvider();
  clearOllamaProvider();
  clearCopilotProvider();
}
