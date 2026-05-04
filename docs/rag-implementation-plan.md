# Piano Implementativo — RAG Semantico per Ask My Inbox

## Obiettivo

Evolvere l'attuale `askMyInbox` da una ricerca keyword-based (FTS5) a un sistema RAG ibrido con ricerca semantica, mantenendo tutto **completamente locale e offline** tramite Ollama.

**Stack scelto:**
- `nomic-embed-text` via Ollama → generazione degli embeddings
- `gemma3:4b` (o variante) via Ollama → generazione della risposta finale
- SQLite BLOB (Float32Array) → storage vettori, nessuna dipendenza esterna

---

## Architettura

```
Email in DB
    │
    ▼
[Embedding Job] ──► nomic-embed-text (Ollama /api/embeddings)
    │
    ▼
message_embeddings (SQLite BLOB)
    │
    ├── [Query time] ──► embed domanda ──► cosine similarity ──► top-K semantici
    │
    └── [Query time] ──► FTS5 trigram ──► top-K keyword
              │
              └── merge + re-rank ──► contesto per Gemma ──► risposta
```

---

## File da creare / modificare

### 1. Nuova migrazione DB — `src/services/db/migrations.ts`

Aggiungere migration **v27**:

```sql
CREATE TABLE IF NOT EXISTS message_embeddings (
  message_id   TEXT NOT NULL,
  account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  chunk_index  INTEGER NOT NULL DEFAULT 0,
  chunk_text   TEXT NOT NULL,
  embedding    BLOB NOT NULL,        -- Float32Array serializzato
  model        TEXT NOT NULL,        -- es. "nomic-embed-text"
  created_at   INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (account_id, message_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_embeddings_account
  ON message_embeddings(account_id);
```

> **Nota:** `chunk_index` permette di gestire in futuro messaggi molto lunghi
> spezzati in più chunk. Per ora ogni messaggio = 1 chunk.

---

### 2. Nuovo service Ollama Embeddings — `src/services/ai/ollamaEmbeddings.ts`

Nuova funzione separata dal provider chat esistente (non tocca `ollamaProvider.ts`):

```typescript
// Chiama /api/embeddings di Ollama (endpoint nativo, non OpenAI-compat)
export async function generateEmbedding(
  text: string,
  serverUrl: string,
  model: string = "nomic-embed-text",
): Promise<Float32Array>

// Cosine similarity tra due vettori Float32
export function cosineSimilarity(a: Float32Array, b: Float32Array): number

// Serializza Float32Array → BLOB (ArrayBuffer) per SQLite
export function serializeEmbedding(v: Float32Array): ArrayBuffer

// Deserializza BLOB → Float32Array
export function deserializeEmbedding(blob: ArrayBuffer): Float32Array
```

**Endpoint Ollama usato:** `POST {serverUrl}/api/embeddings`
```json
{ "model": "nomic-embed-text", "prompt": "testo da embeddare" }
```
Risposta: `{ "embedding": [0.123, 0.456, ...] }` (array di float)

---

### 3. Nuovo service DB embeddings — `src/services/db/embeddings.ts`

```typescript
// Salva un embedding per un messaggio
export async function upsertEmbedding(params: {
  messageId: string;
  accountId: string;
  chunkText: string;
  embedding: Float32Array;
  model: string;
}): Promise<void>

// Recupera tutti gli embeddings di un account per la ricerca
export async function getEmbeddingsForAccount(
  accountId: string,
): Promise<EmbeddingRow[]>

// Conta messaggi ancora da embeddare (per progress UI)
export async function countPendingEmbeddings(
  accountId: string,
): Promise<number>
```

---

### 4. Background Embedding Job — `src/services/ai/embeddingBackfill.ts`

Segue lo stesso pattern di `backfillUncategorizedThreads()` in `backgroundCheckers.ts`:

```typescript
export async function runEmbeddingBackfill(
  accountId: string,
  serverUrl: string,
  model: string = "nomic-embed-text",
  batchSize: number = 20,        // elabora N messaggi per ciclo
): Promise<{ processed: number; remaining: number }>
```

**Logica:**
1. Query: messaggi che non hanno ancora un embedding (`LEFT JOIN message_embeddings`)
2. Per ogni messaggio: componi il testo chunk = `subject + "\n" + body_text` (troncato a ~4000 char)
3. Chiama `generateEmbedding(chunkText, serverUrl, model)`
4. Salva con `upsertEmbedding()`
5. Pausa 50ms tra un messaggio e l'altro per non saturare Ollama

**Avvio:** aggiunto a `startBackgroundSync()` in `App.tsx` — gira ogni 5 minuti,
solo se Ollama è configurato e raggiungibile.

---

### 5. Update `askInbox.ts` — ricerca ibrida

Sostituisce l'attuale `searchMessages()` con una pipeline in due fasi:

```
1. FTS5  → top 20 risultati keyword
2. Embed domanda → cosine similarity su tutti gli embeddings account → top 20 semantici
3. Merge per message_id, dedup
4. Re-rank: score = 0.4 * fts_score + 0.6 * cosine_score
5. Top 15 → contesto per Gemma
```

**Fallback:** se Ollama non è disponibile o nessun embedding esiste ancora,
usa solo FTS5 (comportamento attuale — zero regressioni).

---

### 6. Settings — `src/services/db/migrations.ts` (stessa v27) e UI

Aggiungere in migration v27:
```sql
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('rag_enabled', 'false'),
  ('rag_embedding_model', 'nomic-embed-text'),
  ('rag_generation_model', 'gemma3:4b');
```

UI in `SettingsPage.tsx`: sezione "Ask My Inbox" con:
- Toggle abilitazione RAG semantico
- Campo modello embeddings (default `nomic-embed-text`)
- Campo modello generazione (default `gemma3:4b`)
- Progress bar "Indicizzazione email: X / Y indicizzate"

---

## Sequenza di implementazione

| Step | File | Stima |
|------|------|-------|
| 1 | Migration v27 (`migrations.ts`) | 30 min |
| 2 | `ollamaEmbeddings.ts` (embed + math) | 1h |
| 3 | `db/embeddings.ts` (CRUD) | 1h |
| 4 | `embeddingBackfill.ts` (job) | 2h |
| 5 | `askInbox.ts` (retrieval ibrido) | 2h |
| 6 | Settings UI + progress | 2h |
| 7 | Test & tuning pesi re-rank | 1h |

**Totale stimato: ~10h di lavoro effettivo**

---

## Considerazioni operative

**Requisiti utente:**
- Ollama installato e avviato localmente
- Modello `nomic-embed-text` scaricato: `ollama pull nomic-embed-text`
- Modello generazione scaricato: `ollama pull gemma3:4b`

**Storage:** ogni embedding nomic è 768 float × 4 byte = ~3KB per messaggio.
Con 10.000 mail → ~30MB aggiuntivi nel DB. Assolutamente gestibile.

**Prima indicizzazione:** su inbox grandi (10k+ mail) il backfill richiede ore
se Ollama gira su CPU. Consigliabile mostrare un banner "Indicizzazione in corso"
e far funzionare il fallback FTS5 nel frattempo.

**Privacy:** tutto locale. Nessun testo esce dal dispositivo se si usa Ollama.

---

## File non toccati

- `ollamaProvider.ts` — invariato (gestisce solo chat)
- `aiService.ts` — invariato
- `providerFactory.ts` — invariato
- Tutte le migrazioni v1-v26 — invariate
- `EmailRenderer`, `ThreadView`, layout — invariati
