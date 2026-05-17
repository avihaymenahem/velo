import { fetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import { getDb } from "@/services/db/connection";

// Boilerplate patterns to strip before embedding.
// Ordered longest-match first to avoid partial hits. All prose patterns are
// case-insensitive; structural separators (-- / ___) are not.
// Languages: EN · IT · FR · ES · DE
const SIG_PATTERNS: RegExp[] = [
  // --- Marketing / legal footers (EN) ---
  /This email was sent[\s\S]*/i,
  /You are receiving this[\s\S]*/i,
  /To unsubscribe[\s\S]*/i,
  /Click here to unsubscribe[\s\S]*/i,
  /Unsubscribe[\s\S]*/i,

  // --- Multi-word closings (EN) ---
  /Thanks? and regards[\s\S]*/i,
  /With (kind|best|warm|kindest) regards[\s\S]*/i,
  /Best regards[\s\S]*/i,
  /Kind regards[\s\S]*/i,
  /Warm regards[\s\S]*/i,
  /Many thanks[\s\S]*/i,
  /All the best[\s\S]*/i,

  // --- Device signatures (EN / IT / FR / ES) ---
  /Sent from my [\s\S]*/i,
  /Inviato dal mio [\s\S]*/i,
  /Envoy[eé] depuis mon [\s\S]*/i,
  /Enviado desde mi [\s\S]*/i,
  /Gesendet von meinem [\s\S]*/i,

  // --- Closings: Italian ---
  /Cordiali saluti[\s\S]*/i,
  /Distinti saluti[\s\S]*/i,
  /Con i migliori saluti[\s\S]*/i,

  // --- Closings: French ---
  /Cordialement[\s\S]*/i,
  /Bien [aà] vous[\s\S]*/i,
  /Avec mes meilleures salutations[\s\S]*/i,
  /Salutations distingu[eé]es[\s\S]*/i,

  // --- Closings: Spanish ---
  /Saludos cordiales[\s\S]*/i,
  /Atentamente[\s\S]*/i,
  /Un cordial saludo[\s\S]*/i,
  /Con un saludo[\s\S]*/i,

  // --- Closings: German ---
  /Mit freundlichen Gr[üu][ßs]en[\s\S]*/i,
  /Viele Gr[üu][ßs]e[\s\S]*/i,
  /Herzliche Gr[üu][ßs]e[\s\S]*/i,
  /Freundliche Gr[üu][ßs]e[\s\S]*/i,
  /Beste Gr[üu][ßs]e[\s\S]*/i,

  // --- Structural separators (language-agnostic) ---
  /--\s*\r?\n[\s\S]*/,
  /_{3,}[\s\S]*/,
  /-{3,}[\s\S]*/,
];

/**
 * Strip HTML, entities, boilerplate signatures, and truncate to chunk boundary.
 * chunkSize is in approximate tokens (~4 chars each).
 */
export function sanitizeForEmbedding(text: string, chunkSize = 512): string {
  let clean = text.replace(/<[^>]+>/g, " ");
  clean = clean.replace(/&[a-z#0-9]+;/gi, " ");
  for (const pat of SIG_PATTERNS) {
    clean = clean.replace(pat, "");
  }
  return clean.replace(/\s+/g, " ").trim().slice(0, chunkSize * 4);
}

// ---------------------------------------------------------------------------
// Math (kept for callers outside the RAG pipeline)
// ---------------------------------------------------------------------------

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ---------------------------------------------------------------------------
// Model-aware prefix selection
// Each embedding model family uses different task-type prefixes for
// asymmetric retrieval. Using the wrong prefix (or no prefix) degrades quality.
// ---------------------------------------------------------------------------

export interface EmbeddingPrefixes {
  document: string;
  query: string;
}

export function getEmbeddingPrefixes(model: string): EmbeddingPrefixes {
  const m = model.toLowerCase();
  if (m.includes("nomic")) {
    // nomic-embed-text v1 / v1.5
    return { document: "search_document: ", query: "search_query: " };
  }
  if (m.includes("e5")) {
    // multilingual-e5-large, e5-large-v2, e5-small, etc.
    return { document: "passage: ", query: "query: " };
  }
  if (m.includes("mxbai")) {
    // mxbai-embed-large-v1
    return {
      document: "Represent this sentence for searching relevant passages: ",
      query: "",
    };
  }
  // bge-m3, bge-large, all-minilm, and unknown models: no prefix needed
  return { document: "", query: "" };
}

// ---------------------------------------------------------------------------
// Ollama API
// ---------------------------------------------------------------------------

const EMBEDDING_TIMEOUT_MS = 30_000;

// Promise.race-based timeout — works regardless of whether the underlying
// Tauri HTTP plugin honours AbortController (it does not reliably).
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("embedding_timeout")), ms),
    ),
  ]);
}

