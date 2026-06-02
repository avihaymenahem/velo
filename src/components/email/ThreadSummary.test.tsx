import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { ThreadSummary } from "./ThreadSummary";
import { generateThreadBriefing } from "@/services/ai/aiService";
import type { DbMessage } from "@/services/db/messages";

vi.mock("@/services/ai/providerManager", () => ({
  isAiAvailable: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("@/services/ai/aiService", () => ({
  generateThreadBriefing: vi.fn(),
}));

vi.mock("@/services/db/aiCache", () => ({
  deleteAiCache: vi.fn(() => Promise.resolve()),
}));

const message = (overrides: Partial<DbMessage> = {}): DbMessage => ({
  id: "m1",
  account_id: "acc1",
  gmail_id: "gmail-1",
  thread_id: "thread-1",
  subject: "Contract review",
  from_address: "client@example.com",
  from_name: "Client",
  to_addresses: "me@example.com",
  cc_addresses: null,
  bcc_addresses: null,
  date: 1_700_000_000,
  snippet: "Please review by Friday",
  body_text: "Please review the contract by Friday.",
  body_html: null,
  is_read: 0,
  is_starred: 0,
  is_important: 0,
  has_attachments: 1,
  labels: null,
  auth_results: null,
  message_id_header: null,
  references_header: null,
  in_reply_to_header: null,
  imap_uid: null,
  imap_folder: null,
  body_cached: 1,
  ...overrides,
});

describe("ThreadSummary briefing surface", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
  });

  it("renders structured thread briefing sections", async () => {
    vi.mocked(generateThreadBriefing).mockResolvedValueOnce({
      summary: "Client sent a contract for review.",
      latestRequest: "Review it by Friday.",
      suggestedAction: "Reply with feedback or timing.",
      riskOrDueSignal: "Friday deadline.",
      source: "Client, latest message",
    });

    render(
      <ThreadSummary
        threadId="thread-1"
        accountId="acc1"
        messages={[message(), message({ id: "m2", gmail_id: "gmail-2" })]}
      />,
    );

    expect(await screen.findByText("Thread Briefing")).toBeInTheDocument();
    expect(await screen.findByText("Summary")).toBeInTheDocument();
    expect(screen.getByText("Client sent a contract for review.")).toBeInTheDocument();
    expect(screen.getByText("Latest request")).toBeInTheDocument();
    expect(screen.getByText("Review it by Friday.")).toBeInTheDocument();
    expect(screen.getByText("Suggested next step")).toBeInTheDocument();
    expect(screen.getByText("Reply with feedback or timing.")).toBeInTheDocument();
    expect(screen.getByText("Risk or due signal")).toBeInTheDocument();
    expect(screen.getByText("Friday deadline.")).toBeInTheDocument();
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("Client, latest message")).toBeInTheDocument();
  });

  it("shows a non-blocking failure state when briefing generation fails", async () => {
    vi.mocked(generateThreadBriefing).mockRejectedValueOnce(new Error("rate limited"));

    render(
      <ThreadSummary
        threadId="thread-1"
        accountId="acc1"
        messages={[message(), message({ id: "m2", gmail_id: "gmail-2" })]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Briefing unavailable")).toBeInTheDocument();
    });
    expect(screen.getByText("The original messages are still available below.")).toBeInTheDocument();
  });

  it("checks AI availability after messages load asynchronously", async () => {
    vi.mocked(generateThreadBriefing).mockResolvedValueOnce({
      summary: "Messages loaded after the first render.",
      latestRequest: null,
      suggestedAction: null,
      riskOrDueSignal: null,
      source: null,
    });

    const { rerender } = render(
      <ThreadSummary threadId="thread-1" accountId="acc1" messages={[]} />,
    );

    rerender(
      <ThreadSummary
        threadId="thread-1"
        accountId="acc1"
        messages={[message(), message({ id: "m2", gmail_id: "gmail-2" })]}
      />,
    );

    expect(await screen.findByText("Messages loaded after the first render.")).toBeInTheDocument();
  });
});
