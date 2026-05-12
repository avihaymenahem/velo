import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AiProviderClient, AiCompletionRequest } from "../types";
import { createProviderFactory } from "../providerFactory";

const factory = createProviderFactory(
  (apiKey) => new GoogleGenerativeAI(apiKey),
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

export function createGeminiProvider(apiKey: string, modelId: string, aiLanguage = "auto"): AiProviderClient {
  const client = factory.getClient(apiKey);

  return {
    async complete(req: AiCompletionRequest): Promise<string> {
      const systemPrompt = buildSystemPrompt(req.systemPrompt, aiLanguage);
      const model = client.getGenerativeModel({
        model: modelId,
        systemInstruction: systemPrompt,
      });

      const result = await model.generateContent(req.userContent);
      return result.response.text();
    },

    async testConnection(): Promise<boolean> {
      try {
        const model = client.getGenerativeModel({
          model: modelId,
        });
        await model.generateContent("Say hi");
        return true;
      } catch {
        return false;
      }
    },
  };
}

export function clearGeminiProvider(): void {
  factory.clear();
}
