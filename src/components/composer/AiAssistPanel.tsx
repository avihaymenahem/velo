import { useState, useEffect, useRef } from "react";
import type { Editor } from "@tiptap/react";
import { Wand2, Sparkles, ArrowDown, Briefcase, Send, User, Bot } from "lucide-react";
import { isAiAvailable } from "@/services/ai/providerManager";
import {
  composeFromPrompt,
  generateReply,
  modifyEmailContent,
  generateComposerFeedback,
  transformText,
  type TransformType,
} from "@/services/ai/aiService";
import { useComposerStore } from "@/stores/composerStore";

interface AiMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  /** True only for messages that contain actual email content the user can insert */
  insertable?: boolean;
}

interface AiAssistPanelProps {
  editor: Editor | null;
  isReplyMode: boolean;
  threadMessages?: string[];
}

// Keywords indicating "write new from scratch" when body is empty
const WRITE_KEYWORDS = [
  "write",
  "compose",
  "draft",
  "create email",
  "scrivi",
  "crea mail",
  "bozza",
  "fammi una",
];

// Keywords that should show as "chat suggestion" (not write to body) — only when body is empty
const CHAT_ONLY_KEYWORDS = [
  "translate",
  "traduci",
  "traduzione",
  "come",
  "suggerisci",
  "come potrei",
  "suggest",
  "suggestion",
  "help",
  "aiutami",
];

// Keywords meaning "clear everything and start fresh" — used when body is NOT empty
const CLEAR_KEYWORDS = [
  "delete all",
  "clear all",
  "start over",
  "start from scratch",
  "rewrite all",
  "rewrite everything",
  "from scratch",
  "cancella tutto",
  "elimina tutto",
  "ricomincia",
  "ricomincia da capo",
  "rifai tutto",
  "riscrivi tutto",
  "scrivi da zero",
  "riparti da zero",
];

// Language keywords that indicate explicit language request
const LANGUAGE_KEYWORDS = [
  "in italian",
  "in italiano",
  "in english",
  "in inglese",
  "in french",
  "in francese",
  "in spanish",
  "in spagnolo",
  "in german",
  "in tedesco",
  "in portuguese",
  "in portoghese",
  "in chinese",
  "in cinese",
  "in japanese",
  "in giapponese",
];

const isBodyEmpty = (editor: Editor | null): boolean => {
  if (!editor) return true;
  const html = editor.getHTML();
  return !html || html === "<p></p>" || html === "<p> </p>" || editor.getText().trim() === "";
};

