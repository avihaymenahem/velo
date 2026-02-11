import { register, unregister, isRegistered } from "@tauri-apps/plugin-global-shortcut";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getSetting, setSetting } from "./db/settings";
import { useComposerStore } from "../stores/composerStore";

const DEFAULT_SHORTCUT = "CmdOrCtrl+Shift+M";
let currentShortcut: string | null = null;

async function handleComposeShortcut(): Promise<void> {
  const mainWindow = await WebviewWindow.getByLabel("main");
  if (mainWindow) {
    await mainWindow.show();
    await mainWindow.setFocus();
  }
  useComposerStore.getState().openComposer();
}

export async function initGlobalShortcut(): Promise<void> {
  const saved = await getSetting("global_compose_shortcut");
  const shortcut = saved ?? DEFAULT_SHORTCUT;

  try {
    const alreadyRegistered = await isRegistered(shortcut);
    if (!alreadyRegistered) {
      await register(shortcut, handleComposeShortcut);
    }
    currentShortcut = shortcut;
  } catch (err) {
    console.error("Failed to register global shortcut:", err);
  }
}

export async function registerComposeShortcut(shortcut: string): Promise<void> {
  if (currentShortcut) {
    try {
      await unregister(currentShortcut);
    } catch {
      // ignore if already unregistered
    }
  }

  await register(shortcut, handleComposeShortcut);
  currentShortcut = shortcut;
  await setSetting("global_compose_shortcut", shortcut);
}

export async function unregisterComposeShortcut(): Promise<void> {
  if (currentShortcut) {
    try {
      await unregister(currentShortcut);
    } catch {
      // ignore
    }
    currentShortcut = null;
  }
}

export function getCurrentShortcut(): string | null {
  return currentShortcut;
}

export { DEFAULT_SHORTCUT };
