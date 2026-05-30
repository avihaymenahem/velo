import { extractTaskFromThread as aiExtract } from "./aiService";
import type { DbMessage } from "@/services/db/messages";
import type { TaskPriority, TaskDirection } from "@/services/db/tasks";

export interface ExtractedTask {
  title: string;
  description: string | null;
  dueDate: number | null;
  priority: TaskPriority;
  direction: TaskDirection;
}

const VALID_PRIORITIES = new Set<TaskPriority>(["none", "low", "medium", "high", "urgent"]);
const VALID_DIRECTIONS = new Set<TaskDirection>(["incoming", "outgoing"]);

function parseOne(raw: unknown, fallbackTitle: string): ExtractedTask {
  if (typeof raw !== "object" || raw === null) {
    return { title: fallbackTitle, description: null, dueDate: null, priority: "medium", direction: "outgoing" };
  }
  const obj = raw as Record<string, unknown>;
  return {
    title: (typeof obj.title === "string" && obj.title.trim())
      ? obj.title.trim()
      : fallbackTitle,
    description: typeof obj.description === "string" ? obj.description : null,
    dueDate: typeof obj.dueDate === "number" ? obj.dueDate : null,
    priority: VALID_PRIORITIES.has(obj.priority as TaskPriority)
      ? (obj.priority as TaskPriority)
      : "medium",
    direction: VALID_DIRECTIONS.has(obj.direction as TaskDirection)
      ? (obj.direction as TaskDirection)
      : "outgoing",
  };
}

/**
 * Extract tasks from a thread using AI. Returns an array of tasks,
 * each classified as incoming (asked of you) or outgoing (you promised).
 */
export async function extractTasks(
  threadId: string,
  accountId: string,
  messages: DbMessage[],
): Promise<ExtractedTask[]> {
  const raw = await aiExtract(threadId, accountId, messages);
  const subject = messages[0]?.subject ?? "Email task";
  const fallbackTitle = `Follow up on: ${subject}`;

  try {
    // Support both array [...] and single object {...} responses
    const jsonMatch = raw.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in AI response");

    const parsed: unknown = JSON.parse(jsonMatch[0]);

    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return [{ title: fallbackTitle, description: null, dueDate: null, priority: "medium", direction: "outgoing" }];
      return parsed.map((item) => parseOne(item, fallbackTitle));
    }

    // Legacy single-object response — wrap in array
    return [parseOne(parsed, fallbackTitle)];
  } catch {
    return [{ title: fallbackTitle, description: null, dueDate: null, priority: "medium", direction: "outgoing" }];
  }
}

/** @deprecated Use extractTasks() for multi-task extraction */
export async function extractTask(
  threadId: string,
  accountId: string,
  messages: DbMessage[],
): Promise<ExtractedTask> {
  const tasks = await extractTasks(threadId, accountId, messages);
  return tasks[0]!;
}
