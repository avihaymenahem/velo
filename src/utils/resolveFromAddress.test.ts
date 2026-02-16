import { describe, it, expect } from "vitest";
import { resolveFromAddress } from "./resolveFromAddress";
import { createMockSendAsAlias } from "@/test/mocks";

describe("resolveFromAddress", () => {
  it("returns null for empty aliases", () => {
    const result = resolveFromAddress([], "someone@test.com", null);
    expect(result).toBeNull();
  });

  it("resolves matching alias from To field", () => {
    const aliases = [
      createMockSendAsAlias({ id: "a1", email: "primary@example.com", isPrimary: true }),
      createMockSendAsAlias({ id: "a2", email: "alias@example.com" }),
    ];

    const result = resolveFromAddress(aliases, "alias@example.com, other@test.com", null);
    expect(result?.id).toBe("a2");
    expect(result?.email).toBe("alias@example.com");
  });

  it("resolves matching alias from CC field", () => {
    const aliases = [
      createMockSendAsAlias({ id: "a1", email: "primary@example.com", isPrimary: true }),
      createMockSendAsAlias({ id: "a2", email: "work@example.com" }),
    ];

    const result = resolveFromAddress(aliases, "someone@test.com", "work@example.com");
    expect(result?.id).toBe("a2");
    expect(result?.email).toBe("work@example.com");
  });

  it("is case-insensitive when matching addresses", () => {
    const aliases = [
      createMockSendAsAlias({ id: "a1", email: "User@Example.COM", isPrimary: true }),
    ];

    const result = resolveFromAddress(aliases, "user@example.com", null);
    expect(result?.id).toBe("a1");
  });

  it("falls back to default when no match", () => {
    const aliases = [
      createMockSendAsAlias({ id: "a1", email: "primary@example.com", isPrimary: true }),
      createMockSendAsAlias({ id: "a2", email: "default@example.com", isDefault: true }),
    ];

    const result = resolveFromAddress(aliases, "unknown@test.com", null);
    expect(result?.id).toBe("a2");
  });

  it("falls back to primary when no default and no match", () => {
    const aliases = [
      createMockSendAsAlias({ id: "a1", email: "secondary@example.com" }),
      createMockSendAsAlias({ id: "a2", email: "primary@example.com", isPrimary: true }),
    ];

    const result = resolveFromAddress(aliases, "unknown@test.com", null);
    expect(result?.id).toBe("a2");
  });

  it("falls back to first alias when no default, no primary, no match", () => {
    const aliases = [
      createMockSendAsAlias({ id: "a1", email: "first@example.com" }),
      createMockSendAsAlias({ id: "a2", email: "second@example.com" }),
    ];

    const result = resolveFromAddress(aliases, "unknown@test.com", null);
    expect(result?.id).toBe("a1");
  });

  it("handles null toAddresses and ccAddresses", () => {
    const aliases = [
      createMockSendAsAlias({ id: "a1", email: "primary@example.com", isPrimary: true }),
      createMockSendAsAlias({ id: "a2", email: "default@example.com", isDefault: true }),
    ];

    const result = resolveFromAddress(aliases, null, null);
    expect(result?.id).toBe("a2");
  });

  it("handles empty string addresses", () => {
    const aliases = [
      createMockSendAsAlias({ id: "a1", email: "primary@example.com", isPrimary: true }),
    ];

    const result = resolveFromAddress(aliases, "", "");
    expect(result?.id).toBe("a1");
  });

  it("prefers To match over default alias", () => {
    const aliases = [
      createMockSendAsAlias({ id: "a1", email: "default@example.com", isDefault: true }),
      createMockSendAsAlias({ id: "a2", email: "match@example.com" }),
    ];

    const result = resolveFromAddress(aliases, "match@example.com", null);
    expect(result?.id).toBe("a2");
  });
});
