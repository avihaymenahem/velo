import OpenAI from "openai";
import { fetch } from "@tauri-apps/plugin-http";
import type { AiProviderClient, AiCompletionRequest } from "../types";

let instance: OpenAI | null = null;
let cachedKey: string | null = null;

function getClient(serverUrl: string, model: string): OpenAI {
  const cacheKey = `${serverUrl}|${model}`;
  if (!instance || cachedKey !== cacheKey) {
    instance = new OpenAI({
      baseURL: `${serverUrl.replace(/\/+$/, "")}/v1`,
      apiKey: "ollama",
      dangerouslyAllowBrowser: true,
      fetch,
    });
    cachedKey = cacheKey;
  }
  return instance;
}

export function createOllamaProvider(serverUrl: string, model: string): AiProviderClient {
  const client = getClient(serverUrl, model);

  return {
    async complete(req: AiCompletionRequest): Promise<string> {
      const params = {
        model,
        stream: false as const,
        max_tokens: req.maxTokens ?? 4096,
        messages: [
          { role: "system" as const, content: req.systemPrompt },
          { role: "user" as const, content: req.userContent },
        ],
      };
      // Spread think:false for Ollama thinking models (e.g. Qwen3) — not in OpenAI types
      const response = await client.chat.completions.create(
        { ...params, think: false } as typeof params,
      );
      const content = response.choices[0]?.message?.content ?? "";
      // Strip any residual <think> blocks (safety net if the model ignores think:false)
      return content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    },

    async testConnection(): Promise<boolean> {
      try {
        const baseUrl = serverUrl.replace(/\/+$/, "");
        const response = await fetch(`${baseUrl}/api/tags`, {
          method: "GET",
        });
        
        if (!response.ok) return false;
        
        const data = await response.json() as any;
        // Controllo flessibile: Ollama può restituire { models: [...] } o direttamente [...]
        return !!(data && (Array.isArray(data.models) || Array.isArray(data)));
      } catch (err) {
        console.error("Ollama connection test failed:", err);
        return false;
      }
    },
  };
}

export function clearOllamaProvider(): void {
  instance = null;
  cachedKey = null;
}
