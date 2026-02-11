import { getDb } from "@/services/db/connection";
import { getSetting } from "@/services/db/settings";

const CACHE_DIR = "attachment_cache";

async function getCacheDir(): Promise<string> {
  const { appDataDir } = await import("@tauri-apps/api/path");
  const dir = await appDataDir();
  return `${dir}${CACHE_DIR}`;
}

export async function cacheAttachment(
  attachmentId: string,
  data: Uint8Array,
): Promise<string> {
  try {
    const { mkdir, writeFile: fsWriteFile } = await import("@tauri-apps/plugin-fs");
    const cacheDir = await getCacheDir();

    // Ensure cache directory exists
    try {
      await mkdir(cacheDir, { recursive: true });
    } catch {
      // directory may already exist
    }

    const filePath = `${cacheDir}/${attachmentId}`;
    await fsWriteFile(filePath, data);

    // Update DB
    const db = await getDb();
    await db.execute(
      "UPDATE attachments SET local_path = $1, cached_at = unixepoch(), cache_size = $2 WHERE id = $3",
      [filePath, data.length, attachmentId],
    );

    return filePath;
  } catch (err) {
    console.error("Failed to cache attachment:", err);
    throw err;
  }
}

export async function loadCachedAttachment(
  localPath: string,
): Promise<Uint8Array | null> {
  try {
    const { readFile } = await import("@tauri-apps/plugin-fs");
    return await readFile(localPath);
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
      const { remove } = await import("@tauri-apps/plugin-fs");
      await remove(row.local_path);
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
    const { remove } = await import("@tauri-apps/plugin-fs");
    const cacheDir = await getCacheDir();
    try {
      await remove(cacheDir, { recursive: true });
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
