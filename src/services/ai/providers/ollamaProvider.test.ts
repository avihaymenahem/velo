import { describe, it, expect, beforeEach, vi } from "vitest";

const mockCreate = vi.fn();

vi.mock("openai", () => {
  const MockOpenAI = vi.fn(function () {
    return { chat: { completions: { create: mockCreate } } };
  });
  return { default: MockOpenAI };
});

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: vi.fn(),
}));

import OpenAI from "openai";
import { createOllamaProvider, clearOllamaProvider } from "./ollamaProvider";

describe("ollamaProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearOllamaProvider();
  });

  describe("createOllamaProvider", () => {
    it("creates OpenAI client with custom baseURL and dummy API key", () => {
      createOllamaProvider("http://localhost:11434", "llama3.2");

      expect(OpenAI).toHaveBeenCalledWith({
        baseURL: "http://localhost:11434/v1",
        apiKey: "ollama",
        fetch: expect.any(Function),
      });
    });

    it("strips trailing slashes from server URL", () => {
      createOllamaProvider("http://localhost:11434///", "llama3.2");

      expect(OpenAI).toHaveBeenCalledWith({
        baseURL: "http://localhost:11434/v1",
        apiKey: "ollama",
        fetch: expect.any(Function),
      });
    });
  });

  describe("complete", () => {
    it("calls chat.completions.create with correct model and messages", async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: "Hello!" } }],
      });

      const provider = createOllamaProvider("http://localhost:11434", "llama3.2");
      const result = await provider.complete({
        systemPrompt: "You are helpful",
        userContent: "Hi",
      });

      expect(result).toBe("Hello!");
      expect(mockCreate).toHaveBeenCalledWith({
        model: "llama3.2",
        max_tokens: 1024,
        messages: [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "Hi" },
        ],
      });
    });

    it("returns empty string when no content in response", async () => {
      mockCreate.mockResolvedValue({ choices: [{ message: { content: null } }] });

      const provider = createOllamaProvider("http://localhost:11434", "llama3.2");
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

      const provider = createOllamaProvider("http://localhost:11434", "llama3.2");
      expect(await provider.testConnection()).toBe(true);
    });

    it("returns false when completion throws", async () => {
      mockCreate.mockRejectedValue(new Error("Connection refused"));

      const provider = createOllamaProvider("http://localhost:11434", "llama3.2");
      expect(await provider.testConnection()).toBe(false);
    });
  });

  describe("factory caching", () => {
    it("reuses client for same url+model", () => {
      createOllamaProvider("http://localhost:11434", "llama3.2");
      createOllamaProvider("http://localhost:11434", "llama3.2");

      expect(OpenAI).toHaveBeenCalledTimes(1);
    });

    it("creates new client when url changes", () => {
      createOllamaProvider("http://localhost:11434", "llama3.2");
      createOllamaProvider("http://localhost:1234", "llama3.2");

      expect(OpenAI).toHaveBeenCalledTimes(2);
    });

    it("creates new client when model changes", () => {
      createOllamaProvider("http://localhost:11434", "llama3.2");
      createOllamaProvider("http://localhost:11434", "mistral");

      expect(OpenAI).toHaveBeenCalledTimes(2);
    });

    it("creates new client after clearOllamaProvider", () => {
      createOllamaProvider("http://localhost:11434", "llama3.2");
      clearOllamaProvider();
      createOllamaProvider("http://localhost:11434", "llama3.2");

      expect(OpenAI).toHaveBeenCalledTimes(2);
    });
  });
});
