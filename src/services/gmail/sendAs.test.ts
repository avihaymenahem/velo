import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/services/db/sendAsAliases", () => ({
  upsertAlias: vi.fn(() => Promise.resolve("mock-id")),
}));

import { upsertAlias } from "@/services/db/sendAsAliases";
import { fetchSendAsAliases } from "./sendAs";

describe("fetchSendAsAliases", () => {
  const mockClient = {
    request: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches aliases and upserts each one", async () => {
    mockClient.request.mockResolvedValue({
      sendAs: [
        {
          sendAsEmail: "primary@example.com",
          displayName: "Primary User",
          isPrimary: true,
          treatAsAlias: false,
          verificationStatus: "accepted",
        },
        {
          sendAsEmail: "alias@example.com",
          displayName: "Alias User",
          replyToAddress: "reply@example.com",
          isPrimary: false,
          treatAsAlias: true,
          verificationStatus: "accepted",
        },
      ],
    });

    await fetchSendAsAliases(mockClient as never, "acc-1");

    expect(mockClient.request).toHaveBeenCalledWith("/settings/sendAs");
    expect(upsertAlias).toHaveBeenCalledTimes(2);

    expect(upsertAlias).toHaveBeenCalledWith({
      accountId: "acc-1",
      email: "primary@example.com",
      displayName: "Primary User",
      replyToAddress: null,
      isPrimary: true,
      treatAsAlias: false,
      verificationStatus: "accepted",
    });

    expect(upsertAlias).toHaveBeenCalledWith({
      accountId: "acc-1",
      email: "alias@example.com",
      displayName: "Alias User",
      replyToAddress: "reply@example.com",
      isPrimary: false,
      treatAsAlias: true,
      verificationStatus: "accepted",
    });
  });

  it("handles empty sendAs array gracefully", async () => {
    mockClient.request.mockResolvedValue({ sendAs: [] });

    await fetchSendAsAliases(mockClient as never, "acc-1");

    expect(upsertAlias).not.toHaveBeenCalled();
  });

  it("handles missing sendAs property gracefully", async () => {
    mockClient.request.mockResolvedValue({});

    await fetchSendAsAliases(mockClient as never, "acc-1");

    expect(upsertAlias).not.toHaveBeenCalled();
  });

  it("defaults optional fields", async () => {
    mockClient.request.mockResolvedValue({
      sendAs: [
        {
          sendAsEmail: "minimal@example.com",
        },
      ],
    });

    await fetchSendAsAliases(mockClient as never, "acc-1");

    expect(upsertAlias).toHaveBeenCalledWith({
      accountId: "acc-1",
      email: "minimal@example.com",
      displayName: null,
      replyToAddress: null,
      isPrimary: false,
      treatAsAlias: true,
      verificationStatus: "accepted",
    });
  });
});
