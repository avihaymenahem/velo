import { matchSmartLabels } from "./smartLabelService";
import { addThreadLabel } from "@/services/emailActions";
import type { ParsedMessage } from "@/services/gmail/messageParser";

/**
 * Apply smart labels to newly synced messages.
 * Non-blocking — all errors are caught and logged.
 */
export async function applySmartLabelsToMessages(
  accountId: string,
  messages: ParsedMessage[],
): Promise<void> {
  try {
    const matches = await matchSmartLabels(accountId, messages);

    await Promise.allSettled(
      matches.flatMap(({ threadId, labelIds }) =>
        labelIds.map((labelId) =>
          addThreadLabel(accountId, threadId, labelId).catch((err) => {
            console.error(`Failed to apply smart label ${labelId} to thread ${threadId}:`, err);
          }),
        ),
      ),
    );
  } catch (err) {
    console.error("Smart label application failed:", err);
  }
}