export async function generateEmbedding(
  text: string,
  serverUrl: string,
  model: string,
): Promise<number[] | null> {
  // Use the modern /api/embed endpoint (input field, embeddings[] response).
  // The legacy /api/embeddings (prompt field) hangs on newer models like
  // nomic-embed-text-v2-moe when input exceeds their 512-token context limit.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS);
  try {
    const base = serverUrl.replace(/\/+$/, "");
    // withTimeout is a belt-and-suspenders fallback: the Tauri HTTP plugin does
    // not reliably honour AbortController signals, so Promise.race guarantees
    // the caller unblocks even if the signal is ignored at the native layer.
    const fetchPromise = fetch(`${base}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: text }),
      signal: controller.signal,
    }).then(async (resp) => {
      if (!resp.ok) return null;
      const data = (await resp.json()) as { embeddings?: number[][] };
      const emb = data.embeddings?.[0];
      return Array.isArray(emb) && emb.length > 0 ? emb : null;
    });
    return await withTimeout(fetchPromise, EMBEDDING_TIMEOUT_MS);
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export type EmbeddingTestError = "server_down" | "model_not_found" | "unknown";

export interface EmbeddingTestResult {
  ok: boolean;
  errorType?: EmbeddingTestError;
  dimensions?: number;
}

/** Probes the embedding endpoint and distinguishes failure modes. */
export async function testEmbeddingModel(
  serverUrl: string,
  model: string,
): Promise<EmbeddingTestResult> {
  const base = serverUrl.replace(/\/+$/, "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS);
  try {
    const fetchPromise = fetch(`${base}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: "test" }),
      signal: controller.signal,
    }).then(async (resp) => {
      if (resp.status === 404 || resp.status === 400) {
        return { ok: false, errorType: "model_not_found" as EmbeddingTestError };
      }
      if (!resp.ok) {
        try {
          const err = (await resp.json()) as { error?: string };
          if (err.error?.toLowerCase().includes("model")) {
            return { ok: false, errorType: "model_not_found" as EmbeddingTestError };
          }
        } catch { /* ignore */ }
        return { ok: false, errorType: "unknown" as EmbeddingTestError };
      }
      const data = (await resp.json()) as { embeddings?: number[][] };
      const emb = data.embeddings?.[0];
      if (!Array.isArray(emb) || emb.length === 0) return { ok: false, errorType: "unknown" as EmbeddingTestError };
      return { ok: true, dimensions: emb.length };
    });
    return await withTimeout<EmbeddingTestResult>(fetchPromise, EMBEDDING_TIMEOUT_MS);
  } catch {
    return { ok: false, errorType: "server_down" };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

// Stores an embedding as a binary BLOB via the native Rust command.
// Pass an empty array to write a NULL sentinel (no embeddable content).
export async function storeEmbedding(
  messageId: string,
  accountId: string,
  embedding: number[],
  model: string,
): Promise<void> {
  await invoke("store_embedding", {
    messageId,
    accountId,
    embedding,
    model,
  });
}

export interface SemanticResult {
  message_id: string;
  account_id: string;
  thread_id: string;
  subject: string | null;
  from_name: string | null;
  from_address: string | null;
  snippet: string | null;
  date: number;
  similarity: number;
}

export async function getEmbeddingProgress(
  accountId: string,
): Promise<{ indexed: number; total: number }> {
  const db = await getDb();
  type CountRow = { cnt: number };

  const [indexedRow] = await db.select<CountRow[]>(
    `SELECT COUNT(*) as cnt FROM message_embeddings WHERE account_id = $1`,
    [accountId],
  );
  const [totalRow] = await db.select<CountRow[]>(
    `SELECT COUNT(*) as cnt FROM messages WHERE account_id = $1`,
    [accountId],
  );

  return {
    indexed: indexedRow?.cnt ?? 0,
    total: totalRow?.cnt ?? 0,
  };
}

export async function getEmbeddingProgressAll(
  ragEnabledAccountIds: string[],
): Promise<{ indexed: number; total: number }> {
  const db = await getDb();
  type CountRow = { cnt: number };

  if (ragEnabledAccountIds.length === 0) {
    return { indexed: 0, total: 0 };
  }

  const placeholders = ragEnabledAccountIds.map(() => '?').join(',');

  // Indexed: embeddings for eligible messages only (exclude SPAM/TRASH, same filter as total)
  const indexedRow = await db.select<CountRow[]>(
    `SELECT COUNT(*) as cnt FROM message_embeddings me
     JOIN messages m ON m.id = me.message_id
     WHERE me.account_id IN (${placeholders})
       AND NOT EXISTS (
         SELECT 1 FROM thread_labels tl
         WHERE tl.account_id = m.account_id
           AND tl.thread_id = m.thread_id
           AND tl.label_id IN ('SPAM', 'TRASH')
       )`,
    ragEnabledAccountIds,
  );
  // Total: all messages eligible for indexing (rag_enabled=1 account, not spam/trash thread)
  const totalRow = await db.select<CountRow[]>(
    `SELECT COUNT(DISTINCT m.id) as cnt FROM messages m
     JOIN accounts a ON a.id = m.account_id
     WHERE m.account_id IN (${placeholders})
       AND a.rag_enabled = 1
       AND m.account_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM thread_labels tl
         WHERE tl.account_id = m.account_id
           AND tl.thread_id = m.thread_id
           AND tl.label_id IN ('SPAM', 'TRASH')
       )`,
    ragEnabledAccountIds,
  );

  return {
    indexed: indexedRow[0]?.cnt ?? 0,
    total: totalRow[0]?.cnt ?? 0,
  };
}
