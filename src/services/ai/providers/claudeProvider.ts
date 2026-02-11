import Anthropic from "@anthropic-ai/sdk";
import type { AiProviderClient, AiCompletionRequest } from "../types";
import { DEFAULT_MODELS } from "../types";

let clientInstance: Anthropic | null = null;
let currentKey: string | null = null;

export function createClaudeProvider(apiKey: string): AiProviderClient {
  if (!clientInstance || currentKey !== apiKey) {
    clientInstance = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true,
    });
    currentKey = apiKey;
  }

  const client = clientInstance;

  return {
    async complete(req: AiCompletionRequest): Promise<string> {
      const response = await client.messages.create({
        model: DEFAULT_MODELS.claude,
        max_tokens: req.maxTokens ?? 1024,
        system: req.systemPrompt,
        messages: [{ role: "user", content: req.userContent }],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      return textBlock?.text ?? "";
    },

    async testConnection(): Promise<boolean> {
      try {
        await client.messages.create({
          model: DEFAULT_MODELS.claude,
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

export function clearClaudeProvider(): void {
  clientInstance = null;
  currentKey = null;
}
