import { render, screen, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import i18n from "@/i18n";
import { ContactEditor } from "./ContactEditor";

vi.mock("@/services/db/contacts", () => ({
  getAllContacts: vi.fn(() => Promise.resolve([])),
  updateContact: vi.fn(() => Promise.resolve()),
  deleteContact: vi.fn(() => Promise.resolve()),
}));

describe("ContactEditor", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders contact editor chrome in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");

    render(<ContactEditor />);

    expect(screen.getByPlaceholderText("搜索联系人...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("还没有联系人")).toBeInTheDocument();
    });

    expect(screen.getByText("共 0 个联系人")).toBeInTheDocument();
  });
});
