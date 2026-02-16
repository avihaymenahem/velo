import type { QuickStep, QuickStepAction, QuickStepExecutionResult } from "./types";
import { ACTION_TYPE_METADATA } from "./types";
import { archiveThread, trashThread, markThreadRead, starThread, spamThread, addThreadLabel, removeThreadLabel } from "../emailActions";
import {
  pinThread as pinThreadDb,
  unpinThread as unpinThreadDb,
} from "../db/threads";
import { setThreadCategory } from "../db/threadCategories";
import { snoozeThread } from "../snooze/snoozeManager";
import { useThreadStore } from "@/stores/threadStore";

/**
 * Execute a single action for a set of threads.
 * For reply/replyAll/forward, only the first thread is used and a window event is dispatched.
 */
async function executeSingleAction(
  action: QuickStepAction,
  threadIds: string[],
  accountId: string,
): Promise<void> {
  switch (action.type) {
    case "archive":
      await Promise.all(threadIds.map((id) => archiveThread(accountId, id, [])));
      break;

    case "trash":
      await Promise.all(threadIds.map((id) => trashThread(accountId, id, [])));
      break;

    case "markRead":
      await Promise.all(threadIds.map((id) => markThreadRead(accountId, id, [], true)));
      break;

    case "markUnread":
      await Promise.all(threadIds.map((id) => markThreadRead(accountId, id, [], false)));
      break;

    case "star":
      await Promise.all(threadIds.map((id) => starThread(accountId, id, [], true)));
      break;

    case "unstar":
      await Promise.all(threadIds.map((id) => starThread(accountId, id, [], false)));
      break;

    case "pin":
      await Promise.all(threadIds.map(async (id) => {
        await pinThreadDb(accountId, id);
        useThreadStore.getState().updateThread(id, { isPinned: true });
      }));
      break;

    case "unpin":
      await Promise.all(threadIds.map(async (id) => {
        await unpinThreadDb(accountId, id);
        useThreadStore.getState().updateThread(id, { isPinned: false });
      }));
      break;

    case "applyLabel":
      if (action.params?.labelId) {
        const labelId = action.params.labelId;
        const threadMap = new Map(useThreadStore.getState().threads.map((t) => [t.id, t]));
        await Promise.all(threadIds.map(async (id) => {
          await addThreadLabel(accountId, id, labelId);
          const thread = threadMap.get(id);
          if (thread && !thread.labelIds.includes(labelId)) {
            useThreadStore.getState().updateThread(id, {
              labelIds: [...thread.labelIds, labelId],
            });
          }
        }));
      }
      break;

    case "removeLabel":
      if (action.params?.labelId) {
        const labelId = action.params.labelId;
        const threadMap = new Map(useThreadStore.getState().threads.map((t) => [t.id, t]));
        await Promise.all(threadIds.map(async (id) => {
          await removeThreadLabel(accountId, id, labelId);
          const thread = threadMap.get(id);
          if (thread) {
            useThreadStore.getState().updateThread(id, {
              labelIds: thread.labelIds.filter((l) => l !== labelId),
            });
          }
        }));
      }
      break;

    case "moveToCategory":
      if (action.params?.category) {
        await Promise.all(threadIds.map((id) =>
          setThreadCategory(accountId, id, action.params!.category!, true),
        ));
        window.dispatchEvent(new Event("velo-sync-done"));
      }
      break;

    case "reply":
      window.dispatchEvent(
        new CustomEvent("velo-inline-reply", {
          detail: { threadId: threadIds[0], accountId, mode: "reply" },
        }),
      );
      break;

    case "replyAll":
      window.dispatchEvent(
        new CustomEvent("velo-inline-reply", {
          detail: { threadId: threadIds[0], accountId, mode: "replyAll" },
        }),
      );
      break;

    case "forward":
      window.dispatchEvent(
        new CustomEvent("velo-inline-reply", {
          detail: { threadId: threadIds[0], accountId, mode: "forward" },
        }),
      );
      break;

    case "snooze":
      if (action.params?.snoozeDuration) {
        const until = Date.now() + action.params.snoozeDuration;
        await Promise.all(threadIds.map((id) => snoozeThread(accountId, id, until)));
      }
      break;

    case "spam":
      await Promise.all(threadIds.map((id) => spamThread(accountId, id, [], true)));
      break;

    case "notSpam":
      await Promise.all(threadIds.map((id) => spamThread(accountId, id, [], false)));
      break;
  }
}

/**
 * Execute a quick step action chain on one or more threads.
 *
 * Actions are executed sequentially. By default, execution stops on the
 * first error (fail-fast). If `quickStep.continueOnError` is true,
 * subsequent actions will still be attempted.
 *
 * Thread removal from the UI is deferred until after all actions complete.
 */
export async function executeQuickStep(
  quickStep: QuickStep,
  threadIds: string[],
  accountId: string,
): Promise<QuickStepExecutionResult> {
  const totalActions = quickStep.actions.length;
  let completedActions = 0;

  // Track which action types remove threads from view
  const removesFromView = new Set(
    ACTION_TYPE_METADATA
      .filter((m) => m.removesFromView)
      .map((m) => m.type),
  );

  let shouldRemoveThreads = false;

  for (let i = 0; i < quickStep.actions.length; i++) {
    const action = quickStep.actions[i]!;

    try {
      await executeSingleAction(action, threadIds, accountId);
      completedActions++;

      if (removesFromView.has(action.type)) {
        shouldRemoveThreads = true;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      if (!quickStep.continueOnError) {
        // Fail-fast: still remove threads if a prior action flagged removal
        if (shouldRemoveThreads) {
          useThreadStore.getState().removeThreads(threadIds);
        }
        return {
          success: false,
          completedActions,
          totalActions,
          error: errorMessage,
          failedActionIndex: i,
        };
      }
      // Continue-on-error: keep going, but track the failure
    }
  }

  // After all actions complete, batch-remove threads if any action flagged it
  if (shouldRemoveThreads) {
    useThreadStore.getState().removeThreads(threadIds);
  }

  return {
    success: true,
    completedActions,
    totalActions,
  };
}
