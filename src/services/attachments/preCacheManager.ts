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

async function preCacheRecent(): Promise<void> {
  // Skip if offline
  if (!useUIStore.getState().isOnline) return;

  const db = await getDb();

  // Get total cache size
  const sizeResult = await db.select<{ total: number | null }[]>(
    "SELECT SUM(cache_size) as total FROM attachments WHERE cached_at IS NOT NULL",
  );
  const currentCacheSize = sizeResult[0]?.total ?? 0;

  const maxCacheMb = parseInt((await getSetting("attachment_cache_max_mb")) ?? "500", 10);
  const maxCacheBytes = maxCacheMb * 1024 * 1024;

  if (currentCacheSize >= maxCacheBytes) return;

  // Find uncached small recent attachments
  const cutoff = Math.floor(Date.now() / 1000) - RECENT_DAYS * 24 * 60 * 60;
  const attachments = await db.select<{
    id: string;
    message_id: string;
    account_id: string;
    size: number;
    gmail_attachment_id: string | null;
    imap_part_id: string | null;
  }[]>(
    `SELECT a.id, a.message_id, a.account_id, a.size, a.gmail_attachment_id, a.imap_part_id
     FROM attachments a
     INNER JOIN messages m ON m.account_id = a.account_id AND m.id = a.message_id
     WHERE a.cached_at IS NULL
       AND a.is_inline = 0
       AND a.size IS NOT NULL AND a.size <= $1
       AND m.date >= $2
     ORDER BY m.date DESC
     LIMIT $3`,
    [MAX_ATTACHMENT_SIZE, cutoff, BATCH_LIMIT],
  );

  for (const att of attachments) {
    // Check cache limit
    if (currentCacheSize + (att.size ?? 0) > maxCacheBytes) break;

    try {
      const attachmentId = att.gmail_attachment_id ?? att.imap_part_id;
      if (!attachmentId) continue;

      const provider = await getEmailProvider(att.account_id);
      const result = await provider.fetchAttachment(att.message_id, attachmentId);

      // Decode base64 data
      const binary = Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0));
      await cacheAttachment(att.id, binary);
    } catch {
      // Silently skip — will retry next interval
    }
  }
}

export function startPreCacheManager(): void {
  if (checker) return;
  checker = createBackgroundChecker("AttachmentPreCache", preCacheRecent, 900_000);
  checker.start();
}

export function stopPreCacheManager(): void {
  checker?.stop();
  checker = null;
}
