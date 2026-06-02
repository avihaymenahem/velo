import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { getQuickStepDisplayName } from "./display";

describe("getQuickStepDisplayName", () => {
  it("localizes seeded default quick step names when name and actions match", () => {
    const name = getQuickStepDisplayName(
      {
        name: "Reply & Archive",
        actions_json: JSON.stringify([{ type: "reply" }, { type: "archive" }]),
      },
      i18n.getFixedT("zh-CN", "settings"),
    );

    expect(name).toBe("回复并归档");
  });

  it("keeps user custom names even when they resemble default names", () => {
    const name = getQuickStepDisplayName(
      {
        name: "Reply & Archive",
        actions_json: JSON.stringify([{ type: "reply" }]),
      },
      i18n.getFixedT("zh-CN", "settings"),
    );

    expect(name).toBe("Reply & Archive");
  });

  it("keeps custom quick step names unchanged", () => {
    const name = getQuickStepDisplayName(
      {
        name: "Investor follow-up",
        actions_json: JSON.stringify([{ type: "star" }, { type: "pin" }]),
      },
      i18n.getFixedT("zh-CN", "settings"),
    );

    expect(name).toBe("Investor follow-up");
  });
});
