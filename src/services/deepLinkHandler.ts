import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { parseMailtoUrl } from "../utils/mailtoParser";
import { useComposerStore } from "../stores/composerStore";
import { escapeHtml } from "../utils/sanitize";

async function handleUrl(url: string): Promise<void> {
  if (!url.startsWith("mailto:")) return;

  const fields = parseMailtoUrl(url);

  // Show and focus the main window
  const mainWindow = await WebviewWindow.getByLabel("main");
  if (mainWindow) {
    await mainWindow.show();
    await mainWindow.setFocus();
  }

  // Open composer with parsed fields
  useComposerStore.getState().openComposer({
    mode: "new",
    to: fields.to,
    cc: fields.cc,
    bcc: fields.bcc,
    subject: fields.subject,
    bodyHtml: fields.body ? `<p>${escapeHtml(fields.body)}</p>` : "",
  });
}

export async function initDeepLinkHandler(): Promise<() => void> {
  const cleanups: Array<() => void> = [];

  // Listen for URLs when app is already running
  try {
    const unlistenOpenUrl = await onOpenUrl((urls) => {
      for (const url of urls) {
        handleUrl(url);
      }
    });
    cleanups.push(unlistenOpenUrl);
  } catch (err) {
    console.error("Failed to register deep link handler:", err);
  }

  // Listen for forwarded args from single-instance plugin
  try {
    const unlistenArgs = await listen<string[]>("single-instance-args", (event) => {
      for (const arg of event.payload) {
        if (arg.startsWith("mailto:")) {
          handleUrl(arg);
        }
      }
    });
    cleanups.push(unlistenArgs);
  } catch (err) {
    console.error("Failed to listen for single-instance args:", err);
  }

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}
