import OpenAI from "openai";
import { fetch } from "@tauri-apps/plugin-http";
import type { AiProviderClient, AiCompletionRequest } from "../types";

let instance: OpenAI | null = null;
let cachedKey: string | null = null;

function validateOllamaUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Only http and https are allowed");
    }
    return url;
  } catch (err) {
    throw new Error(`Invalid server URL: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function getClient(serverUrl: string, model: string): OpenAI {
  const safeUrl = validateOllamaUrl(serverUrl);
  const cacheKey = `${safeUrl}|${model}`;
  if (!instance || cachedKey !== cacheKey) {
    instance = new OpenAI({
      baseURL: `${safeUrl.replace(/\/+$/, "")}/v1`,
      apiKey: "ollama",
      dangerouslyAllowBrowser: true,
      fetch,
    });
    cachedKey = cacheKey;
  }
  return instance;
}

const LANGUAGE_MAP: Record<string, string> = {
  en: "English",
  fr: "French",
  ar: "Arabic",
};

function buildSystemPrompt(basePrompt: string, aiLanguage: string): string {
  if (aiLanguage === "auto") return basePrompt;
  const langName = LANGUAGE_MAP[aiLanguage];
  if (!langName) return basePrompt;
  return `${basePrompt}\n\nRespond in ${langName}.`;
}

export function createOllamaProvider(serverUrl: string, model: string, aiLanguage = "auto"): AiProviderClient {
  const client = getClient(serverUrl, model);

  return {
    async complete(req: AiCompletionRequest): Promise<string> {
      const systemPrompt = buildSystemPrompt(req.systemPrompt, aiLanguage);
      const response = await client.chat.completions.create({
        model,
        max_tokens: req.maxTokens ?? 1024,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: req.userContent },
        ],
      });

      return response.choices[0]?.message?.content ?? "";
    },

    async testConnection(): Promise<boolean> {
      try {
        await client.chat.completions.create({
          model,
          max_tokens: 10,
          messages: [{ role: "user", content: "Say hi" }],
        });
        return true;
      } catch {
        return false;
      }
    },
  };
}

export function clearOllamaProvider(): void {
  instance = null;
  cachedKey = null;
}
