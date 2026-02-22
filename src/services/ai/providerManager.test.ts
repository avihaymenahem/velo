import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/services/db/settings", () => {
  const fn = vi.fn();
  return {
    getSetting: fn,
    getSecureSetting: fn,
  };
});

import { createMockAiProvider } from "@/test/mocks";

vi.mock("./providers/claudeProvider", () => ({
  createClaudeProvider: vi.fn(() => createMockAiProvider("claude response")),
  clearClaudeProvider: vi.fn(),
}));

vi.mock("./providers/openaiProvider", () => ({
  createOpenAIProvider: vi.fn(() => createMockAiProvider("openai response")),
  clearOpenAIProvider: vi.fn(),
}));

vi.mock("./providers/geminiProvider", () => ({
  createGeminiProvider: vi.fn(() => createMockAiProvider("gemini response")),
  clearGeminiProvider: vi.fn(),
}));

vi.mock("./providers/ollamaProvider", () => ({
  createOllamaProvider: vi.fn(() => createMockAiProvider("ollama response")),
  clearOllamaProvider: vi.fn(),
}));

import { getSetting } from "@/services/db/settings";
import { createClaudeProvider, clearClaudeProvider } from "./providers/claudeProvider";
import { createOpenAIProvider } from "./providers/openaiProvider";
import { createGeminiProvider } from "./providers/geminiProvider";
import { createOllamaProvider } from "./providers/ollamaProvider";
import {
  getActiveProvider,
  getActiveProviderName,
  isAiAvailable,
  clearProviderClients,
} from "./providerManager";

const mockGetSetting = vi.mocked(getSetting);

