import { isAiAvailable } from "./providerManager";
import { categorizeThreads } from "./aiService";
import { getSetting } from "@/services/db/settings";
import {
  getUncategorizedInboxThreadIds,
  setThreadCategoriesBatch,
} from "@/services/db/threadCategories";

export async function categorizeNewThreads(accountId: string): Promise<void> {
  try {
    // Check if AI and auto-categorize are enabled
    const aiAvail = await isAiAvailable();
    if (!aiAvail) return;

    const autoCat = await getSetting("ai_auto_categorize");
    if (autoCat === "false") return;

    // Get uncategorized inbox threads
    const threads = await getUncategorizedInboxThreadIds(accountId, 20);
    if (threads.length === 0) return;

    // Categorize via AI
    const categories = await categorizeThreads(
      threads.map((t) => ({
        id: t.id,
        subject: t.subject ?? "",
        snippet: t.snippet ?? "",
        fromAddress: t.fromAddress ?? "",
      })),
    );

    if (categories.size === 0) return;

    // Store results
    await setThreadCategoriesBatch(accountId, categories);
  } catch (err) {
    // Non-blocking — log and continue
    console.error("Auto-categorization failed:", err);
  }
}
