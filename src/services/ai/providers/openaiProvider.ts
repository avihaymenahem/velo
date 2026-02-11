import OpenAI from "openai";
import type { AiProviderClient, AiCompletionRequest } from "../types";
import { DEFAULT_MODELS } from "../types";

let clientInstance: OpenAI | null = null;
let currentKey: string | null = null;

export function createOpenAIProvider(apiKey: string): AiProviderClient {
  if (!clientInstance || currentKey !== apiKey) {
    clientInstance = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true,
    });
    currentKey = apiKey;
  }

  const client = clientInstance;

  return {
    async complete(req: AiCompletionRequest): Promise<string> {
      const response = await client.chat.completions.create({
        model: DEFAULT_MODELS.openai,
        max_tokens: req.maxTokens ?? 1024,
        messages: [
          { role: "system", content: req.systemPrompt },
          { role: "user", content: req.userContent },
        ],
      });

      return response.choices[0]?.message?.content ?? "";
    },

    async testConnection(): Promise<boolean> {
      try {
        await client.chat.completions.create({
          model: DEFAULT_MODELS.openai,
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

export function clearOpenAIProvider(): void {
  clientInstance = null;
  currentKey = null;
}
