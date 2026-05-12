import type { AiProviderClient, AiCompletionRequest } from "../types";

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

interface ChatCompletionRequest {
  model: string;
  messages: { role: string; content: string }[];
  max_tokens?: number;
  stream?: boolean;
}

interface ChatCompletionResponse {
  choices: {
    message: { content: string };
  }[];
}

export function createCustomProvider(
  baseUrl: string,
  apiKey: string,
  model: string,
  aiLanguage = "auto",
): AiProviderClient {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

  async function chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const response = await fetch(`${normalizedBaseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(req),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Custom AI provider error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  return {
    async complete(req: AiCompletionRequest): Promise<string> {
      const systemPrompt = buildSystemPrompt(req.systemPrompt, aiLanguage);
      const messages: { role: string; content: string }[] = [];

      if (systemPrompt) {
        messages.push({ role: "system", content: systemPrompt });
      }
      messages.push({ role: "user", content: req.userContent });

      const response = await chatCompletion({
        model,
        messages,
        max_tokens: req.maxTokens ?? 1024,
      });

      return response.choices[0]?.message?.content ?? "";
    },

    async testConnection(): Promise<boolean> {
      try {
        const response = await chatCompletion({
          model,
          messages: [{ role: "user", content: "Say hi" }],
          max_tokens: 10,
        });
        return !!response.choices[0]?.message?.content;
      } catch {
        return false;
      }
    },
  };
}


