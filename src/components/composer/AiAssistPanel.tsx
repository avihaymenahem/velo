import { useState, useEffect, useRef } from "react";
import type { Editor } from "@tiptap/react";
import { Wand2, Sparkles, ArrowDown, Briefcase, Send, User, Bot } from "lucide-react";
import { isAiAvailable } from "@/services/ai/providerManager";
import {
  composeFromPrompt,
  generateReply,
  transformText,
  type TransformType,
} from "@/services/ai/aiService";
import { useComposerStore } from "@/stores/composerStore";

interface AiMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface AiAssistPanelProps {
  editor: Editor | null;
  isReplyMode: boolean;
  threadMessages?: string[];
}

// Keywords that trigger "write to body" behavior
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

// Keywords that should show as "chat suggestion" (not write to body)
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

// Language keywords that indicate explicit language request (should NOT use default language setting)
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

export function AiAssistPanel({ editor, isReplyMode, threadMessages }: AiAssistPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const setBodyHtml = useComposerStore((s) => s.setBodyHtml);

  // Check availability on mount
  useEffect(() => {
    isAiAvailable().then(setAvailable);
  }, []);

  // Scroll to bottom when new messages arrive
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
    // Clean up markdown fences like ```html and ```
    const cleaned = html.replace(/^```html\s*/i, "").replace(/```$/gm, "").trim();
    editor.chain().focus().setContent(cleaned).run();
    setBodyHtml(editor.getHTML());
  };

  // Check if prompt should write to body vs. show as chat
  const shouldWriteToBody = (text: string): boolean => {
    const lower = text.toLowerCase();
    // First check if it's a chat-only request
    if (CHAT_ONLY_KEYWORDS.some((keyword) => lower.includes(keyword))) {
      return false;
    }
    // Otherwise check if it's a write request
    return WRITE_KEYWORDS.some((keyword) => lower.includes(keyword));
  };

  // Check if user explicitly requested a different language
  const wantsDifferentLanguage = (text: string): boolean => {
    const lower = text.toLowerCase();
    return LANGUAGE_KEYWORDS.some((keyword) => lower.includes(keyword));
  };

  const handleSend = async () => {
    if (!prompt.trim() || loading) return;

    const userPrompt = prompt.trim();
    const isWriteCommand = shouldWriteToBody(userPrompt);
    const skipLanguage = wantsDifferentLanguage(userPrompt);

    // Add user message to chat
    setMessages((prev) => [
      ...prev,
      { role: "user", content: userPrompt, timestamp: Date.now() },
    ]);

    setLoading(true);
    setError(null);

    try {
      let result: string;

      if (isWriteCommand || isReplyMode) {
        // Write directly to body
        if (isReplyMode && threadMessages?.length) {
          result = await generateReply(threadMessages, userPrompt, { skipLanguage });
        } else {
          result = await composeFromPrompt(userPrompt, { skipLanguage });
        }
        applyToEditor(result);
        setPrompt("");
      } else {
        // Show as chat suggestion
        if (isReplyMode && threadMessages?.length) {
          result = await generateReply(threadMessages, userPrompt, { skipLanguage });
        } else {
          // General chat - use compose but don't insert
          result = await composeFromPrompt(userPrompt, { skipLanguage });
        }

        // Add AI response to chat
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: result, timestamp: Date.now() },
        ]);
        setPrompt("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI generation failed");
    } finally {
      setLoading(false);
    }
  };

  const handleTransform = async (type: TransformType) => {
    if (!editor || loading) return;
    const html = editor.getHTML();
    if (!html || html === "<p></p>") return;

    setLoading(true);
    setError(null);

    try {
      const result = await transformText(html, type);
      applyToEditor(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI transform failed");
    } finally {
      setLoading(false);
    }
  };

  const insertSuggestionToBody = (content: string) => {
    applyToEditor(content);
    // Remove from chat after inserting
    setMessages((prev) => prev.filter((m) => m.content !== content));
  };

  return (
    <div className="flex flex-col h-full w-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-secondary">
        <Sparkles size={14} className="text-accent" />
        <span className="text-sm font-medium text-text-primary">AI Assistant</span>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-xs text-text-tertiary mb-3">
              Ask me to help with your email
            </p>
            <div className="text-xs text-text-tertiary space-y-1">
              <p>• "Write a professional email about..."</p>
              <p>• "Suggest an opener for..."</p>
              <p>• "Improve this text" (with text selected)</p>
            </div>
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
              {msg.role === "assistant" && (
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
        <div className="px-3 py-1">
          <p className="text-xs text-danger">{error}</p>
        </div>
      )}

      {/* Quick Actions */}
      {editor && editor.getHTML() && editor.getHTML() !== "<p></p>" && (
        <div className="px-3 py-2 border-t border-border-secondary">
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
      <div className="p-3 border-t border-border-secondary">
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
              isReplyMode
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