use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::Manager;

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize)]
pub struct VectorSearchHit {
    pub message_id: String,
    pub account_id: String,
    pub thread_id: String,
    pub subject: Option<String>,
    pub from_name: Option<String>,
    pub from_address: Option<String>,
    pub snippet: Option<String>,
    pub date: i64,
    pub score: f32,
}

#[allow(dead_code)]
fn get_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("velo.db"))
        .map_err(|e| e.to_string())
}

#[allow(dead_code)]
// Convert raw BLOB bytes (little-endian f32) to a Vec<f32>.
// Returns an empty Vec when the length is not a multiple of 4 (corrupt blob).
fn blob_to_f32(blob: &[u8]) -> Vec<f32> {
    if blob.len() % 4 != 0 {
        return vec![];
    }
    blob.chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect()
}

#[allow(dead_code)]
// Cosine similarity. Returns 0.0 for zero-length or mismatched vectors.
// The inner loop auto-vectorises with NEON/AVX2 when compiled with
// -C target-cpu=native (see .cargo/config.toml).
fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let mut dot = 0.0f32;
    let mut norm_a = 0.0f32;
    let mut norm_b = 0.0f32;
    for (x, y) in a.iter().zip(b.iter()) {
        dot += x * y;
        norm_a += x * x;
        norm_b += y * y;
    }
    let denom = norm_a.sqrt() * norm_b.sqrt();
    if denom == 0.0 {
        0.0
    } else {
        dot / denom
    }
}

#[allow(dead_code)]
// Sanitise FTS terms so they are safe to pass to SQLite FTS5 MATCH.
// Wraps each token in double-quotes and removes characters that would break
// FTS5 query syntax.
fn build_fts_query(terms: &str) -> String {
    terms
        .split_whitespace()
        .filter(|t| t.len() > 1)
        .map(|t| {
            let clean: String = t.chars().filter(|c| c.is_alphanumeric()).collect();
            if clean.is_empty() {
                String::new()
            } else {
                format!("\"{}\"", clean)
            }
        })
        .filter(|t| !t.is_empty())
        .collect::<Vec<_>>()
        .join(" OR ")
}

// ─────────────────────────────────────────────────────────────────────────────
// store_embedding
//
// Stores an embedding as a raw little-endian binary BLOB.
// An empty Vec<f32> writes NULL (sentinel: no embeddable content).
// ─────────────────────────────────────────────────────────────────────────────

