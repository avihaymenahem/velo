import i18n from "@/i18n";

export type ErrorType = "network" | "auth" | "quota" | "server" | "permanent";

export interface ClassifiedError {
  type: ErrorType;
  isRetryable: boolean;
  message: string;
}

const NETWORK_PATTERNS = [
  "failed to fetch",
  "network",
  "timeout",
  "timed out",
  "econnrefused",
  "connection refused",
  "econnreset",
  "enotfound",
  "dns",
  "socket hang up",
  "socket",
  "aborted",
  "network error",
  "net::err",
  "tcp connect",
  "tls handshake",
];

const AUTH_PATTERNS = [
  "authentication failed",
  "login failed",
  "invalid credentials",
  "login denied",
  "authenticate failed",
];

export function classifyError(error: unknown): ClassifiedError {
  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");
  const lower = message.toLowerCase();

  // Check for HTTP status codes in the message
  const statusMatch = lower.match(/\b(4\d{2}|5\d{2})\b/);
  const statusCode = statusMatch ? parseInt(statusMatch[1]!, 10) : null;

  if (statusCode === 401 || statusCode === 403) {
    return { type: "auth", isRetryable: false, message };
  }

  if (statusCode === 429) {
    return { type: "quota", isRetryable: true, message };
  }

  if (statusCode !== null && statusCode >= 500) {
    return { type: "server", isRetryable: true, message };
  }

  // Check IMAP auth error patterns
  if (AUTH_PATTERNS.some((pattern) => lower.includes(pattern))) {
    return { type: "auth", isRetryable: false, message };
  }

  // Check network error patterns
  if (NETWORK_PATTERNS.some((pattern) => lower.includes(pattern))) {
    return { type: "network", isRetryable: true, message };
  }

  // Check if the error object has a status property (e.g., fetch Response errors)
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status: number }).status;
    if (status === 401 || status === 403) {
      return { type: "auth", isRetryable: false, message };
    }
    if (status === 429) {
      return { type: "quota", isRetryable: true, message };
    }
    if (status >= 500) {
      return { type: "server", isRetryable: true, message };
    }
  }

  return { type: "permanent", isRetryable: false, message };
}

/**
 * Translate a raw sync error string into a user-friendly message.
 */
export function formatSyncError(rawError: string): string {
  const lower = rawError.toLowerCase();

  if (AUTH_PATTERNS.some((p) => lower.includes(p))) {
    return i18n.t("networkErrors.authFailed");
  }
  if (lower.includes("timed out") || lower.includes("timeout")) {
    return i18n.t("networkErrors.timedOut");
  }
  if (lower.includes("tls") || lower.includes("ssl") || lower.includes("certificate")) {
    return i18n.t("networkErrors.tlsFailed");
  }
  if (lower.includes("econnrefused") || lower.includes("connection refused")) {
    return i18n.t("networkErrors.connectionRefused");
  }
  if (lower.includes("dns") || lower.includes("enotfound") || lower.includes("server not found")) {
    return i18n.t("networkErrors.serverNotFound");
  }

  // Fallback: truncate long technical errors
  if (rawError.length > 100) {
    return rawError.slice(0, 100) + "\u2026";
  }
  return rawError;
}
