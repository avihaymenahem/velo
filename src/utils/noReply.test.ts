import { isNoReplyAddress } from "./noReply";

describe("isNoReplyAddress", () => {
  it("returns true for common no-reply patterns", () => {
    expect(isNoReplyAddress("noreply@example.com")).toBe(true);
    expect(isNoReplyAddress("no-reply@example.com")).toBe(true);
    expect(isNoReplyAddress("no_reply@company.org")).toBe(true);
    expect(isNoReplyAddress("donotreply@service.com")).toBe(true);
    expect(isNoReplyAddress("do-not-reply@mail.io")).toBe(true);
    expect(isNoReplyAddress("do_not_reply@test.net")).toBe(true);
    expect(isNoReplyAddress("mailer-daemon@gmail.com")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isNoReplyAddress("NoReply@example.com")).toBe(true);
    expect(isNoReplyAddress("DONOTREPLY@example.com")).toBe(true);
    expect(isNoReplyAddress("Mailer-Daemon@example.com")).toBe(true);
  });

  it("returns false for regular addresses", () => {
    expect(isNoReplyAddress("john@example.com")).toBe(false);
    expect(isNoReplyAddress("support@company.com")).toBe(false);
    expect(isNoReplyAddress("hello@noreply.com")).toBe(false); // domain doesn't matter
  });

  it("returns false for null/undefined/empty", () => {
    expect(isNoReplyAddress(null)).toBe(false);
    expect(isNoReplyAddress(undefined)).toBe(false);
    expect(isNoReplyAddress("")).toBe(false);
  });
});
