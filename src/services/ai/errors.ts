export type AiErrorCode =
  | "NOT_CONFIGURED"
  | "AUTH_ERROR"
  | "RATE_LIMITED"
  | "NETWORK_ERROR";

export class AiError extends Error {
  code: AiErrorCode;

  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.name = "AiError";
    this.code = code;
  }
}
