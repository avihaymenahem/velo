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

import { getSetting } from "@/services/db/settings";
import { createClaudeProvider, clearClaudeProvider } from "./providers/claudeProvider";
import { createOpenAIProvider } from "./providers/openaiProvider";
import { createGeminiProvider } from "./providers/geminiProvider";
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

    it("defaults to claude for unknown provider value", async () => {
      mockGetSetting.mockResolvedValue("unknown_provider");
      expect(await getActiveProviderName()).toBe("claude");
    });
  });

  describe("getActiveProvider", () => {
    it("creates claude provider when provider is claude", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "ai_provider") return "claude";
        if (key === "claude_api_key") return "sk-ant-test";
        return null;
      });

      await getActiveProvider();
      expect(createClaudeProvider).toHaveBeenCalledWith("sk-ant-test");
    });

    it("creates openai provider when provider is openai", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "ai_provider") return "openai";
        if (key === "openai_api_key") return "sk-test";
        return null;
      });

      await getActiveProvider();
      expect(createOpenAIProvider).toHaveBeenCalledWith("sk-test");
    });

    it("creates gemini provider when provider is gemini", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "ai_provider") return "gemini";
        if (key === "gemini_api_key") return "AItest";
        return null;
      });

      await getActiveProvider();
      expect(createGeminiProvider).toHaveBeenCalledWith("AItest");
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
