import { describe, it, expect } from "vitest";
import { parseAddressList } from "./addressList";

describe("parseAddressList", () => {
  it("parses a bare address", () => {
    expect(parseAddressList("a@b.com")).toEqual([{ email: "a@b.com", name: null }]);
  });

  it("parses name with angle brackets", () => {
    expect(parseAddressList("Alice Smith <alice@example.com>")).toEqual([
      { email: "alice@example.com", name: "Alice Smith" },
    ]);
  });

  it("parses a quoted display name containing a comma", () => {
    expect(parseAddressList('"Doe, John" <john@example.com>, bare@example.com')).toEqual([
      { email: "john@example.com", name: "Doe, John" },
      { email: "bare@example.com", name: null },
    ]);
  });

  it("parses multiple addresses", () => {
    expect(parseAddressList("a@b.com, C D <c@d.com> , e@f.com")).toEqual([
      { email: "a@b.com", name: null },
      { email: "c@d.com", name: "C D" },
      { email: "e@f.com", name: null },
    ]);
  });

  it("unescapes escaped quotes in display names", () => {
    expect(parseAddressList('"Say \\"Hi\\"" <hi@example.com>')).toEqual([
      { email: "hi@example.com", name: 'Say "Hi"' },
    ]);
  });

  it("lowercases emails but preserves name casing", () => {
    expect(parseAddressList("Bob JONES <Bob.Jones@Example.COM>")).toEqual([
      { email: "bob.jones@example.com", name: "Bob JONES" },
    ]);
  });

  it("returns empty for null, undefined, and empty input", () => {
    expect(parseAddressList(null)).toEqual([]);
    expect(parseAddressList(undefined)).toEqual([]);
    expect(parseAddressList("")).toEqual([]);
    expect(parseAddressList("  ,  , ")).toEqual([]);
  });

  it("drops group syntax with no address", () => {
    expect(parseAddressList("undisclosed-recipients:;")).toEqual([]);
  });

  it("drops tokens without a valid @", () => {
    expect(parseAddressList("not-an-email, @nope.com, trailing@")).toEqual([]);
  });

  it("handles empty display name quotes", () => {
    expect(parseAddressList('"" <x@y.com>')).toEqual([{ email: "x@y.com", name: null }]);
  });
});
