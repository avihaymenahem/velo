import { extractTaskFromThread as aiExtract } from "./aiService";
import i18n from "@/i18n";
import type { DbMessage } from "@/services/db/messages";
import type { TaskPriority } from "@/services/db/tasks";

export interface ExtractedTask {
  title: string;
  description: string | null;
  dueDate: number | null;
  priority: TaskPriority;
}

const VALID_PRIORITIES = new Set<TaskPriority>(["none", "low", "medium", "high", "urgent"]);

function formatFallbackTaskTitle(subject: string | null | undefined): string {
  const fallbackSubject = subject?.trim() || i18n.t("tasks:aiExtract.fallbackSubject");
  return i18n.t("tasks:aiExtract.fallbackTitle", { subject: fallbackSubject });
}

/**
 * Extract a task from a thread using AI, with robust parsing of the result.
 */
export async function extractTask(
  threadId: string,
  accountId: string,
  messages: DbMessage[],
): Promise<ExtractedTask> {
  const raw = await aiExtract(threadId, accountId, messages);

  try {
    // Extract JSON from potential markdown code fences
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in AI response");

    const parsed = JSON.parse(jsonMatch[0]) as {
      title?: string;
      description?: string;
      dueDate?: number | null;
      priority?: string;
    };

    const subject = messages[0]?.subject;

    return {
      title: (typeof parsed.title === "string" && parsed.title.trim())
        ? parsed.title.trim()
        : formatFallbackTaskTitle(subject),
      description: typeof parsed.description === "string" ? parsed.description : null,
      dueDate: typeof parsed.dueDate === "number" ? parsed.dueDate : null,
      priority: VALID_PRIORITIES.has(parsed.priority as TaskPriority)
        ? (parsed.priority as TaskPriority)
        : "medium",
    };
  } catch {
    // Fallback if parsing fails
    const subject = messages[0]?.subject;
    return {
      title: formatFallbackTaskTitle(subject),
      description: null,
      dueDate: null,
      priority: "medium",
    };
  }
}
