import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AiProviderClient, AiCompletionRequest } from "../types";
import { DEFAULT_MODELS } from "../types";

let clientInstance: GoogleGenerativeAI | null = null;
let currentKey: string | null = null;

export function createGeminiProvider(apiKey: string): AiProviderClient {
  if (!clientInstance || currentKey !== apiKey) {
    clientInstance = new GoogleGenerativeAI(apiKey);
    currentKey = apiKey;
  }

  const client = clientInstance;

  return {
    async complete(req: AiCompletionRequest): Promise<string> {
      const model = client.getGenerativeModel({
        model: DEFAULT_MODELS.gemini,
        systemInstruction: req.systemPrompt,
      });

      const result = await model.generateContent(req.userContent);
      return result.response.text();
    },

    async testConnection(): Promise<boolean> {
      try {
        const model = client.getGenerativeModel({
          model: DEFAULT_MODELS.gemini,
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
  clientInstance = null;
  currentKey = null;
}
