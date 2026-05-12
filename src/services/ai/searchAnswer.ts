import { askMyInbox } from "./askInbox";
import type { SearchResult } from "@/services/db/search";

export interface Citation {
   id: string;
   label: string;
   threadId: string;
   messageId?: string;
 }

export interface SearchAnswerResult {
  answer: string;
  citations: Citation[];
  hits: SearchResult[];
}

const QUESTION_STARTERS = new Set([
  // English
  "what", "when", "who", "where", "how", "why", "which", "did", "does",
  "has", "have", "is", "are", "can", "could", "would", "should", "tell",
  "find", "show", "list", "do",
  // Italian — single starters
  "cosa", "quando", "chi", "dove", "come", "perché", "perche", "quale",
  "quali", "hai", "ho", "trova", "mostra", "elenca", "dimmi", "sai",
  // Italian — preposition + question word combos (first word only)
  "per", "da", "entro", "in",
]);

// Two-word Italian question openers: "per quando", "da quando", "entro quando", etc.
const QUESTION_BIGRAMS = new Set([
  "per quando", "per quale", "per quali", "per chi", "per cosa",
  "da quando", "da dove", "da chi",
  "entro quando", "in che",
]);

export function isQuestionQuery(query: string): boolean {
  const trimmed = query.trim();
  if (trimmed.length < 5) return false;
  if (trimmed.includes("?")) return true;
  const lower = trimmed.toLowerCase();
  const words = lower.split(/\s+/);
  if (words.length < 3) return false;
  // Check two-word opener
  const bigram = `${words[0]} ${words[1]}`;
  if (QUESTION_BIGRAMS.has(bigram)) return true;
  // Check single-word opener
  return QUESTION_STARTERS.has(words[0]!);
}

function buildCitations(answer: string, sources: SearchResult[]): Citation[] {
  const sourceMap = new Map(sources.map((s) => [s.message_id, s]));
  const cited: Citation[] = [];
  const seen = new Set<string>();
  const pattern = /\[([^\]]+)\]/g;
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(answer)) !== null) {
    const id = m[1]!;
    if (seen.has(id)) continue;
    const src = sourceMap.get(id);
    if (!src) continue;
    seen.add(id);
    const label = src.from_name
      ? `${src.from_name} — ${src.subject ?? "(no subject)"}`
      : (src.subject ?? "(no subject)");
    cited.push({ id, label, threadId: src.thread_id, messageId: src.message_id });
  }

  return cited;
}

export async function getSearchAnswer(
  query: string,
  accountId: string,
): Promise<SearchAnswerResult> {
  const result = await askMyInbox(query, accountId);
  const citations = buildCitations(result.answer, result.sourceMessages);
  return {
    answer: result.answer,
    citations,
    hits: result.sourceMessages,
  };
}
