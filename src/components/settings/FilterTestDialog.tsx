import { useState, useEffect, useCallback } from "react";
import { X, CheckCircle, XCircle, Play } from "lucide-react";
import { queryWithRetry } from "@/services/db/connection";
import { testFilterOnMessage, type FilterTestResult } from "@/services/filters/filterTester";

interface FilterTestDialogProps {
  isOpen: boolean;
  onClose: () => void;
  ruleId: string;
}

interface MessageOption {
  id: string;
  subject: string;
  from_address: string;
}

export function FilterTestDialog({ isOpen, onClose, ruleId }: FilterTestDialogProps) {
  const [messages, setMessages] = useState<MessageOption[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState("");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<FilterTestResult | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setResult(null);
    setSelectedMessageId("");
    setTesting(false);

async function loadMessages() {
       const rows = await queryWithRetry(async (db) => {
         return db.select<MessageOption[]>(
           "SELECT id, subject, from_address FROM messages ORDER BY date DESC LIMIT 50",
         );
       });
       setMessages(rows);
     }
    loadMessages();
  }, [isOpen]);

  const handleTest = useCallback(async () => {
    if (!selectedMessageId) return;
    setTesting(true);
    setResult(null);
    try {
      const res = await testFilterOnMessage(ruleId, selectedMessageId);
      setResult(res);
    } catch (err) {
      console.error("Filter test failed:", err);
    } finally {
      setTesting(false);
    }
  }, [ruleId, selectedMessageId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="glass-modal bg-bg-secondary border border-border-primary rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-primary">
          <h3 className="text-sm font-semibold text-text-primary">Test Filter Rule</h3>
          <button
            onClick={onClose}
            className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1.5">
              Select a message to test against
            </label>
            <select
              value={selectedMessageId}
              onChange={(e) => { setSelectedMessageId(e.target.value); setResult(null); }}
              className="w-full bg-bg-tertiary text-text-primary text-sm px-3 py-2 rounded-lg border border-border-primary outline-none focus:border-accent"
            >
              <option value="">Choose a message...</option>
              {messages.map((msg) => (
                <option key={msg.id} value={msg.id}>
                  {msg.subject || "(No subject)"} — {msg.from_address}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleTest}
            disabled={!selectedMessageId || testing}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-lg transition-colors disabled:opacity-50"
          >
            <Play size={13} />
            {testing ? "Testing..." : "Test"}
          </button>

          {result && (
            <div className="space-y-3">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                result.overall
                  ? "bg-success/10 text-success"
                  : "bg-danger/10 text-danger"
              }`}>
                {result.overall ? (
                  <CheckCircle size={16} />
                ) : (
                  <XCircle size={16} />
                )}
                {result.overall ? "PASS — All conditions matched" : "FAIL — Not all conditions matched"}
              </div>

              {result.conditions.length === 0 ? (
                <p className="text-xs text-text-tertiary">No conditions defined — matches everything.</p>
              ) : (
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-text-secondary">Per-condition results</span>
                  {result.conditions.map((cond, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                        cond.passed
                          ? "bg-success/5 text-text-primary"
                          : "bg-danger/5 text-text-primary"
                      }`}
                    >
                      {cond.passed ? (
                        <CheckCircle size={13} className="text-success shrink-0" />
                      ) : (
                        <XCircle size={13} className="text-danger shrink-0" />
                      )}
                      <span className="font-medium">{cond.condition.field}</span>
                      <span className="text-text-tertiary">{cond.condition.operator}</span>
                      <code className="bg-bg-tertiary px-1 rounded text-[0.625rem] max-w-[120px] truncate">
                        "{cond.condition.value}"
                      </code>
                      {cond.passed && cond.matchedText && (
                        <>
                          <span className="text-text-tertiary">→ matched</span>
                          <code className="bg-bg-tertiary px-1 rounded text-[0.625rem] text-success max-w-[100px] truncate">
                            "{cond.matchedText}"
                          </code>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
