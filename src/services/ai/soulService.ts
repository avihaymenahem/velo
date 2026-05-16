import { useEffect, useState } from "react";
import { readTextFile, writeTextFile, watch, BaseDirectory } from "@tauri-apps/plugin-fs";
import { appDataDir } from "@tauri-apps/api/path";
import { resolve } from "@tauri-apps/api/path";

let soulContent: string | null = null;
let listeners: Set<() => void> = new Set();
let watcherUnwatch: (() => void) | null = null;

const DEFAULT_SOUL = `# Melo AI Soul

## Core Identity
You are Melo's assistant — a sophisticated AI integrated into a desktop email client.

## Communication Style
- Concise but thorough
- Professional yet friendly
- Action-oriented

## Email-Specific Behaviors
- Respect email conventions
- Prioritize clarity and professionalism

## Privacy Reminder
All processing happens locally.`;

async function getSoulPath(): Promise<string> {
  const appData = await appDataDir();
  return await resolve(appData, "soul.md");
}

export async function loadSoul(): Promise<string> {
  try {
    const path = await getSoulPath();
    soulContent = await readTextFile(path);
    return soulContent;
  } catch {
    soulContent = DEFAULT_SOUL;
    return DEFAULT_SOUL;
  }
}

export function getSoul(): string {
  return soulContent ?? DEFAULT_SOUL;
}

export async function saveSoul(content: string): Promise<void> {
  soulContent = content;
  try {
    await writeTextFile("soul.md", content, { baseDir: BaseDirectory.AppData });
    // Start watcher now that the file exists (no-op if already running)
    if (!watcherUnwatch) await startSoulWatcher();
  } catch (err) {
    console.error("Failed to save soul.md:", err);
  }
  listeners.forEach((cb) => cb());
}

export async function startSoulWatcher(): Promise<() => void> {
  if (watcherUnwatch) return watcherUnwatch;

  try {
    const path = await getSoulPath();

    const unwatch = await watch(path, (event) => {
      // WatchEvent.type can be 'any' or an object like { modify: { kind: 'data', mode: 'any' } }
      const type = event.type;
      const isModify = type === "any" || (typeof type === "object" && "modify" in type);
      if (isModify) {
        loadSoul().then(() => {
          listeners.forEach((cb) => cb());
        }).catch(console.error);
      }
    });

    watcherUnwatch = unwatch;
  } catch {
    // File doesn't exist yet, will be created on first save
  }

  return () => {
    if (watcherUnwatch) {
      watcherUnwatch();
      watcherUnwatch = null;
    }
  };
}

export function subscribeSoul(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function useSoul() {
  const [content, setContent] = useState<string>(getSoul());

  useEffect(() => {
    const unsubscribe = subscribeSoul(() => setContent(getSoul()));
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return content;
}