export type AiProvider = "claude" | "openai" | "gemini" | "ollama" | "copilot";

export interface AiCompletionRequest {
  systemPrompt: string;
  userContent: string;
  maxTokens?: number;
}

export interface AiProviderClient {
  complete(req: AiCompletionRequest): Promise<string>;
  testConnection(): Promise<boolean>;
}

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  claude: "claude-haiku-4-5-20251001",
  openai: "gpt-4o-mini",
  gemini: "gemini-2.5-flash-preview-05-20",
  ollama: "llama3.2",
  copilot: "openai/gpt-4o-mini",
};

export interface ModelOption {
  id: string;
  label: string;
}

export const PROVIDER_MODELS: Record<Exclude<AiProvider, "ollama">, ModelOption[]> = {
  claude: [
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
    { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { id: "claude-opus-4-20250514", label: "Claude Opus 4" },
  ],
  openai: [
    { id: "gpt-4o-mini", label: "GPT-4o Mini" },
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "gpt-4.1-nano", label: "GPT-4.1 Nano" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
    { id: "gpt-4.1", label: "GPT-4.1" },
  ],
  gemini: [
    { id: "gemini-2.5-flash-preview-05-20", label: "Gemini 2.5 Flash" },
    { id: "gemini-2.5-pro-preview-05-06", label: "Gemini 2.5 Pro" },
  ],
  copilot: [
    { id: "openai/gpt-4o-mini", label: "GPT-4o Mini (Low)" },
    { id: "openai/gpt-4.1-nano", label: "GPT-4.1 Nano (Low)" },
    { id: "openai/gpt-4.1-mini", label: "GPT-4.1 Mini (High)" },
    { id: "openai/gpt-4o", label: "GPT-4o (High)" },
    { id: "openai/gpt-4.1", label: "GPT-4.1 (High)" },
  ],
};

export const MODEL_SETTINGS: Record<Exclude<AiProvider, "ollama">, string> = {
  claude: "claude_model",
  openai: "openai_model",
  gemini: "gemini_model",
  copilot: "copilot_model",
};

export interface ProofreadIssue {
  type: "tone" | "clarity" | "missing_attachment" | "other";
  description: string;
  severity: "info" | "warning" | "error";
}

export interface ProofreadResult {
  issues: ProofreadIssue[];
  overallScore: "good" | "caution" | "warning";
}

export interface MeetingDetectionResult {
  title: string;
  dateTime?: string;        // ISO 8601
  durationMinutes?: number;
  location?: string;
  attendees: string[];      // email addresses
  confidence: "low" | "medium" | "high";
}

export interface FilterSuggestion {
  fromPattern?: string;
  subjectPattern?: string;
  suggestedAction: "archive" | "label" | "trash";
  reason: string;
  exampleCount: number;
}
