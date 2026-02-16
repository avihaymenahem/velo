import { getDb } from "@/services/db/connection";
import { getSetting } from "@/services/db/settings";

const CACHE_DIR = "attachment_cache";

function hashFileName(id: string): string {
  // Use simple DJB2-based hash to create a short, filesystem-safe name
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < id.length; i++) {
    const ch = id.charCodeAt(i);
    h1 = (h1 * 33) ^ ch;
    h2 = (h2 * 33) ^ ch;
    h1 = h1 >>> 0;
    h2 = h2 >>> 0;
  }
  return `${h1.toString(36)}_${h2.toString(36)}`;
}

export async function cacheAttachment(
  attachmentId: string,
  data: Uint8Array,
): Promise<string> {
  try {
    const { mkdir, writeFile: fsWriteFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");
    const baseDir = BaseDirectory.AppData;

    // Ensure cache directory exists
    try {
      await mkdir(CACHE_DIR, { baseDir, recursive: true });
    } catch {
      // directory may already exist
    }

    const { join } = await import("@tauri-apps/api/path");
    const relPath = await join(CACHE_DIR, hashFileName(attachmentId));
    await fsWriteFile(relPath, data, { baseDir });

    // Update DB — store relative path under AppData
    const db = await getDb();
    await db.execute(
      "UPDATE attachments SET local_path = $1, cached_at = unixepoch(), cache_size = $2 WHERE id = $3",
      [relPath, data.length, attachmentId],
    );

    return relPath;
  } catch (err) {
    console.error("Failed to cache attachment:", err);
    throw err;
  }
}

export async function loadCachedAttachment(
  localPath: string,
): Promise<Uint8Array | null> {
  try {
    const { readFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");
    return await readFile(localPath, { baseDir: BaseDirectory.AppData });
  } catch {
    return null;
  }
}

export async function getCacheSize(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ total: number }[]>(
    "SELECT COALESCE(SUM(cache_size), 0) as total FROM attachments WHERE cached_at IS NOT NULL",
  );
  return rows[0]?.total ?? 0;
}

export async function evictOldestCached(): Promise<void> {
  const maxMbStr = await getSetting("attachment_cache_max_mb");
  const maxBytes = parseInt(maxMbStr ?? "500", 10) * 1024 * 1024;
  const currentSize = await getCacheSize();

  if (currentSize <= maxBytes) return;

  const db = await getDb();
  const excess = currentSize - maxBytes;
  let freed = 0;

  // Get oldest cached attachments
  const rows = await db.select<{ id: string; local_path: string; cache_size: number }[]>(
    "SELECT id, local_path, cache_size FROM attachments WHERE cached_at IS NOT NULL ORDER BY cached_at ASC LIMIT 100",
  );

  for (const row of rows) {
    if (freed >= excess) break;

    try {
      const { remove, BaseDirectory } = await import("@tauri-apps/plugin-fs");
      await remove(row.local_path, { baseDir: BaseDirectory.AppData });
    } catch {
      // file may not exist
    }

    await db.execute(
      "UPDATE attachments SET local_path = NULL, cached_at = NULL, cache_size = NULL WHERE id = $1",
      [row.id],
    );

    freed += row.cache_size;
  }
}

export async function clearAllCache(): Promise<void> {
  try {
    const { remove, BaseDirectory } = await import("@tauri-apps/plugin-fs");
    try {
      await remove(CACHE_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
    } catch {
      // directory may not exist
    }
  } catch {
    // ignore
  }

  const db = await getDb();
  await db.execute(
    "UPDATE attachments SET local_path = NULL, cached_at = NULL, cache_size = NULL WHERE cached_at IS NOT NULL",
  );
}
