import Anthropic from "@anthropic-ai/sdk";
import type { AiProviderClient, AiCompletionRequest } from "../types";
import { AiError } from "../errors";
import { createProviderFactory } from "../providerFactory";

export type ClaudeAgentMessage = Anthropic.Messages.MessageParam;
export type ClaudeTool = Anthropic.Messages.Tool;
export interface ClaudeToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}
export interface ClaudeAgentResponse {
  text?: string;
  toolCalls?: ClaudeToolCall[];
  stopReason: "end_turn" | "tool_use" | "max_tokens";
  contentBlocks: Anthropic.Messages.ContentBlock[];
}

const factory = createProviderFactory(
  (apiKey) => new Anthropic({ apiKey, dangerouslyAllowBrowser: true }),
);

export interface ClaudeProviderClient extends AiProviderClient {
  completeWithTools(
    systemPrompt: string,
    messages: ClaudeAgentMessage[],
    tools: ClaudeTool[],
    maxTokens?: number,
  ): Promise<ClaudeAgentResponse>;
}

export function createClaudeProvider(apiKey: string, model: string): ClaudeProviderClient {
  const client = factory.getClient(apiKey);

  return {
    async complete(req: AiCompletionRequest): Promise<string> {
      const response = await client.messages.create({
        model,
        max_tokens: req.maxTokens ?? 1024,
        system: req.systemPrompt,
        messages: [{ role: "user", content: req.userContent }],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      return textBlock?.text ?? "";
    },

    async completeWithTools(
      systemPrompt: string,
      messages: ClaudeAgentMessage[],
      tools: ClaudeTool[],
      maxTokens = 4096,
    ): Promise<ClaudeAgentResponse> {
      try {
        const response = await client.messages.create({
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages,
          tools,
        });
        const text =
          response.content
            .filter((b) => b.type === "text")
            .map((b) => (b as Anthropic.Messages.TextBlock).text)
            .join("\n")
            .trim() || undefined;
        const toolCalls = response.content
          .filter((b) => b.type === "tool_use")
          .map((b) => {
            const tb = b as Anthropic.Messages.ToolUseBlock;
            return {
              id: tb.id,
              name: tb.name,
              input: tb.input as Record<string, unknown>,
            };
          });
        return {
          text,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          stopReason: response.stop_reason as
            | "end_turn"
            | "tool_use"
            | "max_tokens",
          contentBlocks: response.content,
        };
      } catch (err) {
        if (err instanceof AiError) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("401") || msg.includes("authentication")) {
          throw new AiError("AUTH_ERROR", msg);
        }
        if (msg.includes("429") || msg.includes("rate")) {
          throw new AiError("RATE_LIMITED", msg);
        }
        throw new AiError("NETWORK_ERROR", msg);
      }
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
