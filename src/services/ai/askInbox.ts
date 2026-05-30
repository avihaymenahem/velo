import { searchMessages, type SearchResult } from "@/services/db/search";
import { askInbox as callAskInbox } from "./aiService";
import { getSetting } from "@/services/db/settings";
import { getAccountRagEnabled } from "@/services/db/accounts";
import {
  generateEmbedding,
  sanitizeForEmbedding,
  getEmbeddingPrefixes,
} from "./ollamaEmbeddings";
import { invoke } from "@tauri-apps/api/core";

interface RustSearchHit {
  message_id: string;
  account_id: string;
  thread_id: string;
  subject: string | null;
  from_name: string | null;
  from_address: string | null;
  snippet: string | null;
  date: number;
  score: number;
}

function extractSearchTerms(question: string): string {
  const stopWords = new Set([
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "through", "during", "before", "after", "above", "below",
    "between", "out", "off", "over", "under", "again", "further", "then",
    "once", "here", "there", "when", "where", "why", "how", "what", "which",
    "who", "whom", "this", "that", "these", "those", "am", "about", "up",
    "my", "me", "i", "we", "our", "you", "your", "he", "she", "it", "they",
    "them", "his", "her", "its", "and", "but", "or", "nor", "not", "so",
    "very", "just", "also", "any", "each", "every", "all", "both", "few",
    "more", "most", "some", "such", "no", "only", "own", "same", "than",
    "too", "if", "tell", "know", "find", "get", "got",
    // Italian
    "il", "lo", "la", "le", "li", "gli", "un", "una", "uno", "dei", "del",
    "della", "dello", "delle", "degli", "al", "allo", "alla", "alle", "agli",
    "ai", "dal", "dalla", "dallo", "dalle", "dagli", "dai", "nel", "nella",
    "nello", "nelle", "negli", "nei", "sul", "sulla", "sullo", "sulle",
    "sugli", "sui", "per", "tra", "fra", "con", "su", "da", "di", "in",
    "e", "o", "ma", "se", "che", "chi", "cui", "non", "si", "mi", "ti",
    "ci", "vi", "lo", "li", "ne", "è", "sono", "era", "ho", "ha", "hai",
    "quando", "dove", "come", "cosa", "quale", "quali", "perché", "anche",
    "già", "ancora", "sempre", "mai", "fissata", "stato", "stata", "questo",
    "questa", "questi", "queste", "loro", "mio", "mia", "tuo", "tua",
  ]);

  return question
    .replace(/[?!.,;:'"]/g, "")
    .split(/\s+/)
    .filter((word) => !stopWords.has(word.toLowerCase()) && word.length > 1)
    .join(" ");
}

export interface AskInboxResult {
  answer: string;
  sourceMessages: SearchResult[];
}

function rustHitToSearchResult(h: RustSearchHit): SearchResult {
  return {
    message_id: h.message_id,
    account_id: h.account_id,
    thread_id: h.thread_id,
    subject: h.subject,
    from_name: h.from_name,
    from_address: h.from_address,
    snippet: h.snippet,
    date: h.date,
    rank: h.score,
  };
}

function buildFtsQuery(terms: string): string {
  // FTS5 trigram tokenizer treats "word1 word2" as a literal phrase (substring including space),
  // so multi-word queries almost always return 0 results. Use explicit OR instead.
  const words = terms.split(/\s+/).filter((w) => w.length >= 3);
  if (words.length === 0) return terms;
  return words.join(" OR ");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function extractDateConstraint(question: string): string | null {
  const q = question.toLowerCase();
  const now = new Date();

  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return formatDate(d);
  };

  if (/\boggi\b|\btoday\b/.test(q)) return `after:${daysAgo(0)}`;
  if (/\bieri\b|\byesterday\b/.test(q)) return `after:${daysAgo(1)}`;
  if (/ultime?\s+24\s+ore|last\s+24\s+hours?|past\s+24\s+hours?/.test(q)) return `after:${daysAgo(1)}`;
  if (/ultime?\s+48\s+ore|last\s+48\s+hours?/.test(q)) return `after:${daysAgo(2)}`;
  if (/questa\s+settimana|this\s+week/.test(q)) return `after:${daysAgo(7)}`;
  if (/settimana\s+scorsa|last\s+week/.test(q)) return `after:${daysAgo(14)}`;
  if (/questo\s+mese|this\s+month/.test(q)) return `after:${daysAgo(30)}`;
  if (/mese\s+scorso|last\s+month/.test(q)) return `after:${daysAgo(60)}`;

  const nDays = q.match(/ultim[io]\s+(\d+)\s+giorn[io]i?|last\s+(\d+)\s+days?/);
  if (nDays) return `after:${daysAgo(parseInt(nDays[1] ?? nDays[2] ?? "7", 10))}`;

  const nWeeks = q.match(/ultime?\s+(\d+)\s+settimane?|last\s+(\d+)\s+weeks?/);
  if (nWeeks) return `after:${daysAgo(parseInt(nWeeks[1] ?? nWeeks[2] ?? "2", 10) * 7)}`;

  return null;
}

export async function askMyInbox(
  question: string,
  accountId: string | null,
): Promise<AskInboxResult> {
  const terms = extractSearchTerms(question);
  const dateConstraint = extractDateConstraint(question);

  if (!terms.trim() && !dateConstraint) {
    return {
      answer: "I couldn't understand the question. Please try rephrasing it.",
      sourceMessages: [],
    };
  }

  const textQuery = terms.trim() ? buildFtsQuery(terms) : "";
  const ftsQuery = [textQuery, dateConstraint].filter(Boolean).join(" ");

  const ragEnabled = await getSetting("rag_enabled");
  const accountRagEnabled = ragEnabled === "true" && accountId != null ? await getAccountRagEnabled(accountId) : false;
  const serverUrl = accountRagEnabled ? await getSetting("ollama_server_url") : null;
  const embeddingModel = (await getSetting("embedding_model")) ?? "nomic-embed-text";

  let results: SearchResult[];

  if (accountRagEnabled && serverUrl && accountId != null) {
    // Generate query embedding from Ollama (still JS-side, network call)
    const cleanQuery = sanitizeForEmbedding(question, 256);
    const { query: queryPrefix } = getEmbeddingPrefixes(embeddingModel);
    const prefixedQuery = cleanQuery
      ? queryPrefix ? `${queryPrefix}${cleanQuery}` : cleanQuery
      : cleanQuery;

    const queryEmbedding = await generateEmbedding(prefixedQuery ?? "", serverUrl, embeddingModel);

    if (queryEmbedding) {
      // Hybrid FTS + vector retrieval with RRF fusion — fully in Rust
      const hits = await invoke<RustSearchHit[]>("ask_inbox_rust", {
        queryEmbedding,
        accountId,
        ftsTerms: terms,
        limit: 20,
      });
      results = hits.map(rustHitToSearchResult);
    } else {
      // Ollama unreachable — fall back to FTS silently
      results = await searchMessages(ftsQuery, accountId ?? undefined, 15, true);
    }
  } else {
    results = await searchMessages(ftsQuery, accountId ?? undefined, 15, true);
  }

  if (results.length === 0) {
    return {
      answer: "I couldn't find any relevant emails for your question. Try a different question or check your search terms.",
      sourceMessages: [],
    };
  }

  const context = results
    .map((r) => {
      const date = new Date(r.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const from = r.from_name
        ? `${r.from_name} <${r.from_address}>`
        : (r.from_address ?? "Unknown");
      return `[Message ID: ${r.message_id}]\nFrom: ${from}\nDate: ${date}\nSubject: ${r.subject ?? "(no subject)"}\nPreview: ${r.snippet ?? ""}`;
    })
    .join("\n---\n");

  const answer = await callAskInbox(question, accountId, context);
  return { answer, sourceMessages: results };
}
