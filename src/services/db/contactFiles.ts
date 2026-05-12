import { queryWithRetry } from "./connection";

export interface ContactFile {
  id: string;
  account_id: string;
  contact_id: string | null;
  filename: string;
  original_name: string;
  mime_type: string | null;
  size: number | null;
  category: string;
  starred: number;
  sender_email: string | null;
  message_id: string | null;
  local_path: string | null;
  created_at: number;
}

export async function saveContactFile(file: {
  accountId: string;
  contactId: string | null;
  filename: string;
  originalName: string;
  mimeType: string | null;
  size: number | null;
  category: string;
  senderEmail: string | null;
  messageId: string | null;
  localPath: string;
}): Promise<void> {
  return queryWithRetry(async (db) => {
    const id = crypto.randomUUID();
    await db.execute(
      `INSERT INTO contact_files (id, account_id, contact_id, filename, original_name, mime_type, size, category, sender_email, message_id, local_path)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        file.accountId,
        file.contactId,
        file.filename,
        file.originalName,
        file.mimeType,
        file.size,
        file.category,
        file.senderEmail,
        file.messageId,
        file.localPath,
      ],
    );
  });
}

export async function getContactFilesByContact(contactId: string): Promise<ContactFile[]> {
  return queryWithRetry(async (db) => {
    return db.select<ContactFile[]>(
      `SELECT * FROM contact_files WHERE contact_id = $1 ORDER BY created_at DESC`,
      [contactId],
    );
  });
}

export async function getContactFilesBySender(senderEmail: string): Promise<ContactFile[]> {
  return queryWithRetry(async (db) => {
    return db.select<ContactFile[]>(
      `SELECT * FROM contact_files WHERE sender_email = $1 ORDER BY created_at DESC`,
      [senderEmail],
    );
  });
}

export async function getContactFilesByAccount(accountId: string): Promise<ContactFile[]> {
  return queryWithRetry(async (db) => {
    return db.select<ContactFile[]>(
      `SELECT * FROM contact_files WHERE account_id = $1 ORDER BY created_at DESC`,
      [accountId],
    );
  });
}

export async function searchContactFiles(query: string): Promise<ContactFile[]> {
  const pattern = `%${query}%`;
  return queryWithRetry(async (db) => {
    return db.select<ContactFile[]>(
      `SELECT * FROM contact_files
       WHERE original_name LIKE $1 OR filename LIKE $1
       ORDER BY created_at DESC`,
      [pattern],
    );
  });
}

export async function getContactFilesByCategory(accountId: string, category: string): Promise<ContactFile[]> {
  return queryWithRetry(async (db) => {
    return db.select<ContactFile[]>(
      `SELECT * FROM contact_files WHERE account_id = $1 AND category = $2 ORDER BY created_at DESC`,
      [accountId, category],
    );
  });
}

export async function getContactFileCategories(accountId: string): Promise<string[]> {
  return queryWithRetry(async (db) => {
    const rows = await db.select<{ category: string }[]>(
      `SELECT DISTINCT category FROM contact_files WHERE account_id = $1 ORDER BY category`,
      [accountId],
    );
    return rows.map((r) => r.category);
  });
}

export async function updateFileCategory(id: string, category: string): Promise<void> {
  return queryWithRetry(async (db) => {
    await db.execute(
      "UPDATE contact_files SET category = $1 WHERE id = $2",
      [category, id],
    );
  });
}

export async function toggleFileStarred(id: string): Promise<void> {
  return queryWithRetry(async (db) => {
    await db.execute(
      "UPDATE contact_files SET starred = CASE WHEN starred = 1 THEN 0 ELSE 1 END WHERE id = $1",
      [id],
    );
  });
}

export async function deleteContactFile(id: string): Promise<void> {
  await queryWithRetry(async (db) => {
    const file = await db.select<{ local_path: string | null }[]>(
      "SELECT local_path FROM contact_files WHERE id = $1",
      [id],
    );
    const localPath = file[0]?.local_path;
    await db.execute("DELETE FROM contact_files WHERE id = $1", [id]);
    if (localPath) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("delete_from_vault", { vaultPath: localPath });
      } catch {
        // file may already be deleted
      }
    }
  });
}
