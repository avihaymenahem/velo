import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("tauri.conf.json", () => {
  const configPath = resolve(__dirname, "../../src-tauri/tauri.conf.json");
  const config = JSON.parse(readFileSync(configPath, "utf-8"));

  it("uses Kirje product and app identity", () => {
    expect(config.productName).toBe("Kirje");
    expect(config.identifier).toBe("app.kirje.desktop");
    expect(config.app.windows.find((w: { label: string }) => w.label === "main")?.title).toBe("Kirje");
    expect(config.plugins.sql.preload).toEqual(["sqlite:kirje.db"]);
    expect(config.plugins.updater.endpoints).toEqual([
      "https://github.com/iiwish/kirje/releases/latest/download/latest.json",
    ]);
  });

  it("should disable native drag-drop on the main window so HTML5 events reach the webview", () => {
    const mainWindow = config.app.windows.find(
      (w: { label: string }) => w.label === "main",
    );
    expect(mainWindow).toBeDefined();
    expect(mainWindow.dragDropEnabled).toBe(false);
  });
});
