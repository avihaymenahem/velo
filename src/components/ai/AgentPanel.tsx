import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Bot, X, ArrowUp } from "lucide-react";
import { useAccountStore } from "@/stores/accountStore";
import { sendAgentMessage } from "@/services/ai/agentService";
import type { AgentChatMessage, AgentEvent } from "@/services/ai/agentService";
import type { ClaudeAgentMessage } from "@/services/ai/providers/claudeProvider";

interface AgentPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AgentPanel({ isOpen, onClose }: AgentPanelProps) {
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [history, setHistory] = useState<ClaudeAgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeToolDescription, setActiveToolDescription] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const accounts = useAccountStore((s) => s.accounts);
  const accountId = accounts[0]?.id ?? null;

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Escape key to close (when not loading)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoading) onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isLoading, onClose]);

  const onEvent = useCallback((event: AgentEvent) => {
    switch (event.type) {
      case "message":
        setMessages((prev) => [...prev, event.message]);
        break;
      case "tool_start":
        setActiveToolDescription(event.description);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "tool_progress",
            content: event.description,
            timestamp: Date.now(),
          },
        ]);
        break;
      case "tool_end":
        setActiveToolDescription(null);
        setMessages((prev) => {
          // Find the last tool_progress message and update it
          const idx = [...prev].reverse().findIndex((m) => m.role === "tool_progress");
          if (idx === -1) return prev;
          const realIdx = prev.length - 1 - idx;
          const updated = [...prev];
          updated[realIdx] = {
            ...updated[realIdx]!,
            content: event.success
              ? `\u2713 ${updated[realIdx]!.content.replace(/\.\.\.$/, "")}`
              : `\u2717 Failed`,
          };
          return updated;
        });
        break;
      case "error":
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `\u26A0 ${event.error}`,
            timestamp: Date.now(),
          },
        ]);
        setIsLoading(false);
        break;
      case "done":
        setIsLoading(false);
        break;
    }
  }, []);

  const handleSend = useCallback(
    async (text?: string) => {
      const msg = (text ?? input).trim();
      if (!msg || isLoading) return;
      if (!accountId) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "\u26A0 No email account configured.",
            timestamp: Date.now(),
          },
        ]);
        return;
      }
      setInput("");
      setIsLoading(true);
      // Reset textarea height
      if (textareaRef.current) textareaRef.current.style.height = "auto";

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "user",
          content: msg,
          timestamp: Date.now(),
        },
      ]);

      const updatedHistory = await sendAgentMessage(msg, accountId, history, onEvent);
      setHistory(updatedHistory);
      setIsLoading(false);
    },
    [input, isLoading, accountId, history, onEvent],
  );

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[6vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 glass-backdrop"
        onClick={isLoading ? undefined : onClose}
      />
      {/* Panel */}
      <div className="relative bg-bg-primary border border-border-primary rounded-xl glass-modal shadow-xl w-full max-w-2xl mx-4 max-h-[82vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border-primary bg-bg-secondary rounded-t-xl">
          <Bot size={16} className="text-accent shrink-0" />
          <span className="text-sm font-medium text-text-primary flex-1">AI Agent</span>
          <span className="text-[10px] font-medium bg-accent/10 text-accent px-1.5 py-0.5 rounded uppercase tracking-wide">
            Beta
          </span>
          <button
            onClick={isLoading ? undefined : onClose}
            className={`text-text-tertiary transition-colors ${isLoading ? "opacity-40 cursor-not-allowed" : "hover:text-text-primary"}`}
          >
            <X size={16} />
          </button>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <p className="text-sm text-text-tertiary">What would you like to do?</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {["Find my subscriptions", "What emails need my reply?", "Give me an inbox summary"].map((chip) => (
                  <button
                    key={chip}
                    onClick={() => handleSend(chip)}
                    className="border border-border-primary rounded-full px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-hover cursor-pointer transition-colors"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              if (msg.role === "user") {
                return (
                  <div key={msg.id} className="ml-auto bg-accent text-white rounded-2xl rounded-tr-sm px-3 py-2 text-sm max-w-[80%]">
                    {msg.content}
                  </div>
                );
              }
              if (msg.role === "tool_progress") {
                return (
                  <div key={msg.id} className="flex items-center gap-1.5 text-xs text-text-tertiary italic self-center">
                    {activeToolDescription === msg.content && (
                      <div className="w-3 h-3 rounded-full border border-text-tertiary border-t-transparent animate-spin" />
                    )}
                    {msg.content}
                  </div>
                );
              }
              // assistant
              return (
                <div key={msg.id} className="bg-bg-secondary border border-border-primary rounded-2xl rounded-tl-sm px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap">
                  {msg.content}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-border-primary p-3 flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${el.scrollHeight}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                if (!isLoading) onClose();
              }
            }}
            disabled={isLoading}
            placeholder="Ask anything about your inbox..."
            className="flex-1 bg-bg-secondary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-tertiary resize-none max-h-24 overflow-y-auto focus:outline-none focus:border-accent disabled:opacity-50"
            style={{ minHeight: "36px" }}
          />
          <button
            onClick={() => void handleSend()}
            disabled={!input.trim() || isLoading}
            className="bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg p-2 transition-colors shrink-0"
          >
            <ArrowUp size={16} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