describe("providerManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearProviderClients();
  });

  describe("getActiveProviderName", () => {
    it("defaults to claude when ai_provider is not set", async () => {
      mockGetSetting.mockResolvedValue(null);
      expect(await getActiveProviderName()).toBe("claude");
    });

    it("returns openai when ai_provider is openai", async () => {
      mockGetSetting.mockResolvedValue("openai");
      expect(await getActiveProviderName()).toBe("openai");
    });

    it("returns gemini when ai_provider is gemini", async () => {
      mockGetSetting.mockResolvedValue("gemini");
      expect(await getActiveProviderName()).toBe("gemini");
    });

    it("returns ollama when ai_provider is ollama", async () => {
      mockGetSetting.mockResolvedValue("ollama");
      expect(await getActiveProviderName()).toBe("ollama");
    });

    it("defaults to claude for unknown provider value", async () => {
      mockGetSetting.mockResolvedValue("unknown_provider");
      expect(await getActiveProviderName()).toBe("claude");
    });
  });

  describe("getActiveProvider", () => {
    it("creates claude provider with default model", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "ai_provider") return "claude";
        if (key === "claude_api_key") return "sk-ant-test";
        return null;
      });

      await getActiveProvider();
      expect(createClaudeProvider).toHaveBeenCalledWith("sk-ant-test", "claude-haiku-4-5-20251001");
    });

    it("creates openai provider with default model", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "ai_provider") return "openai";
        if (key === "openai_api_key") return "sk-test";
        return null;
      });

      await getActiveProvider();
      expect(createOpenAIProvider).toHaveBeenCalledWith("sk-test", "gpt-4o-mini");
    });

    it("creates gemini provider with default model", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "ai_provider") return "gemini";
        if (key === "gemini_api_key") return "AItest";
        return null;
      });

      await getActiveProvider();
      expect(createGeminiProvider).toHaveBeenCalledWith("AItest", "gemini-2.5-flash-preview-05-20");
    });

    it("uses custom model from settings when configured", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "ai_provider") return "claude";
        if (key === "claude_api_key") return "sk-ant-test";
        if (key === "claude_model") return "claude-sonnet-4-20250514";
        return null;
      });

      await getActiveProvider();
      expect(createClaudeProvider).toHaveBeenCalledWith("sk-ant-test", "claude-sonnet-4-20250514");
    });

    it("invalidates cache when model changes", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "ai_provider") return "openai";
        if (key === "openai_api_key") return "sk-test";
        if (key === "openai_model") return "gpt-4o-mini";
        return null;
      });

      await getActiveProvider();
      expect(createOpenAIProvider).toHaveBeenCalledTimes(1);

      // Change model
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "ai_provider") return "openai";
        if (key === "openai_api_key") return "sk-test";
        if (key === "openai_model") return "gpt-4o";
        return null;
      });

      await getActiveProvider();
      expect(createOpenAIProvider).toHaveBeenCalledTimes(2);
      expect(createOpenAIProvider).toHaveBeenLastCalledWith("sk-test", "gpt-4o");
    });

    it("creates ollama provider with server url and model", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "ai_provider") return "ollama";
        if (key === "ollama_server_url") return "http://localhost:11434";
        if (key === "ollama_model") return "llama3.2";
        return null;
      });

      await getActiveProvider();
      expect(createOllamaProvider).toHaveBeenCalledWith("http://localhost:11434", "llama3.2");
    });

    it("uses default ollama url and model when not configured", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "ai_provider") return "ollama";
        return null;
      });

      await getActiveProvider();
      expect(createOllamaProvider).toHaveBeenCalledWith("http://localhost:11434", "llama3.2");
    });

    it("throws NOT_CONFIGURED when API key is missing", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "ai_provider") return "openai";
        return null;
      });

      await expect(getActiveProvider()).rejects.toThrow("openai API key not configured");
    });

    it("caches provider and reuses on subsequent calls", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "ai_provider") return "claude";
        if (key === "claude_api_key") return "sk-ant-test";
        return null;
      });

      await getActiveProvider();
      await getActiveProvider();
      expect(createClaudeProvider).toHaveBeenCalledTimes(1);
    });

    it("caches ollama provider and reuses on subsequent calls", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "ai_provider") return "ollama";
        if (key === "ollama_server_url") return "http://localhost:11434";
        if (key === "ollama_model") return "llama3.2";
        return null;
      });

      await getActiveProvider();
      await getActiveProvider();
      expect(createOllamaProvider).toHaveBeenCalledTimes(1);
    });
  });

  describe("isAiAvailable", () => {
    it("returns false when ai_enabled is false", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "ai_enabled") return "false";
        return null;
      });

      expect(await isAiAvailable()).toBe(false);
    });

    it("returns false when active provider API key is missing", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "ai_enabled") return "true";
        if (key === "ai_provider") return "openai";
        // openai_api_key not set
        return null;
      });

      expect(await isAiAvailable()).toBe(false);
    });

    it("returns true when enabled and key exists", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "ai_enabled") return "true";
        if (key === "ai_provider") return "claude";
        if (key === "claude_api_key") return "sk-ant-test";
        return null;
      });

      expect(await isAiAvailable()).toBe(true);
    });

    it("returns true when ai_enabled is not set (defaults to enabled)", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "ai_provider") return null;
        if (key === "claude_api_key") return "sk-ant-test";
        return null;
      });

      expect(await isAiAvailable()).toBe(true);
    });

    it("returns true for ollama when server url is configured", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "ai_enabled") return "true";
        if (key === "ai_provider") return "ollama";
        if (key === "ollama_server_url") return "http://localhost:11434";
        return null;
      });

      expect(await isAiAvailable()).toBe(true);
    });

    it("returns false for ollama when server url is not configured", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "ai_enabled") return "true";
        if (key === "ai_provider") return "ollama";
        return null;
      });

      expect(await isAiAvailable()).toBe(false);
    });
  });

  describe("clearProviderClients", () => {
    it("forces re-creation on next getActiveProvider call", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "ai_provider") return "claude";
        if (key === "claude_api_key") return "sk-ant-test";
        return null;
      });

      await getActiveProvider();
      expect(createClaudeProvider).toHaveBeenCalledTimes(1);

      clearProviderClients();
      expect(clearClaudeProvider).toHaveBeenCalled();

      await getActiveProvider();
      expect(createClaudeProvider).toHaveBeenCalledTimes(2);
    });
  });
});
