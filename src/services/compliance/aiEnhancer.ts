import type { ComplianceProfile, ComplianceCheckContext } from "./types";
import { getSetting } from "@/services/db/settings";

const COMPLIANCE_PROMPT_TEMPLATE = `You are a compliance assistant. The following email is being sent under {PROFILE_NAME}.
Recipient jurisdiction: {JURISDICTION}
Rules: {RULES_JSON}
Email subject: {SUBJECT}
Email body: {BODY}
Check for violations and suggest fixes. Respond in {LOCALE}.

Return a JSON object with:
- "warnings": string[] - list of compliance warnings
- "suggestions": string[] - list of improvement suggestions
- "scoreAdjustment": number - a score adjustment (-20 to 0) based on tone/ language issues found

Only return the JSON object, no other text.`;

export async function enhanceWithAi(
  profile: ComplianceProfile,
  context: Pick<ComplianceCheckContext, "subject" | "bodyHtml" | "senderEmail" | "recipients">,
  locale: string = "en",
): Promise<{
  warnings: string[];
  suggestions: string[];
  scoreAdjustment: number;
} | null> {
  try {
    const aiEnabled = await getSetting("ai_enabled");
    if (aiEnabled !== "true") return null;

    const bodyText = context.bodyHtml.replace(/<[^>]*>/g, "").slice(0, 3000);
    const jurisdictions = context.recipients.map((r) => r.email.split("@")[1]).filter(Boolean).join(", ");

    const prompt = COMPLIANCE_PROMPT_TEMPLATE
      .replace("{PROFILE_NAME}", profile.name)
      .replace("{JURISDICTION}", jurisdictions || "unknown")
      .replace("{RULES_JSON}", JSON.stringify(profile.rules))
      .replace("{SUBJECT}", context.subject || "(no subject)")
      .replace("{BODY}", bodyText || "(empty)")
      .replace("{LOCALE}", locale);

    const { getActiveProvider } = await import("@/services/ai/providerManager");
    const provider = await getActiveProvider();
    const response = await provider.complete({ systemPrompt: prompt, userContent: "Analyze compliance." });

    try {
      const parsed = JSON.parse(response) as {
        warnings?: string[];
        suggestions?: string[];
        scoreAdjustment?: number;
      };
      return {
        warnings: parsed.warnings ?? [],
        suggestions: parsed.suggestions ?? [],
        scoreAdjustment: Math.max(-20, Math.min(0, parsed.scoreAdjustment ?? 0)),
      };
    } catch {
      return { warnings: [], suggestions: [], scoreAdjustment: 0 };
    }
  } catch {
    return null;
  }
}
