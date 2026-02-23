import { describe, it, expect, beforeEach, vi } from "vitest";

const mockCreate = vi.fn();

vi.mock("openai", () => {
  const MockOpenAI = vi.fn(function () {
    return { chat: { completions: { create: mockCreate } } };
  });
  return { default: MockOpenAI };
});

import OpenAI from "openai";
import { createCopilotProvider, clearCopilotProvider } from "./copilotProvider";

describe("copilotProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCopilotProvider();
  });

  describe("createCopilotProvider", () => {
    it("creates OpenAI client with GitHub Models baseURL and custom headers", () => {
      createCopilotProvider("ghp_test123", "openai/gpt-4o-mini");

      expect(OpenAI).toHaveBeenCalledWith({
        apiKey: "ghp_test123",
        baseURL: "https://models.github.ai/inference",
        defaultHeaders: { "X-GitHub-Api-Version": "2022-11-28" },
        dangerouslyAllowBrowser: true,
      });
    });
  });

  describe("complete", () => {
    it("calls chat.completions.create with correct model and messages", async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: "Hello!" } }],
      });

      const provider = createCopilotProvider("ghp_test123", "openai/gpt-4o-mini");
      const result = await provider.complete({
        systemPrompt: "You are helpful",
        userContent: "Hi",
      });

      expect(result).toBe("Hello!");
      expect(mockCreate).toHaveBeenCalledWith({
        model: "openai/gpt-4o-mini",
        max_tokens: 1024,
        messages: [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "Hi" },
        ],
      });
    });

    it("uses custom maxTokens when provided", async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: "OK" } }],
      });

      const provider = createCopilotProvider("ghp_test123", "openai/gpt-4o-mini");
      await provider.complete({
        systemPrompt: "sys",
        userContent: "user",
        maxTokens: 2048,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: 2048 }),
      );
    });

    it("returns empty string when no content in response", async () => {
      mockCreate.mockResolvedValue({ choices: [{ message: { content: null } }] });

      const provider = createCopilotProvider("ghp_test123", "openai/gpt-4o-mini");
      const result = await provider.complete({
        systemPrompt: "sys",
        userContent: "user",
      });

      expect(result).toBe("");
    });
  });

  describe("testConnection", () => {
    it("returns true on successful completion", async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: "hi" } }],
      });

      const provider = createCopilotProvider("ghp_test123", "openai/gpt-4o-mini");
      expect(await provider.testConnection()).toBe(true);
    });

    it("returns false when completion throws", async () => {
      mockCreate.mockRejectedValue(new Error("Unauthorized"));

      const provider = createCopilotProvider("ghp_test123", "openai/gpt-4o-mini");
      expect(await provider.testConnection()).toBe(false);
    });
  });

  describe("factory caching", () => {
    it("reuses client for same API key", () => {
      createCopilotProvider("ghp_test123", "openai/gpt-4o-mini");
      createCopilotProvider("ghp_test123", "openai/gpt-4o");

      expect(OpenAI).toHaveBeenCalledTimes(1);
    });

    it("creates new client when API key changes", () => {
      createCopilotProvider("ghp_test123", "openai/gpt-4o-mini");
      createCopilotProvider("ghp_different", "openai/gpt-4o-mini");

      expect(OpenAI).toHaveBeenCalledTimes(2);
    });

    it("creates new client after clearCopilotProvider", () => {
      createCopilotProvider("ghp_test123", "openai/gpt-4o-mini");
      clearCopilotProvider();
      createCopilotProvider("ghp_test123", "openai/gpt-4o-mini");

      expect(OpenAI).toHaveBeenCalledTimes(2);
    });
  });
});
