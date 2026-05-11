import { getSetting } from "@/services/db/settings";
import { getDb } from "@/services/db/connection";
import {
  sanitizeForEmbedding,
  generateEmbedding,
  storeEmbedding,
} from "./ollamaEmbeddings";

let running = false;
let stopRequested = false;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Store last error for diagnostics
let lastError: string | null = null;
export function getLastError(): string | null { return lastError; }

type MsgRow = {
  id: string;
  account_id: string;
  body_text: string | null;
  subject: string | null;
  snippet: string | null;
};

export async function runEmbeddingBackfill(): Promise<void> {
  if (running) {
    console.log("[RAG] Backfill already running");
    return;
  }

  const ragEnabled = await getSetting("rag_enabled");
  if (ragEnabled !== "true") {
    console.log("[RAG] Not enabled");
    return;
  }

  const serverUrl = await getSetting("ollama_server_url");
  if (!serverUrl) {
    console.log("[RAG] No Ollama URL configured");
    return;
  }

  console.log(`[RAG] Starting backfill with ${serverUrl}`);
  const model = (await getSetting("embedding_model")) ?? "nomic-embed-text";
  const chunkSize = parseInt((await getSetting("rag_chunk_size")) ?? "512", 10);
  const batchSize = parseInt((await getSetting("rag_batch_size")) ?? "10", 10);

  running = true;
  stopRequested = false;

  try {
    const db = await getDb();

    while (!stopRequested) {
      const batch = await db.select<MsgRow[]>(
        `SELECT m.id, m.account_id, m.body_text, m.subject, m.snippet
         FROM messages m
         JOIN accounts a ON a.id = m.account_id
         LEFT JOIN message_embeddings me ON me.message_id = m.id
         WHERE me.message_id IS NULL
           AND m.account_id IS NOT NULL
           AND a.rag_enabled = 1
           AND NOT EXISTS (
             SELECT 1 FROM thread_labels tl
             WHERE tl.account_id = m.account_id
               AND tl.thread_id = m.thread_id
               AND tl.label_id IN ('SPAM', 'TRASH')
           )
         LIMIT $1`,
        [batchSize],
      );

      if (batch.length === 0) {
        console.log("[RAG] No more batches - indexing complete");
        break;
      }

      console.log(`[RAG] Processing batch of ${batch.length} messages`);

      for (const msg of batch) {
        if (stopRequested) break;

        const rawText = [msg.subject ?? "", msg.body_text ?? msg.snippet ?? ""]
          .join(" ")
          .trim();
        const text = sanitizeForEmbedding(rawText, chunkSize);

        if (!text) {
          // Empty-string sentinel: marks message as "no embeddable content",
          // skipped by semanticSearch. Prevents repeated processing.
          await db.execute(
            `INSERT OR IGNORE INTO message_embeddings (message_id, account_id, embedding, model)
             VALUES ($1, $2, '', $3)`,
            [msg.id, msg.account_id, model],
          );
          continue;
        }

        const embedding = await generateEmbedding(text, serverUrl, model);
        if (embedding) {
          await storeEmbedding(msg.id, msg.account_id, embedding, model);
        } else {
          // Ollama failed - mark as processed to avoid infinite retry
          await db.execute(
            `INSERT OR IGNORE INTO message_embeddings (message_id, account_id, embedding, model)
             VALUES ($1, $2, '', $3)`,
            [msg.id, msg.account_id, model],
          );
        }

        // Thermal pause — keeps Ollama responsive
        await delay(50);
      }
    }
  } finally {
    running = false;
  }
}

export function stopEmbeddingBackfill(): void {
  stopRequested = true;
}

export function isEmbeddingBackfillRunning(): boolean {
  return running;
}

export async function getPendingCount(): Promise<number> {
  const db = await getDb();
  // Use exact same query as backfill eligibility
  const result = await db.select<{ cnt: number }[]>(
    `SELECT COUNT(*) as cnt FROM messages m
     JOIN accounts a ON a.id = m.account_id
     LEFT JOIN message_embeddings me ON me.message_id = m.id
     WHERE me.message_id IS NULL
       AND a.rag_enabled = 1
       AND m.account_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM thread_labels tl
         WHERE tl.account_id = m.account_id
           AND tl.thread_id = m.thread_id
           AND tl.label_id IN ('SPAM', 'TRASH')
       )`,
  );
  return result[0]?.cnt ?? 0;
}

export async function getDiagnostics(): Promise<{
  totalMessages: number;
  ragAccounts: number;
  eligibleMessages: number;
  indexed: number;
  pending: number;
  sentinels: number;
}> {
  const db = await getDb();
  const [total] = await db.select<{ cnt: number }[]>(`SELECT COUNT(*) as cnt FROM messages`);
  const [ragAcc] = await db.select<{ cnt: number }[]>(`SELECT COUNT(*) as cnt FROM accounts WHERE rag_enabled = 1`);

  // Count only embeddings for rag-enabled accounts, excluding SPAM/TRASH (consistent with progress bar)
  const [indexed] = await db.select<{ cnt: number }[]>(
    `SELECT COUNT(*) as cnt FROM message_embeddings me
     JOIN accounts a ON a.id = me.account_id
     JOIN messages m ON m.id = me.message_id
     WHERE a.rag_enabled = 1 AND me.embedding != ''
       AND NOT EXISTS (
         SELECT 1 FROM thread_labels tl
         WHERE tl.account_id = m.account_id
           AND tl.thread_id = m.thread_id
           AND tl.label_id IN ('SPAM', 'TRASH')
       )`,
  );
  const [sentinels] = await db.select<{ cnt: number }[]>(
    `SELECT COUNT(*) as cnt FROM message_embeddings me
     JOIN accounts a ON a.id = me.account_id
     JOIN messages m ON m.id = me.message_id
     WHERE a.rag_enabled = 1 AND me.embedding = ''
       AND NOT EXISTS (
         SELECT 1 FROM thread_labels tl
         WHERE tl.account_id = m.account_id
           AND tl.thread_id = m.thread_id
           AND tl.label_id IN ('SPAM', 'TRASH')
       )`,
  );

  const pending = await getPendingCount();
  const eligibleMessages = (indexed?.cnt ?? 0) + (sentinels?.cnt ?? 0) + pending;

  return {
    totalMessages: total?.cnt ?? 0,
    ragAccounts: ragAcc?.cnt ?? 0,
    eligibleMessages,
    indexed: indexed?.cnt ?? 0,
    pending,
    sentinels: sentinels?.cnt ?? 0,
  };
}
