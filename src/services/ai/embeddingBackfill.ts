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

type MsgRow = {
  id: string;
  account_id: string;
  body_text: string | null;
  subject: string | null;
  snippet: string | null;
};

export async function runEmbeddingBackfill(): Promise<void> {
  if (running) return;

  const ragEnabled = await getSetting("rag_enabled");
  if (ragEnabled !== "true") return;

  const serverUrl = await getSetting("ollama_server_url");
  if (!serverUrl) return;

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

      if (batch.length === 0) break;

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
