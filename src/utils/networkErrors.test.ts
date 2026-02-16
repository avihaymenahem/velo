import { classifyError } from "./networkErrors";

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
});
