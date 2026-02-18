import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { createRef } from "react";
import { MessageItem } from "./MessageItem";
import type { DbMessage } from "@/services/db/messages";

vi.mock("./EmailRenderer", () => ({
  EmailRenderer: () => <div data-testid="email-renderer" />,
}));

vi.mock("./InlineAttachmentPreview", () => ({
  InlineAttachmentPreview: () => null,
}));

vi.mock("./AttachmentList", () => ({
  AttachmentList: () => null,
  getAttachmentsForMessage: vi.fn().mockResolvedValue([]),
}));

vi.mock("./AuthBadge", () => ({
  AuthBadge: () => null,
}));

vi.mock("./AuthWarningBanner", () => ({
  AuthWarningBanner: () => null,
}));

function makeMessage(overrides: Partial<DbMessage> = {}): DbMessage {
  return {
    id: "m1",
    account_id: "a1",
    thread_id: "t1",
    from_address: "bob@example.com",
    from_name: "Bob",
    to_addresses: "alice@example.com",
    cc_addresses: null,
    bcc_addresses: null,
    reply_to: null,
    subject: "Test subject",
    snippet: "Test snippet",
    date: Date.now(),
    is_read: 0,
    is_starred: 0,
    body_html: "<p>Hello</p>",
    body_text: "Hello",
    body_cached: 1,
    raw_size: 100,
    internal_date: null,
    list_unsubscribe: null,
    list_unsubscribe_post: null,
    auth_results: null,
    message_id_header: null,
    references_header: null,
    in_reply_to_header: null,
    ...overrides,
  };
}

describe("MessageItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders sender name", () => {
    render(<MessageItem message={makeMessage()} isLast={true} blockImages={false} />);
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("applies red background when isSpam is true", () => {
    const { container } = render(
      <MessageItem message={makeMessage()} isLast={true} blockImages={false} isSpam={true} />,
    );
    const wrapper = container.firstElementChild!;
    expect(wrapper.className).toContain("bg-red-500/8");
  });

  it("does not apply red background when isSpam is false", () => {
    const { container } = render(
      <MessageItem message={makeMessage()} isLast={true} blockImages={false} isSpam={false} />,
    );
    const wrapper = container.firstElementChild!;
    expect(wrapper.className).not.toContain("bg-red-500");
  });

  it("does not apply red background when isSpam is undefined", () => {
    const { container } = render(
      <MessageItem message={makeMessage()} isLast={true} blockImages={false} />,
    );
    const wrapper = container.firstElementChild!;
    expect(wrapper.className).not.toContain("bg-red-500");
  });

  it("applies focus ring when focused prop is true", () => {
    const { container } = render(
      <MessageItem message={makeMessage()} isLast={false} blockImages={false} focused={true} />,
    );
    const wrapper = container.firstElementChild!;
    expect(wrapper.className).toContain("ring-accent/50");
  });

  it("does not apply focus ring when focused is false", () => {
    const { container } = render(
      <MessageItem message={makeMessage()} isLast={false} blockImages={false} focused={false} />,
    );
    const wrapper = container.firstElementChild!;
    expect(wrapper.className).not.toContain("ring-accent/50");
  });

  it("auto-expands when focused becomes true", () => {
    // Render collapsed (isLast=false, not focused)
    const { container, rerender } = render(
      <MessageItem message={makeMessage()} isLast={false} blockImages={false} focused={false} />,
    );
    // Should be collapsed — no email renderer visible
    expect(container.querySelector("[data-testid='email-renderer']")).toBeNull();

    // Now set focused=true
    rerender(
      <MessageItem message={makeMessage()} isLast={false} blockImages={false} focused={true} />,
    );
    // Should now be expanded — email renderer visible
    expect(container.querySelector("[data-testid='email-renderer']")).toBeInTheDocument();
  });

  it("forwards ref to outer div", () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <MessageItem ref={ref} message={makeMessage()} isLast={true} blockImages={false} />,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
