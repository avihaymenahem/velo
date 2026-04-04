import { describe, it, expect } from "vitest";
import i18n from "i18next";
import { SHORTCUTS, getDefaultKeyMap, getShortcuts } from "./shortcuts";

describe("SHORTCUTS", () => {
  it("has at least 3 categories (Navigation, Actions, App)", () => {
    expect(SHORTCUTS.length).toBeGreaterThanOrEqual(3);

    const categoryNames = SHORTCUTS.map((c) => c.category);
    expect(categoryNames).toContain("shortcuts.navigation");
    expect(categoryNames).toContain("shortcuts.actions");
    expect(categoryNames).toContain("shortcuts.app");
  });

  it("each category has items with keys and desc", () => {
    for (const category of SHORTCUTS) {
      expect(category.category).toBeDefined();
      expect(category.items.length).toBeGreaterThan(0);

      for (const item of category.items) {
        expect(item).toHaveProperty("id");
        expect(item).toHaveProperty("keys");
        expect(item).toHaveProperty("desc");
      }
    }
  });

  it("all shortcuts have non-empty id, keys and descriptions", () => {
    for (const category of SHORTCUTS) {
      for (const item of category.items) {
        expect(item.id.trim().length).toBeGreaterThan(0);
        expect(item.keys.trim().length).toBeGreaterThan(0);
        expect(item.desc.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("all shortcut IDs are unique", () => {
    const ids = SHORTCUTS.flatMap((c) => c.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("getDefaultKeyMap returns map of all shortcuts", () => {
    const map = getDefaultKeyMap();
    const allIds = SHORTCUTS.flatMap((c) => c.items.map((i) => i.id));
    for (const id of allIds) {
      expect(map[id]).toBeDefined();
    }
  });
});

describe("getShortcuts(t)", () => {
  const t = i18n.t.bind(i18n);

  it("returns categories with translated strings, not raw key paths", () => {
    const translated = getShortcuts(t);
    expect(translated.length).toBeGreaterThanOrEqual(3);

    for (const category of translated) {
      // Translated strings should not look like dot-separated key paths
      expect(category.category).not.toContain("shortcuts.");
      for (const item of category.items) {
        expect(item.desc).not.toContain("shortcuts.");
      }
    }
  });

  it("first category is 'Navigation'", () => {
    const translated = getShortcuts(t);
    expect(translated[0]!.category).toBe("Navigation");
  });

  it("items have translated desc values", () => {
    const translated = getShortcuts(t);
    const navItems = translated[0]!.items;

    // First item should be "Next thread"
    expect(navItems[0]!.desc).toBe("Next thread");
    // Items should retain their key bindings
    expect(navItems[0]!.keys).toBe("j");
  });

  it("returns same number of categories and items as SHORTCUTS", () => {
    const translated = getShortcuts(t);
    expect(translated.length).toBe(SHORTCUTS.length);
    for (let i = 0; i < translated.length; i++) {
      expect(translated[i]!.items.length).toBe(SHORTCUTS[i]!.items.length);
    }
  });
});
