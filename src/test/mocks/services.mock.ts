import { vi } from "vitest";
import type { GmailClient } from "@/services/gmail/client";

export function createMockGmailClient(
  overrides: Record<string, unknown> = {},
): GmailClient {
  return {
    listLabels: vi.fn(),
    createLabel: vi.fn(),
    deleteLabel: vi.fn(),
    updateLabel: vi.fn(),
    modifyThread: vi.fn(),
    deleteThread: vi.fn(),
    getMessage: vi.fn(),
    getAttachment: vi.fn(),
    sendMessage: vi.fn(),
    createDraft: vi.fn(),
    updateDraft: vi.fn(),
    deleteDraft: vi.fn(),
    getProfile: vi.fn(),
    getHistory: vi.fn(),
    getThread: vi.fn(),
    listThreads: vi.fn(),
    listDrafts: vi.fn(),
    request: vi.fn(),
    ...overrides,
  } as unknown as GmailClient;
}

export function createMockEmailProvider(
  overrides: Record<string, unknown> = {},
) {
  return {
    archive: vi.fn(() => Promise.resolve()),
    trash: vi.fn(() => Promise.resolve()),
    permanentDelete: vi.fn(() => Promise.resolve()),
    markRead: vi.fn(() => Promise.resolve()),
    star: vi.fn(() => Promise.resolve()),
    spam: vi.fn(() => Promise.resolve()),
    moveToFolder: vi.fn(() => Promise.resolve()),
    addLabel: vi.fn(() => Promise.resolve()),
    removeLabel: vi.fn(() => Promise.resolve()),
    sendMessage: vi.fn(() => Promise.resolve({ id: "msg-1" })),
    createDraft: vi.fn(() => Promise.resolve({ draftId: "d-1" })),
    updateDraft: vi.fn(() => Promise.resolve({ draftId: "d-1" })),
    deleteDraft: vi.fn(() => Promise.resolve()),
    fetchRawMessage: vi.fn(() => Promise.resolve("")),
    ...overrides,
  };
}

export function createMockAiProvider(response = "ai response") {
  return {
    complete: vi.fn(() => Promise.resolve(response)),
    testConnection: vi.fn(() => Promise.resolve(true)),
  };
}

/**
 * Create a mock fetch Response object for testing HTTP clients.
 */
export function createMockFetchResponse(
  overrides: {
    status?: number;
    ok?: boolean;
    data?: unknown;
    text?: string;
    headers?: Record<string, string>;
  } = {},
): Response {
  const status = overrides.status ?? 200;
  const ok = overrides.ok ?? (status >= 200 && status < 300);
  return {
    ok,
    status,
    headers: new Headers(overrides.headers ?? {}),
    json: () => Promise.resolve(overrides.data ?? {}),
    text: () => Promise.resolve(overrides.text ?? ""),
  } as unknown as Response;
}
