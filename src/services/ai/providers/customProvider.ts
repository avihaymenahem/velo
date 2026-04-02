import OpenAI from "openai";
import { fetch } from "@tauri-apps/plugin-http";
import type { AiProviderClient, AiCompletionRequest, AiTestResult } from "../types";

let instance: OpenAI | null = null;
let cachedKey: string | null = null;

function getClient(apiKey: string, baseUrl: string): OpenAI {
  const cacheKey = `${apiKey}|${baseUrl}`;
  if (!instance || cachedKey !== cacheKey) {
    instance = new OpenAI({
      apiKey,
      baseURL: baseUrl.replace(/\/+$/, ""),
      dangerouslyAllowBrowser: true,
      fetch,
    });
    cachedKey = cacheKey;
  }
  return instance;
}

export function createCustomProvider(apiKey: string, baseUrl: string, model: string): AiProviderClient {
  const client = getClient(apiKey, baseUrl);

  return {
    async complete(req: AiCompletionRequest): Promise<string> {
      const response = await client.chat.completions.create({
        model,
        max_tokens: req.maxTokens ?? 1024,
        messages: [
          { role: "system", content: req.systemPrompt },
          { role: "user", content: req.userContent },
        ],
      });

      return response.choices[0]?.message?.content ?? "";
    },

    async testConnection(): Promise<AiTestResult> {
      try {
        await client.chat.completions.create({
          model,
          max_tokens: 10,
          messages: [{ role: "user", content: "Say hi" }],
        });
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
      }
    },
  };
}

export function clearCustomProvider(): void {
  instance = null;
  cachedKey = null;
}
