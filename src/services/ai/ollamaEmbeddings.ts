import { fetch } from "@tauri-apps/plugin-http";
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
// Binary serialization — Base64 Float32 (~3× smaller than JSON)
// Tauri SQL plugin does not support raw BLOB parameters (it JSON-serializes
// everything over IPC), so we use Base64-encoded binary stored as TEXT.
// ---------------------------------------------------------------------------

function float32ToBase64(floats: number[]): string {
  const f32 = new Float32Array(floats);
  const u8 = new Uint8Array(f32.buffer);
  let binary = "";
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]!);
  return btoa(binary);
}

function base64ToFloat32(b64: string): number[] {
  if (!b64) return [];
  try {
    const binary = atob(b64);
    const u8 = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) u8[i] = binary.charCodeAt(i);
    return Array.from(new Float32Array(u8.buffer));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Math
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
// Ollama API
// ---------------------------------------------------------------------------

export async function generateEmbedding(
  text: string,
  serverUrl: string,
  model: string,
): Promise<number[] | null> {
  try {
    const base = serverUrl.replace(/\/+$/, "");
    const resp = await fetch(`${base}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: text }),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { embedding?: number[] };
    return Array.isArray(data.embedding) ? data.embedding : null;
  } catch {
    return null;
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
  try {
    const resp = await fetch(`${base}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: "test" }),
    });
    if (resp.status === 404 || resp.status === 400) {
      return { ok: false, errorType: "model_not_found" };
    }
    if (!resp.ok) {
      // Try to read error body for "model not found" message from Ollama
      try {
        const err = (await resp.json()) as { error?: string };
        if (err.error?.toLowerCase().includes("model")) {
          return { ok: false, errorType: "model_not_found" };
        }
      } catch { /* ignore */ }
      return { ok: false, errorType: "unknown" };
    }
    const data = (await resp.json()) as { embedding?: number[] };
    if (!Array.isArray(data.embedding)) return { ok: false, errorType: "unknown" };
    return { ok: true, dimensions: data.embedding.length };
  } catch {
    return { ok: false, errorType: "server_down" };
  }
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

export async function storeEmbedding(
  messageId: string,
  accountId: string,
  embedding: number[],
  model: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT OR REPLACE INTO message_embeddings (message_id, account_id, embedding, model)
     VALUES ($1, $2, $3, $4)`,
    [messageId, accountId, float32ToBase64(embedding), model],
  );
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

type EmbeddingRow = {
  message_id: string;
  account_id: string;
  thread_id: string;
  subject: string | null;
  from_name: string | null;
  from_address: string | null;
  snippet: string | null;
  date: number;
  embedding: string;
};

export async function semanticSearch(
  queryEmbedding: number[],
  accountId: string,
  limit = 20,
): Promise<SemanticResult[]> {
  const db = await getDb();

  // Empty-string sentinel means "no usable content" — skip these rows.
  const rows = await db.select<EmbeddingRow[]>(
    `SELECT me.message_id, me.account_id, m.thread_id, m.subject,
            m.from_name, m.from_address, m.snippet, m.date, me.embedding
     FROM message_embeddings me
     JOIN messages m ON m.id = me.message_id
     WHERE me.account_id = $1
       AND me.embedding != ''
     ORDER BY me.created_at DESC
     LIMIT 5000`,
    [accountId],
  );

  const scored = rows.map((row) => {
    const emb = base64ToFloat32(row.embedding);
    const { embedding: _emb, ...rest } = row;
    return { ...rest, similarity: cosineSimilarity(queryEmbedding, emb) };
  });

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, limit);
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
