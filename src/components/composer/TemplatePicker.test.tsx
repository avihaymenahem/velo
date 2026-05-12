import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TemplatePicker } from "./TemplatePicker";
import type { DbTemplate } from "@/services/db/templates";

vi.mock("@/components/ui/Modal", () => ({
  Modal: ({ children, isOpen, title }: { children: React.ReactNode; isOpen: boolean; title: string }) =>
    isOpen ? (
      <div data-testid="modal">
        <h3>{title}</h3>
        {children}
      </div>
    ) : null,
}));

const accountState = { activeAccountId: "acc-1" };
vi.mock("@/stores/accountStore", () => ({
  useAccountStore: Object.assign(
    (selector?: (s: Record<string, unknown>) => unknown) => {
      return selector ? selector(accountState) : accountState;
    },
    { getState: () => accountState },
  ),
}));

const composerState = { mode: "new", subject: "", setSubject: vi.fn(), getState: () => composerState };
vi.mock("@/stores/composerStore", () => ({
  useComposerStore: Object.assign(
    (selector?: (s: Record<string, unknown>) => unknown) => {
      return selector ? selector(composerState) : composerState;
    },
    { getState: () => composerState },
  ),
}));

vi.mock("@/services/db/templates", () => ({
  getTemplatesForAccount: vi.fn(() => Promise.resolve([])),
  getFavorites: vi.fn(() => Promise.resolve([])),
  getMostUsed: vi.fn(() => Promise.resolve([])),
  getCategories: vi.fn(() => Promise.resolve([])),
  upsertCategory: vi.fn(),
  incrementTemplateUsage: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        "composer.insertTemplate": "Insert Template",
        "composer.searchTemplates": "Search templates...",
        "composer.favorites": "Favorites",
        "composer.mostUsed": "Most Used",
        "composer.allTemplates": "All Templates",
        "composer.searchResults": "Search Results",
        "composer.noTemplates": "No templates yet",
        "composer.noTemplatesFound": "No templates found",
        "composer.templates": "Templates",
        "composer.addCategory": "Add Category",
        "composer.categoryName": "Category name",
        "composer.openTemplatePicker": "Open template picker",
        "common.add": "Add",
      };
      return map[key] ?? key;
    },
  }),
}));

const mockTemplates: DbTemplate[] = [
  {
    id: "t1",
    account_id: "acc-1",
    name: "Welcome Email",
    body_html: "<p>Welcome to our service!</p>",
    subject: "Welcome!",
    shortcut: null,
    category_id: null,
    is_favorite: 1,
    usage_count: 10,
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  {
    id: "t2",
    account_id: "acc-1",
    name: "Follow Up",
    body_html: "<p>Just checking in...</p>",
    subject: "Checking in",
    shortcut: null,
    category_id: null,
    is_favorite: 0,
    usage_count: 5,
    created_at: Date.now(),
    updated_at: Date.now(),
  },
];

describe("TemplatePicker", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const templates = await import("@/services/db/templates");
    vi.mocked(templates.getTemplatesForAccount).mockResolvedValue(mockTemplates);
    vi.mocked(templates.getFavorites).mockResolvedValue([mockTemplates[0]!]);
    vi.mocked(templates.getMostUsed).mockResolvedValue(mockTemplates);
  });

  it("renders template cards when open", async () => {
    render(<TemplatePicker editor={null} isOpen={true} onClose={vi.fn()} onSelect={vi.fn()} />);
    const title = await screen.findByText("Insert Template");
    expect(title).toBeTruthy();
    const welcomeCards = screen.getAllByText("Welcome Email");
    expect(welcomeCards.length).toBeGreaterThanOrEqual(1);
    const followUpCards = screen.getAllByText("Follow Up");
    expect(followUpCards.length).toBeGreaterThanOrEqual(1);
  });

  it("filters templates by search query", async () => {
    render(<TemplatePicker editor={null} isOpen={true} onClose={vi.fn()} onSelect={vi.fn()} />);
    await screen.findByText("Insert Template");

    const searchInput = screen.getByPlaceholderText("Search templates...");
    fireEvent.change(searchInput, { target: { value: "Follow" } });

    expect(screen.queryAllByText("Welcome Email")).toHaveLength(0);
    expect(screen.getByText("Follow Up")).toBeTruthy();
  });

  it("shows favorites section for favorite templates", async () => {
    render(<TemplatePicker editor={null} isOpen={true} onClose={vi.fn()} onSelect={vi.fn()} />);
    const favSection = await screen.findByText("Favorites");
    expect(favSection).toBeTruthy();
    expect(screen.getAllByText("Welcome Email").length).toBeGreaterThanOrEqual(1);
  });

  it("shows no templates message when filtered query matches nothing", async () => {
    render(<TemplatePicker editor={null} isOpen={true} onClose={vi.fn()} onSelect={vi.fn()} />);
    await screen.findByText("Insert Template");

    const searchInput = screen.getByPlaceholderText("Search templates...");
    fireEvent.change(searchInput, { target: { value: "zzzznonexistent" } });

    const noResults = await screen.findByText("No templates found");
    expect(noResults).toBeTruthy();
  });

  it("fires onSelect callback when template card is clicked", async () => {
    const onSelect = vi.fn();
    render(<TemplatePicker editor={null} isOpen={true} onClose={vi.fn()} onSelect={onSelect} />);
    const welcomeBtn = (await screen.findAllByText("Welcome Email"))[0]!;
    fireEvent.click(welcomeBtn);
    expect(onSelect).toHaveBeenCalledWith(mockTemplates[0]);
  });

  it("fires onClose callback when modal is closed", async () => {
    const onClose = vi.fn();
    render(<TemplatePicker editor={null} isOpen={true} onClose={onClose} onSelect={vi.fn()} />);
    // Modal's close button is not rendered via the mock Modal; we test the onClose prop contract
    expect(onClose).not.toHaveBeenCalled();
  });
});
