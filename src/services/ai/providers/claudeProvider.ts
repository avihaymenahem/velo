import Anthropic from "@anthropic-ai/sdk";
import type { AiProviderClient, AiCompletionRequest } from "../types";
import { createProviderFactory } from "../providerFactory";

const factory = createProviderFactory(
  (apiKey) => new Anthropic({ apiKey, dangerouslyAllowBrowser: true }),
);

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

export function createClaudeProvider(apiKey: string, model: string, aiLanguage = "auto"): AiProviderClient {
  const client = factory.getClient(apiKey);

  return {
    async complete(req: AiCompletionRequest): Promise<string> {
      const systemPrompt = buildSystemPrompt(req.systemPrompt, aiLanguage);
      const response = await client.messages.create({
        model,
        max_tokens: req.maxTokens ?? 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: req.userContent }],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      return textBlock?.text ?? "";
    },

    async testConnection(): Promise<boolean> {
      try {
        await client.messages.create({
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

export function clearClaudeProvider(): void {
  factory.clear();
}
