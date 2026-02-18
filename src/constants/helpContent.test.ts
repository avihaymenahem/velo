import { describe, it, expect } from "vitest";
import {
  HELP_CATEGORIES,
  CONTEXTUAL_TIPS,
  getAllCards,
  getCategoryById,
} from "./helpContent";

const VALID_SETTINGS_TABS = [
  "general", "notifications", "composing", "mail-rules", "people",
  "accounts", "shortcuts", "ai", "about",
];

describe("helpContent", () => {
  it("every category has a unique id", () => {
    const ids = HELP_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every category has at least 1 card", () => {
    for (const cat of HELP_CATEGORIES) {
      expect(cat.cards.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("every card has non-empty title, summary, and description", () => {
    for (const cat of HELP_CATEGORIES) {
      for (const card of cat.cards) {
        expect(card.title.trim().length).toBeGreaterThan(0);
        expect(card.summary.trim().length).toBeGreaterThan(0);
        expect(card.description.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("summary is shorter than description for every card", () => {
    for (const cat of HELP_CATEGORIES) {
      for (const card of cat.cards) {
        expect(card.summary.length).toBeLessThan(card.description.length);
      }
    }
  });

  it("no duplicate card IDs across all categories", () => {
    const allCards = getAllCards();
    const ids = allCards.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all relatedSettingsTab values map to valid settings tab IDs", () => {
    const allCards = getAllCards();
    for (const card of allCards) {
      if (card.relatedSettingsTab) {
        expect(VALID_SETTINGS_TABS).toContain(card.relatedSettingsTab);
      }
    }
  });

  it("all contextual tip helpTopic values map to valid category IDs", () => {
    const categoryIds = new Set(HELP_CATEGORIES.map((c) => c.id));
    for (const [, tip] of Object.entries(CONTEXTUAL_TIPS)) {
      expect(categoryIds.has(tip.helpTopic)).toBe(true);
    }
  });

  it("getCategoryById returns correct category", () => {
    const cat = getCategoryById("composing");
    expect(cat?.label).toBe("Composing & Sending");
  });

  it("getCategoryById returns undefined for unknown ID", () => {
    expect(getCategoryById("nonexistent")).toBeUndefined();
  });

  it("getAllCards includes category metadata on each card", () => {
    const allCards = getAllCards();
    for (const card of allCards) {
      expect(card.categoryId).toBeTruthy();
      expect(card.categoryLabel).toBeTruthy();
    }
  });
});
