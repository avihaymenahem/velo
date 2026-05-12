import { searchMessages, type SearchResult } from "@/services/db/search";
import { askInbox as callAskInbox } from "./aiService";
import { getSetting } from "@/services/db/settings";
import { getAccountRagEnabled } from "@/services/db/accounts";
import {
  generateEmbedding,
  semanticSearch,
  sanitizeForEmbedding,
  getEmbeddingPrefixes,
  type SemanticResult,
} from "./ollamaEmbeddings";

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

function semToSearch(s: SemanticResult): SearchResult {
  return {
    message_id: s.message_id,
    account_id: s.account_id,
    thread_id: s.thread_id,
    subject: s.subject,
    from_name: s.from_name,
    from_address: s.from_address,
    snippet: s.snippet,
    date: s.date,
    rank: s.similarity,
  };
}

export async function askMyInbox(
  question: string,
  accountId: string,
): Promise<AskInboxResult> {
  const terms = extractSearchTerms(question);
  if (!terms.trim()) {
    return {
      answer: "I couldn't understand the question. Please try rephrasing it.",
      sourceMessages: [],
    };
  }

  const ragEnabled = await getSetting("rag_enabled");
  const accountRagEnabled = ragEnabled === "true" ? await getAccountRagEnabled(accountId) : false;
  const serverUrl = accountRagEnabled ? await getSetting("ollama_server_url") : null;
  const embeddingModel = (await getSetting("embedding_model")) ?? "nomic-embed-text";

  let results: SearchResult[];

  if (accountRagEnabled && serverUrl) {
    // Hybrid retrieval: run FTS and embedding query in parallel
    const cleanQuery = sanitizeForEmbedding(question, 256);
    const { query: queryPrefix } = getEmbeddingPrefixes(embeddingModel);
    const prefixedQuery = cleanQuery
      ? queryPrefix ? `${queryPrefix}${cleanQuery}` : cleanQuery
      : cleanQuery;
    const [ftsResults, queryEmbedding] = await Promise.all([
      searchMessages(terms, accountId, 20),
      generateEmbedding(prefixedQuery ?? "", serverUrl, embeddingModel),
    ]);

    if (queryEmbedding) {
      const semResults = await semanticSearch(queryEmbedding, accountId, 20);

      const hasFts = ftsResults.length > 0;
      const hasSem = semResults.length > 0;

      // Dynamic weights: both available → 40/60; only one available → 100/0 or 0/100
      const ftsW = hasFts && hasSem ? 0.4 : hasFts ? 1.0 : 0.0;
      const semW = hasFts && hasSem ? 0.6 : hasSem ? 1.0 : 0.0;

      // Normalised rank score: top result = 1.0, last = ~0
      const ftsScore = new Map<string, number>();
      ftsResults.forEach((r, i) => ftsScore.set(r.message_id, 1 - i / Math.max(ftsResults.length, 1)));

      const semScore = new Map<string, SemanticResult>();
      semResults.forEach((r) => semScore.set(r.message_id, r));

      const allIds = new Set([...ftsScore.keys(), ...semScore.keys()]);

      type Scored = SearchResult & { hybridScore: number };
      const merged: Scored[] = [];

      for (const id of allIds) {
        const fts = ftsScore.get(id) ?? 0;
        const sem = semScore.get(id)?.similarity ?? 0;
        const hybridScore = ftsW * fts + semW * sem;

        const base = ftsResults.find((r) => r.message_id === id)
          ?? semToSearch(semScore.get(id)!);

        merged.push({ ...base, hybridScore });
      }

      merged.sort((a, b) => b.hybridScore - a.hybridScore);
      results = merged.slice(0, 15);
    } else {
      // Ollama unreachable — fall back to FTS silently
      results = ftsResults.slice(0, 15);
    }
  } else {
    results = await searchMessages(terms, accountId, 15);
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
