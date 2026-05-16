import { createBackgroundChecker, type BackgroundChecker } from "../backgroundCheckers";
import { getDb } from "../db/connection";
import { getSetting } from "../db/settings";
import { getEmailProvider } from "../email/providerFactory";
import { cacheAttachment } from "./cacheManager";
import { useUIStore } from "@/stores/uiStore";

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024; // 5MB
const RECENT_DAYS = 7;
const BATCH_LIMIT = 20;

let checker: BackgroundChecker | null = null;
let isRunning = false;

async function preCacheRecent(): Promise<void> {
  // Prevent concurrent runs (React StrictMode double-init causes two simultaneous starts)
  if (isRunning) return;
  isRunning = true;
  try {
    await preCacheRecentInner();
  } finally {
    isRunning = false;
  }
}

async function preCacheRecentInner(): Promise<void> {
  if (!useUIStore.getState().isOnline) return;

  const db = await getDb();

  const sizeResult = await db.select<{ total: number | null }[]>(
    "SELECT SUM(cache_size) as total FROM attachments WHERE cached_at IS NOT NULL",
  );
  let runningSize = sizeResult[0]?.total ?? 0;

  const maxCacheMb = parseInt((await getSetting("attachment_cache_max_mb")) ?? "500", 10);
  const maxCacheBytes = maxCacheMb * 1024 * 1024;

  if (runningSize >= maxCacheBytes) return;

  // Pre-cache only Gmail attachments (gmail_attachment_id IS NOT NULL).
  //
  // IMAP attachments are intentionally excluded:
  // - Each IMAP fetch allocates large Rust buffers (async-imap buffers the full response)
  // - 20 sequential fetches across different Tokio threads each get a separate jemalloc
  //   arena — freed pages (MADV_FREE on macOS) cannot be reused across arenas
  // - This causes cumulative physical-footprint growth of 2-3 GB per pre-cache run
  //
  // Gmail attachments fetch via native WKWebView HTTP (no Rust/XPC binary transfer for
  // the download itself), and JavaScriptCore's GC reclaims memory between iterations,
  // so the same loop is safe there.
  const cutoff = Math.floor(Date.now() / 1000) - RECENT_DAYS * 24 * 60 * 60;
  const attachments = await db.select<{
    id: string;
    message_id: string;
    account_id: string;
    size: number;
    gmail_attachment_id: string;
  }[]>(
    `SELECT a.id, a.message_id, a.account_id, a.size, a.gmail_attachment_id
     FROM attachments a
     INNER JOIN messages m ON m.account_id = a.account_id AND m.id = a.message_id
     WHERE a.cached_at IS NULL
       AND a.is_inline = 0
       AND a.gmail_attachment_id IS NOT NULL
       AND a.size IS NOT NULL AND a.size <= $1
       AND m.date >= $2
     ORDER BY m.date DESC
     LIMIT $3`,
    [MAX_ATTACHMENT_SIZE, cutoff, BATCH_LIMIT],
  );

  if (attachments.length === 0) return;

  for (const att of attachments) {
    if (runningSize + (att.size ?? 0) > maxCacheBytes) break;

    try {
      const provider = await getEmailProvider(att.account_id);
      const result = await provider.fetchAttachment(att.message_id, att.gmail_attachment_id);

      const base64 = result.data.includes("-") || result.data.includes("_")
        ? result.data.replace(/-/g, "+").replace(/_/g, "/")
        : result.data;
      const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      await cacheAttachment(att.id, binary);
      runningSize += binary.length;
    } catch {
      // Silently skip — will retry next interval
    }
  }
}

const STARTUP_DELAY_MS = 2 * 60 * 1000; // 2 minutes — let app settle before pre-caching

export function startPreCacheManager(): void {
  if (checker) return;
  checker = createBackgroundChecker("AttachmentPreCache", preCacheRecent, 900_000);
  // Delay first run so it doesn't compete with app startup and initial sync
  setTimeout(() => checker?.start(), STARTUP_DELAY_MS);
}

export function stopPreCacheManager(): void {
  checker?.stop();
  checker = null;
}
