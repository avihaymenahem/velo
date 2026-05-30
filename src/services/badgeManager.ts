import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { getUnreadInboxCount } from "./db/threads";

let lastCount = -1;

export async function updateBadgeCount(): Promise<void> {
  try {
    const count = await getUnreadInboxCount();
    if (count === lastCount) return;
    lastCount = count;

    const win = getCurrentWindow();
    // setBadgeCount sets the dock/taskbar badge number (macOS + Linux).
    // setBadgeLabel sets the dock tile label string (macOS only).
    // We call both: some macOS versions respond better to one than the other.
    try {
      await win.setBadgeCount(count > 0 ? count : undefined);
    } catch (err) {
      console.warn("[badge] setBadgeCount failed:", err);
    }
    try {
      await win.setBadgeLabel(count > 0 ? String(count) : undefined);
    } catch {
      // setBadgeLabel is macOS-only; silently ignore on other platforms
    }

    const tooltip = count > 0 ? `Melo - ${count} unread` : "Melo";
    try {
      await invoke("set_tray_tooltip", { tooltip });
      await invoke("set_tray_badge", { count: count > 0 ? count : null });
    } catch {
      // tray tooltip update is best-effort
    }
  } catch (err) {
    console.error("Failed to update badge count:", err);
  }
}
