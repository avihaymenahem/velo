import { describe, it, expect } from "vitest";
import { HELP_CATEGORIES, getAllCards, getCategoryById } from "@/constants/helpContent";

/**
 * Tests for Help page search/filter logic and data integrity.
 * Uses pure function tests rather than component rendering since
 * the search logic is derived state in the component.
 */

function filterCards(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const allCards = getAllCards();
  return allCards.filter((card) => {
    if (card.title.toLowerCase().includes(q)) return true;
    if (card.summary.toLowerCase().includes(q)) return true;
    if (card.description.toLowerCase().includes(q)) return true;
    if (card.tips?.some((tip) => tip.text.toLowerCase().includes(q))) return true;
    return false;
  });
}

describe("HelpPage search filtering", () => {
  it("matches cards by title", () => {
    const results = filterCards("snooze");
    expect(results).not.toBeNull();
    expect(results!.some((c) => c.id === "snooze")).toBe(true);
  });

  it("matches cards by description", () => {
    const results = filterCards("rich text editor");
    expect(results).not.toBeNull();
    expect(results!.some((c) => c.id === "new-email")).toBe(true);
  });

  it("matches cards by tip text", () => {
    const results = filterCards("drag and drop");
    expect(results).not.toBeNull();
    expect(results!.some((c) => c.id === "labels")).toBe(true);
  });

  it("empty query returns null (shows active topic)", () => {
    expect(filterCards("")).toBeNull();
    expect(filterCards("   ")).toBeNull();
  });

  it("search is case-insensitive", () => {
    const lower = filterCards("archive");
    const upper = filterCards("ARCHIVE");
    expect(lower).not.toBeNull();
    expect(upper).not.toBeNull();
    expect(lower!.length).toBe(upper!.length);
  });

  it("nonsense query returns empty array", () => {
    const results = filterCards("xyzzyqwerty12345");
    expect(results).not.toBeNull();
    expect(results!.length).toBe(0);
  });
});

describe("HelpPage topic fallback", () => {
  it("valid topic resolves to correct category", () => {
    const cat = getCategoryById("composing");
    expect(cat).toBeDefined();
    expect(cat!.label).toBe("Composing & Sending");
  });

  it("invalid topic falls back (getCategoryById returns undefined)", () => {
    const cat = getCategoryById("invalid-topic-slug");
    expect(cat).toBeUndefined();
  });

  it("getting-started is a valid default topic", () => {
    expect(getCategoryById("getting-started")).toBeDefined();
  });
});

describe("HelpPage card expansion", () => {
  it("cards with tips or relatedSettingsTab are expandable", () => {
    const allCards = getAllCards();
    const expandable = allCards.filter(
      (c) => (c.tips && c.tips.length > 0) || c.relatedSettingsTab,
    );
    // Most cards should be expandable (tips or settings link)
    expect(expandable.length).toBeGreaterThan(allCards.length / 2);
  });

  it("every card tip with a shortcut has non-empty shortcut text", () => {
    const allCards = getAllCards();
    for (const card of allCards) {
      if (card.tips) {
        for (const tip of card.tips) {
          if (tip.shortcut !== undefined) {
            expect(tip.shortcut.trim().length).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});

describe("HelpPage categories cover all expected topics", () => {
  const expectedIds = [
    "getting-started",
    "reading-email",
    "composing",
    "search-navigation",
    "organization",
    "productivity",
    "ai-features",
    "newsletters",
    "notifications-contacts",
    "security",
    "calendar",
    "tasks",
    "appearance",
    "accounts-system",
  ];

  it("all expected category IDs exist", () => {
    const ids = HELP_CATEGORIES.map((c) => c.id);
    for (const expected of expectedIds) {
      expect(ids).toContain(expected);
    }
  });

  it("has exactly 14 categories", () => {
    expect(HELP_CATEGORIES.length).toBe(14);
  });
});