export function AiAssistPanel({ editor, isReplyMode, threadMessages }: AiAssistPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const setBodyHtml = useComposerStore((s) => s.setBodyHtml);

  useEffect(() => {
    isAiAvailable().then(setAvailable);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (available === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <Sparkles className="animate-pulse text-accent" size={20} />
      </div>
    );
  }
  if (!available) {
    return (
      <div className="flex items-center justify-center h-full p-4 text-center">
        <p className="text-xs text-text-tertiary">AI not available. Configure in Settings.</p>
      </div>
    );
  }

  const applyToEditor = (html: string) => {
    if (!editor) return;
    const cleaned = html.replace(/^```html\s*/i, "").replace(/```$/gm, "").trim();
    editor.chain().focus().setContent(cleaned).run();
    setBodyHtml(editor.getHTML());
  };

  const addAiMessage = (content: string, insertable = false) => {
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content, timestamp: Date.now(), insertable },
    ]);
  };

  // Fire-and-forget: generates feedback in the configured language and adds it to chat
  const addAiFeedback = (description: string) => {
    generateComposerFeedback(description)
      .then((msg) => addAiMessage(msg, false))
      .catch(() => {/* silently skip feedback if AI call fails */});
  };

  const isClearRequest = (text: string): boolean => {
    const lower = text.toLowerCase();
    return CLEAR_KEYWORDS.some((kw) => lower.includes(kw));
  };

  const shouldWriteToBodyWhenEmpty = (text: string): boolean => {
    const lower = text.toLowerCase();
    if (CHAT_ONLY_KEYWORDS.some((kw) => lower.includes(kw))) return false;
    return WRITE_KEYWORDS.some((kw) => lower.includes(kw));
  };

  const wantsDifferentLanguage = (text: string): boolean => {
    const lower = text.toLowerCase();
    return LANGUAGE_KEYWORDS.some((kw) => lower.includes(kw));
  };

  const handleSend = async () => {
    if (!prompt.trim() || loading) return;

    const userPrompt = prompt.trim();
    const bodyEmpty = isBodyEmpty(editor);
    const skipLanguage = wantsDifferentLanguage(userPrompt);

    setMessages((prev) => [
      ...prev,
      { role: "user", content: userPrompt, timestamp: Date.now() },
    ]);
    setLoading(true);
    setError(null);
    setPrompt("");

    try {
      let result: string;

      if (!bodyEmpty && !isClearRequest(userPrompt)) {
        result = await modifyEmailContent(editor!.getHTML(), userPrompt);
        applyToEditor(result);
        addAiFeedback(`Modified the email draft following user instructions: "${userPrompt}"`);
      } else if (isReplyMode && threadMessages?.length) {
        result = await generateReply(threadMessages, userPrompt, { skipLanguage });
        applyToEditor(result);
        addAiFeedback(`Generated a reply draft for the email thread. User instructions: "${userPrompt}"`);
      } else if (bodyEmpty) {
        result = await composeFromPrompt(userPrompt, { skipLanguage });
        if (shouldWriteToBodyWhenEmpty(userPrompt)) {
          applyToEditor(result);
          addAiFeedback(`Composed a new email draft based on user instructions: "${userPrompt}"`);
        } else {
          // Chat suggestion: user asked for ideas/advice, not a direct write — show as insertable
          addAiMessage(result, true);
        }
      } else {
        // Clear request → compose fresh
        result = await composeFromPrompt(userPrompt, { skipLanguage });
        applyToEditor(result);
        addAiFeedback(`Rewrote the email from scratch based on user instructions: "${userPrompt}"`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI generation failed");
    } finally {
      setLoading(false);
    }
  };

  const TRANSFORM_DESCRIPTIONS: Record<TransformType, string> = {
    improve: "Improved the email's clarity, flow, and phrasing while preserving its meaning and length",
    shorten: "Made the email more concise by removing redundancies and keeping only the essential points",
    formalize: "Rewrote the email in a more formal, professional tone",
  };

  const handleTransform = async (type: TransformType) => {
    if (!editor || loading) return;
    if (isBodyEmpty(editor)) return;

    setLoading(true);
    setError(null);

    try {
      const result = await transformText(editor.getHTML(), type);
      applyToEditor(result);
      addAiFeedback(TRANSFORM_DESCRIPTIONS[type]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI transform failed");
    } finally {
      setLoading(false);
    }
  };

  const insertSuggestionToBody = (content: string) => {
    applyToEditor(content);
    setMessages((prev) => prev.filter((m) => m.content !== content));
  };

  const bodyHasContent = !isBodyEmpty(editor);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-secondary flex-shrink-0">
        <Sparkles size={14} className="text-accent" />
        <span className="text-sm font-medium text-text-primary">AI Assistant</span>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-xs text-text-tertiary mb-3">
              {bodyHasContent
                ? "Ask me to modify, extend, or improve your email"
                : "Ask me to help with your email"}
            </p>
            {!bodyHasContent && (
              <div className="text-xs text-text-tertiary space-y-1">
                <p>• "Write a professional email about..."</p>
                <p>• "Suggest an opener for..."</p>
                <p>• "Improve this text" (with text selected)</p>
              </div>
            )}
            {bodyHasContent && (
              <div className="text-xs text-text-tertiary space-y-1">
                <p>• "Add a closing paragraph"</p>
                <p>• "Make it more formal"</p>
                <p>• "Add details about delivery time"</p>
              </div>
            )}
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <Bot size={14} className="mt-1 text-accent flex-shrink-0" />
            )}
            <div
              className={`max-w-[85%] px-3 py-2 rounded-lg text-xs ${
                msg.role === "user"
                  ? "bg-accent text-white"
                  : "bg-bg-tertiary text-text-primary"
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
              {msg.role === "assistant" && msg.insertable && (
                <button
                  onClick={() => insertSuggestionToBody(msg.content)}
                  className="mt-2 text-accent hover:underline text-xs flex items-center gap-1"
                >
                  <Send size={10} /> Insert to email
                </button>
              )}
            </div>
            {msg.role === "user" && (
              <User size={14} className="mt-1 text-text-tertiary flex-shrink-0" />
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-2 justify-start">
            <Bot size={14} className="mt-1 text-accent" />
            <div className="px-3 py-2 rounded-lg bg-bg-tertiary">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-1 flex-shrink-0">
          <p className="text-xs text-danger">{error}</p>
        </div>
      )}

      {/* Quick Actions */}
      {bodyHasContent && (
        <div className="px-3 py-2 border-t border-border-secondary flex-shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-text-tertiary">Transform:</span>
            <QuickAction
              icon={<Wand2 size={11} />}
              label="Improve"
              onClick={() => handleTransform("improve")}
              disabled={loading}
            />
            <QuickAction
              icon={<ArrowDown size={11} />}
              label="Shorter"
              onClick={() => handleTransform("shorten")}
              disabled={loading}
            />
            <QuickAction
              icon={<Briefcase size={11} />}
              label="Formal"
              onClick={() => handleTransform("formalize")}
              disabled={loading}
            />
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-border-secondary flex-shrink-0">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              bodyHasContent
                ? "Modify, add or extend..."
                : isReplyMode
                  ? "Describe what to write..."
                  : "Ask AI for help..."
            }
            className="flex-1 px-3 py-2 text-sm bg-bg-tertiary border border-border-primary rounded-lg outline-none focus:border-accent text-text-primary placeholder:text-text-tertiary"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !prompt.trim()}
            className="p-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary bg-bg-hover rounded border border-border-primary transition-colors disabled:opacity-50"
    >
      {icon}
      {label}
    </button>
  );
}
