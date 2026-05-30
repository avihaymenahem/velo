import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AiProviderClient, AiCompletionRequest } from "../types";
import { createProviderFactory } from "../providerFactory";

const factory = createProviderFactory(
  (apiKey) => new GoogleGenerativeAI(apiKey),
);

export function createGeminiProvider(apiKey: string, modelId: string): AiProviderClient {
  const client = factory.getClient(apiKey);

  return {
    async complete(req: AiCompletionRequest): Promise<string> {
      const model = client.getGenerativeModel({
        model: modelId,
        systemInstruction: req.systemPrompt,
      });

      if (req.conversationHistory?.length) {
        const chat = model.startChat({
          history: req.conversationHistory.map((m) => ({
            role: m.role === "user" ? "user" : "model",
            parts: [{ text: m.content }],
          })),
        });
        const result = await chat.sendMessage(req.userContent);
        return result.response.text();
      }

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
