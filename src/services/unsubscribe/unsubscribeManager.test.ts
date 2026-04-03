import { describe, it, expect } from "vitest";
import { isSafeUrl } from "./unsubscribeManager";

describe("isSafeUrl", () => {
  // Should block
  it("blocks localhost", () => {
    expect(isSafeUrl("https://localhost/unsub")).toBe(false);
  });

  it("blocks 127.0.0.1", () => {
    expect(isSafeUrl("https://127.0.0.1/unsub")).toBe(false);
  });

  it("blocks IPv6 loopback ::1", () => {
    expect(isSafeUrl("https://[::1]/unsub")).toBe(false);
  });

  it("blocks IPv6 full loopback 0:0:0:0:0:0:0:1", () => {
    expect(isSafeUrl("https://[0:0:0:0:0:0:0:1]/unsub")).toBe(false);
  });

  it("blocks 10.x.x.x (private class A)", () => {
    expect(isSafeUrl("https://10.0.0.1/unsub")).toBe(false);
  });

  it("blocks 172.16-31.x.x (private class B)", () => {
    expect(isSafeUrl("https://172.16.0.1/unsub")).toBe(false);
    expect(isSafeUrl("https://172.31.255.255/unsub")).toBe(false);
  });

  it("allows 172.15.x.x (not private)", () => {
    expect(isSafeUrl("https://172.15.0.1/unsub")).toBe(true);
  });

  it("blocks 192.168.x.x (private class C)", () => {
    expect(isSafeUrl("https://192.168.1.1/unsub")).toBe(false);
  });

  it("blocks 169.254.x.x (link-local / cloud metadata)", () => {
    expect(isSafeUrl("https://169.254.169.254/latest/meta-data/")).toBe(false);
  });

  it("blocks 0.0.0.0", () => {
    expect(isSafeUrl("https://0.0.0.0/unsub")).toBe(false);
  });

  it("blocks IPv6 unique-local fc00::/fd00::", () => {
    expect(isSafeUrl("https://[fc00::1]/unsub")).toBe(false);
    expect(isSafeUrl("https://[fd12:3456::1]/unsub")).toBe(false);
  });

  it("blocks IPv6 link-local fe80::", () => {
    expect(isSafeUrl("https://[fe80::1]/unsub")).toBe(false);
  });

  it("blocks IPv4-mapped IPv6 ::ffff:127.0.0.1", () => {
    expect(isSafeUrl("https://[::ffff:127.0.0.1]/unsub")).toBe(false);
  });

  it("blocks IPv4-mapped IPv6 ::ffff:169.254.169.254", () => {
    expect(isSafeUrl("https://[::ffff:169.254.169.254]/unsub")).toBe(false);
  });

  it("blocks non-http(s) schemes", () => {
    expect(isSafeUrl("ftp://example.com/unsub")).toBe(false);
    expect(isSafeUrl("file:///etc/passwd")).toBe(false);
  });

  it("blocks invalid URLs", () => {
    expect(isSafeUrl("not-a-url")).toBe(false);
    expect(isSafeUrl("")).toBe(false);
  });

  // Should allow
  it("allows valid public HTTPS URLs", () => {
    expect(isSafeUrl("https://example.com/unsub")).toBe(true);
    expect(isSafeUrl("https://newsletter.mailchimp.com/unsubscribe?id=123")).toBe(true);
  });

  it("allows valid public HTTP URLs", () => {
    expect(isSafeUrl("http://example.com/unsub")).toBe(true);
  });

  it("allows public IP addresses", () => {
    expect(isSafeUrl("https://8.8.8.8/unsub")).toBe(true);
    expect(isSafeUrl("https://1.1.1.1/unsub")).toBe(true);
  });
});
