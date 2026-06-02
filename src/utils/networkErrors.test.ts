import { classifyError, formatSyncError } from "./networkErrors";

describe("classifyError", () => {
  it("classifies 'Failed to fetch' as network (retryable)", () => {
    const result = classifyError(new Error("Failed to fetch"));
    expect(result.type).toBe("network");
    expect(result.isRetryable).toBe(true);
  });

  it("classifies timeout errors as network (retryable)", () => {
    const result = classifyError(new Error("Request timeout after 30s"));
    expect(result.type).toBe("network");
    expect(result.isRetryable).toBe(true);
  });

  it("classifies ECONNREFUSED as network (retryable)", () => {
    const result = classifyError(new Error("connect ECONNREFUSED 127.0.0.1:443"));
    expect(result.type).toBe("network");
    expect(result.isRetryable).toBe(true);
  });

  it("classifies 401 as auth (not retryable)", () => {
    const result = classifyError(new Error("HTTP 401 Unauthorized"));
    expect(result.type).toBe("auth");
    expect(result.isRetryable).toBe(false);
  });

  it("classifies 403 as auth (not retryable)", () => {
    const result = classifyError(new Error("HTTP 403 Forbidden"));
    expect(result.type).toBe("auth");
    expect(result.isRetryable).toBe(false);
  });

  it("classifies 429 as quota (retryable)", () => {
    const result = classifyError(new Error("HTTP 429 Too Many Requests"));
    expect(result.type).toBe("quota");
    expect(result.isRetryable).toBe(true);
  });

  it("classifies 500 as server (retryable)", () => {
    const result = classifyError(new Error("HTTP 500 Internal Server Error"));
    expect(result.type).toBe("server");
    expect(result.isRetryable).toBe(true);
  });

  it("classifies 503 as server (retryable)", () => {
    const result = classifyError(new Error("HTTP 503 Service Unavailable"));
    expect(result.type).toBe("server");
    expect(result.isRetryable).toBe(true);
  });

  it("classifies unknown errors as permanent (not retryable)", () => {
    const result = classifyError(new Error("Something completely unexpected"));
    expect(result.type).toBe("permanent");
    expect(result.isRetryable).toBe(false);
  });

  it("handles non-Error objects", () => {
    const result = classifyError("string error");
    expect(result.type).toBe("permanent");
    expect(result.message).toBe("string error");
  });

  it("handles null/undefined", () => {
    const result = classifyError(null);
    expect(result.type).toBe("permanent");
    expect(result.message).toBe("Unknown error");
  });

  it("classifies objects with status property", () => {
    const result = classifyError({ status: 500, message: "server error" });
    expect(result.type).toBe("server");
    expect(result.isRetryable).toBe(true);
  });

  it("classifies socket hang up as network", () => {
    const result = classifyError(new Error("socket hang up"));
    expect(result.type).toBe("network");
    expect(result.isRetryable).toBe(true);
  });

  it("classifies DNS errors as network", () => {
    const result = classifyError(new Error("getaddrinfo ENOTFOUND gmail.googleapis.com"));
    expect(result.type).toBe("network");
    expect(result.isRetryable).toBe(true);
  });

  it("classifies 'timed out' as network (IMAP pattern)", () => {
    const result = classifyError("TCP connect timed out (os error 60)");
    expect(result.type).toBe("network");
    expect(result.isRetryable).toBe(true);
  });

  it("classifies 'tcp connect' as network (IMAP pattern)", () => {
    const result = classifyError("tcp connect failed");
    expect(result.type).toBe("network");
    expect(result.isRetryable).toBe(true);
  });

  it("classifies 'tls handshake' as network (IMAP pattern)", () => {
    const result = classifyError("tls handshake error: certificate verify failed");
    expect(result.type).toBe("network");
    expect(result.isRetryable).toBe(true);
  });

  it("classifies IMAP 'authentication failed' as auth", () => {
    const result = classifyError("authentication failed for user@example.com");
    expect(result.type).toBe("auth");
    expect(result.isRetryable).toBe(false);
  });

  it("classifies IMAP 'login failed' as auth", () => {
    const result = classifyError("login failed: invalid password");
    expect(result.type).toBe("auth");
    expect(result.isRetryable).toBe(false);
  });

  it("classifies 'invalid credentials' as auth", () => {
    const result = classifyError("invalid credentials");
    expect(result.type).toBe("auth");
    expect(result.isRetryable).toBe(false);
  });
});

describe("formatSyncError", () => {
  it("translates timeout errors", () => {
    expect(formatSyncError("TCP connect timed out (os error 60)")).toBe(
      "Connection timed out \u2014 check your internet or server settings",
    );
  });

  it("translates auth errors", () => {
    expect(formatSyncError("authentication failed for user@test.com")).toBe(
      "Authentication failed \u2014 check your password",
    );
  });

  it("translates TLS errors", () => {
    expect(formatSyncError("TLS handshake failed: certificate verify error")).toBe(
      "Secure connection failed \u2014 check security settings",
    );
  });

  it("translates connection refused", () => {
    expect(formatSyncError("connect ECONNREFUSED 127.0.0.1:993")).toBe(
      "Could not reach mail server \u2014 check address and port",
    );
  });

  it("translates DNS errors", () => {
    expect(formatSyncError("DNS resolution failed for imap.bad.host")).toBe(
      "Server not found \u2014 check hostname",
    );
  });

  it("uses custom user-facing messages", () => {
    const messages = {
      auth: "认证失败，请检查密码",
      timeout: "连接超时，请检查网络或服务器设置",
      secureConnection: "安全连接失败，请检查安全设置",
      connectionRefused: "无法连接邮件服务器，请检查地址和端口",
      serverNotFound: "未找到服务器，请检查主机名",
    };

    expect(formatSyncError("authentication failed", messages)).toBe("认证失败，请检查密码");
    expect(formatSyncError("TCP connect timed out", messages)).toBe("连接超时，请检查网络或服务器设置");
    expect(formatSyncError("TLS handshake failed", messages)).toBe("安全连接失败，请检查安全设置");
    expect(formatSyncError("connect ECONNREFUSED 127.0.0.1:993", messages)).toBe("无法连接邮件服务器，请检查地址和端口");
    expect(formatSyncError("DNS resolution failed", messages)).toBe("未找到服务器，请检查主机名");
  });

  it("truncates long errors at 100 chars", () => {
    const longError = "A".repeat(150);
    const result = formatSyncError(longError);
    expect(result).toHaveLength(101); // 100 chars + ellipsis
    expect(result.endsWith("\u2026")).toBe(true);
  });

  it("passes through short unknown errors unchanged", () => {
    expect(formatSyncError("Something unexpected")).toBe("Something unexpected");
  });
});