#[allow(dead_code)]
#[tauri::command]
pub async fn store_embedding(
    app: tauri::AppHandle,
    message_id: String,
    account_id: String,
    embedding: Vec<f32>,
    model: String,
) -> Result<(), String> {
    let db_path = get_db_path(&app)?;

    tokio::task::spawn_blocking(move || {
        let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

        // Enable WAL mode so our write connection can coexist with the
        // tauri-plugin-sql (sqlx) reader connections without SQLITE_BUSY errors.
        // WAL mode is sticky: once set it persists for the DB file.
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")
            .map_err(|e| e.to_string())?;

        // Retry for up to 15 s in case sqlx is mid-transaction.
        conn.busy_timeout(std::time::Duration::from_secs(15))
            .map_err(|e| e.to_string())?;

        if embedding.is_empty() {
            // NULL sentinel: message has no embeddable content
            conn.execute(
                "INSERT OR REPLACE INTO message_embeddings \
                 (message_id, account_id, embedding, model) VALUES (?1, ?2, NULL, ?3)",
                rusqlite::params![message_id, account_id, model],
            )
            .map_err(|e| e.to_string())?;
        } else {
            let bytes: Vec<u8> = embedding
                .iter()
                .flat_map(|f| f.to_le_bytes())
                .collect();
            conn.execute(
                "INSERT OR REPLACE INTO message_embeddings \
                 (message_id, account_id, embedding, model) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![message_id, account_id, bytes.as_slice(), model],
            )
            .map_err(|e| e.to_string())?;
        }

        Ok::<(), String>(())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ─────────────────────────────────────────────────────────────────────────────
// ask_inbox_rust
//
// Hybrid FTS + vector retrieval with Reciprocal Rank Fusion (RRF, k=60).
//
// Algorithm:
//   1. FTS5 MATCH → top-50 hits → RRF scores (lazy iterator)
//   2. Count indexed embeddings to choose sequential vs parallel path:
//      a. ≤ 1000 rows: stream rows one at a time (true lazy, O(1) peak RAM
//                      beyond the current row), keep a rolling top-K buffer.
//      b. > 1000 rows: collect only (message_id, blob) pairs (no metadata)
//                      into memory, compute cosine with rayon, keep top-K.
//   3. RRF fusion of FTS and vector scores.
//   4. Fetch full metadata for the top-N IDs in a single targeted JOIN query.
//
// Zero-embeddings safety:
//   - The SQL WHERE clause (`IS NOT NULL AND length > 0`) means rusqlite never
//     sees a NULL blob; the iterator simply yields zero rows when all
//     embeddings are NULL (backfill not yet started), and the code falls
//     through to FTS-only results without panicking.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_VECTOR_ROWS: usize = 10_000; // hard cap on in-memory blobs

#[allow(dead_code)]
#[tauri::command]
pub async fn ask_inbox_rust(
    app: tauri::AppHandle,
    query_embedding: Vec<f32>,
    account_id: String,
    fts_terms: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<VectorSearchHit>, String> {
    let db_path = get_db_path(&app)?;
    let max_results = limit.unwrap_or(20).min(50);

    tokio::task::spawn_blocking(move || {
        let conn = Connection::open_with_flags(
            &db_path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(|e| e.to_string())?;

        conn.busy_timeout(std::time::Duration::from_secs(10))
            .map_err(|e| e.to_string())?;

        const K: f64 = 60.0;

        // ── Step 1: FTS search (lazy iterator) ──────────────────────────────

        let mut fts_rrf: HashMap<String, f64> = HashMap::new();
        // FTS-only hits need their metadata here since they may not have a
        // blob entry. Limited to top-50 so this is always small.
        let mut fts_meta: HashMap<String, (String, String, Option<String>, Option<String>, Option<String>, Option<String>, i64)> = HashMap::new();

        if let Some(ref terms) = fts_terms {
            let fts_query = build_fts_query(terms);
            if !fts_query.is_empty() {
                if let Ok(mut stmt) = conn.prepare(
                    "SELECT m.id, m.account_id, m.thread_id, m.subject,
                            m.from_name, m.from_address, m.snippet, m.date
                     FROM messages_fts
                     JOIN messages m ON m.rowid = messages_fts.rowid
                     WHERE messages_fts MATCH ?1 AND m.account_id = ?2
                     ORDER BY rank
                     LIMIT 50",
                ) {
                    if let Ok(rows) = stmt.query_map(
                        rusqlite::params![fts_query, account_id],
                        |row| {
                            Ok((
                                row.get::<_, String>(0)?,
                                row.get::<_, String>(1)?,
                                row.get::<_, String>(2)?,
                                row.get::<_, Option<String>>(3)?,
                                row.get::<_, Option<String>>(4)?,
                                row.get::<_, Option<String>>(5)?,
                                row.get::<_, Option<String>>(6)?,
                                row.get::<_, i64>(7)?,
                            ))
                        },
                    ) {
                        for (rank, row) in rows.flatten().enumerate() {
                            let rrf = 1.0 / (K + rank as f64 + 1.0);
                            fts_rrf.insert(row.0.clone(), rrf);
                            fts_meta.insert(row.0, (row.1, row.2, row.3, row.4, row.5, row.6, row.7));
                        }
                    }
                }
            }
        }

        // ── Step 2: Vector similarity ────────────────────────────────────────
        //
        // Scored result: sorted Vec<(message_id, cosine_score)>, descending.

        let scored: Vec<(String, f32)> = if !query_embedding.is_empty() {
            vector_score(&conn, &account_id, &query_embedding)?
        } else {
            vec![]
        };

        // ── Step 3: RRF fusion ───────────────────────────────────────────────

        let mut rrf_total: HashMap<String, f64> = HashMap::new();

        // Vector RRF ranks (already sorted descending by cosine score)
        for (rank, (msg_id, _)) in scored.iter().enumerate() {
            *rrf_total.entry(msg_id.clone()).or_insert(0.0) +=
                1.0 / (K + rank as f64 + 1.0);
        }

        // FTS RRF
        for (msg_id, rrf) in &fts_rrf {
            *rrf_total.entry(msg_id.clone()).or_insert(0.0) += rrf;
        }

        let mut ranked: Vec<(String, f64)> = rrf_total.into_iter().collect();
        ranked.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        // ── Step 4: Fetch metadata for top-N IDs ────────────────────────────
        //
        // We only fetch metadata for the top-N IDs — not for all scanned rows.

        let top_ids: Vec<String> = ranked
            .iter()
            .take(max_results)
            .map(|(id, _)| id.clone())
            .collect();

        if top_ids.is_empty() {
            return Ok::<Vec<VectorSearchHit>, String>(vec![]);
        }

        // Build a lookup from the targeted metadata query
        let placeholders: String = (1..=top_ids.len())
            .map(|i| format!("?{}", i))
            .collect::<Vec<_>>()
            .join(", ");

        let meta_sql = format!(
            "SELECT m.id, m.account_id, m.thread_id, m.subject,
                    m.from_name, m.from_address, m.snippet, m.date
             FROM messages m
             WHERE m.id IN ({}) AND m.account_id = ?{}",
            placeholders,
            top_ids.len() + 1
        );

        let mut meta_stmt = conn.prepare(&meta_sql).map_err(|e| e.to_string())?;

        let mut params: Vec<Box<dyn rusqlite::ToSql>> = top_ids
            .iter()
            .map(|id| -> Box<dyn rusqlite::ToSql> { Box::new(id.clone()) })
            .collect();
        params.push(Box::new(account_id.clone()));

        let params_refs: Vec<&dyn rusqlite::ToSql> =
            params.iter().map(|p| p.as_ref()).collect();

        // message_id → (account_id, thread_id, subject, from_name, from_address, snippet, date)
        type MetaTuple = (String, String, Option<String>, Option<String>, Option<String>, Option<String>, i64);
        let mut meta_map: HashMap<String, MetaTuple> = HashMap::new();

        if let Ok(rows) = meta_stmt.query_map(params_refs.as_slice(), |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, i64>(7)?,
            ))
        }) {
            for row in rows.flatten() {
                meta_map.insert(row.0.clone(), (row.1, row.2, row.3, row.4, row.5, row.6, row.7));
            }
        }

        // ── Step 5: Build result list ────────────────────────────────────────

        let hits: Vec<VectorSearchHit> = ranked
            .into_iter()
            .take(max_results)
            .filter_map(|(msg_id, score)| {
                // Prefer freshly-fetched metadata; fall back to FTS meta for
                // hits that only appeared in FTS (not in the messages query).
                if let Some((acct, thread, subj, fname, faddr, snip, date)) =
                    meta_map.get(&msg_id)
                {
                    Some(VectorSearchHit {
                        message_id: msg_id.clone(),
                        account_id: acct.clone(),
                        thread_id: thread.clone(),
                        subject: subj.clone(),
                        from_name: fname.clone(),
                        from_address: faddr.clone(),
                        snippet: snip.clone(),
                        date: *date,
                        score: score as f32,
                    })
                } else if let Some((acct, thread, subj, fname, faddr, snip, date)) =
                    fts_meta.get(&msg_id)
                {
                    Some(VectorSearchHit {
                        message_id: msg_id.clone(),
                        account_id: acct.clone(),
                        thread_id: thread.clone(),
                        subject: subj.clone(),
                        from_name: fname.clone(),
                        from_address: faddr.clone(),
                        snippet: snip.clone(),
                        date: *date,
                        score: score as f32,
                    })
                } else {
                    None
                }
            })
            .collect();

        Ok::<Vec<VectorSearchHit>, String>(hits)
    })
    .await
    .map_err(|e| e.to_string())?
}

// ─────────────────────────────────────────────────────────────────────────────
// vector_score — internal helper
//
// Returns a Vec<(message_id, cosine_score)> sorted descending by score.
//
// Two paths:
//   ≤ 1000 indexed rows  →  stream lazily (true one-row-at-a-time iteration).
//                           Peak extra RAM: one blob at a time + a rolling
//                           top-K buffer of (score, message_id).
//   > 1000 indexed rows  →  collect only (message_id, blob) bytes (no full
//                           metadata), then compute in parallel with rayon.
//
// Both paths cap the scan at MAX_VECTOR_ROWS (10k) so a huge mailbox cannot
// OOM the process.
// ─────────────────────────────────────────────────────────────────────────────

fn vector_score(
    conn: &Connection,
    account_id: &str,
    query_embedding: &[f32],
) -> Result<Vec<(String, f32)>, String> {
    // Quick count — decides which path to take
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM message_embeddings
             WHERE account_id = ?1
               AND embedding IS NOT NULL
               AND length(embedding) > 0",
            rusqlite::params![account_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if count == 0 {
        return Ok(vec![]);
    }

    // The embed scan: ordered by recency, capped at MAX_VECTOR_ROWS
    const EMBED_SQL: &str =
        "SELECT message_id, embedding
         FROM message_embeddings
         WHERE account_id = ?1
           AND embedding IS NOT NULL
           AND length(embedding) > 0
         ORDER BY created_at DESC
         LIMIT ?2";

    let mut scored: Vec<(String, f32)> = if count as usize <= 1000 {
        // ── Sequential lazy path ──────────────────────────────────────────
        // Processes one row at a time without ever collecting all blobs.
        let mut stmt = conn.prepare(EMBED_SQL).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(
                rusqlite::params![account_id, MAX_VECTOR_ROWS as i64],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, Vec<u8>>(1)?)),
            )
            .map_err(|e| e.to_string())?;

        let mut out = Vec::new();
        for row in rows.flatten() {
            let (msg_id, blob) = row;
            let emb = blob_to_f32(&blob);
            if emb.is_empty() {
                continue; // corrupt/wrong-length blob — skip silently
            }
            out.push((msg_id, cosine_similarity(query_embedding, &emb)));
        }
        out
    } else {
        // ── Rayon parallel path ───────────────────────────────────────────
        // Collect only (message_id, blob) — metadata stays out of RAM.
        let mut stmt = conn.prepare(EMBED_SQL).map_err(|e| e.to_string())?;
        let raw: Vec<(String, Vec<u8>)> = stmt
            .query_map(
                rusqlite::params![account_id, MAX_VECTOR_ROWS as i64],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, Vec<u8>>(1)?)),
            )
            .map_err(|e| e.to_string())?
            .flatten()
            .collect();

        use rayon::prelude::*;
        raw.par_iter()
            .filter_map(|(msg_id, blob)| {
                let emb = blob_to_f32(blob);
                if emb.is_empty() {
                    return None; // corrupt blob — skip
                }
                Some((msg_id.clone(), cosine_similarity(query_embedding, &emb)))
            })
            .collect()
    };

    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    Ok(scored)
}
