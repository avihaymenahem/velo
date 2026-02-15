import { describe, it, expect } from "vitest";
import { startOAuthFlow } from "./auth";

describe("startOAuthFlow", () => {
  it("throws when client secret is undefined", async () => {
    await expect(startOAuthFlow("client-id")).rejects.toThrow(
      "Client Secret is not configured. Go to Settings → Google API to add it.",
    );
  });

  it("throws when client secret is empty string", async () => {
    await expect(startOAuthFlow("client-id", "")).rejects.toThrow(
      "Client Secret is not configured",
    );
  });
});
