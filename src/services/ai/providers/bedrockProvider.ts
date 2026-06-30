import { fetch } from "@tauri-apps/plugin-http";
import type { AiProviderClient, AiCompletionRequest } from "../types";

/**
 * Amazon Bedrock provider.
 *
 * Bedrock serves Anthropic Claude models through the InvokeModel endpoint using
 * the standard Messages API request shape (plus `anthropic_version`). Auth uses a
 * Bedrock API key sent as a bearer token. The region is still required because it
 * is part of the endpoint host.
 *
 * The Bedrock runtime endpoint sends no CORS headers, so requests are routed
 * through the Tauri HTTP plugin (native request) — the same workaround the Ollama
 * provider uses for local servers.
 */

async function invoke(
  apiKey: string,
  region: string,
  model: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(model)}/invoke`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${text}`);
  }
  return res.json();
}

export function createBedrockProvider(
  apiKey: string,
  region: string,
  model: string,
): AiProviderClient {
  return {
    async complete(req: AiCompletionRequest): Promise<string> {
      const body: Record<string, unknown> = {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: req.maxTokens ?? 1024,
        messages: [{ role: "user", content: req.userContent }],
      };
      if (req.systemPrompt) body.system = req.systemPrompt;

      const data = (await invoke(apiKey, region, model, body)) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const textBlock = data.content?.find((b) => b.type === "text");
      return textBlock?.text ?? "";
    },

    async testConnection(): Promise<boolean> {
      try {
        await invoke(apiKey, region, model, {
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 10,
          messages: [{ role: "user", content: "Say hi" }],
        });
        return true;
      } catch (err) {
        console.error("[Bedrock] test connection failed:", err);
        return false;
      }
    },
  };
}

// Stateless provider (no SDK client to cache); kept for symmetry with the other
// providers' clear* functions. The provider-level cache lives in providerManager.
export function clearBedrockProvider(): void {}
