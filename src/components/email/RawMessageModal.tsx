import { useState, useEffect, useCallback } from "react";
import { Modal } from "@/components/ui/Modal";
import { getEmailProvider } from "@/services/email/providerFactory";
import { Copy, Check } from "lucide-react";

interface RawMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  messageId: string;
  accountId: string;
}

export function RawMessageModal({
  isOpen,
  onClose,
  messageId,
  accountId,
}: RawMessageModalProps) {
  const [raw, setRaw] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setRaw(null);
      setError(null);
      setLoading(false);
      setCopied(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getEmailProvider(accountId)
      .then((provider) => provider.fetchRawMessage(messageId))
      .then((source) => {
        if (!cancelled) {
          setRaw(source);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, messageId, accountId]);

  const handleCopy = useCallback(async () => {
    if (!raw) return;
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: no-op in non-secure contexts
    }
  }, [raw]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Message Source"
      width="w-[720px] max-w-[90vw]"
      renderHeader={
        <div className="px-4 py-3 border-b border-border-primary flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">
            Message Source
          </h3>
          <div className="flex items-center gap-2">
            {raw && (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary px-2 py-1 rounded hover:bg-bg-hover transition-colors"
                title="Copy to clipboard"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copied" : "Copy"}
              </button>
            )}
            <button
              onClick={onClose}
              className="text-text-tertiary hover:text-text-primary text-lg leading-none"
            >
              &times;
            </button>
          </div>
        </div>
      }
    >
      <div className="max-h-[70vh] overflow-y-auto p-4">
        {loading && (
          <div className="flex items-center justify-center py-12 text-text-tertiary text-sm">
            Loading message source...
          </div>
        )}
        {error && (
          <div className="text-danger text-sm py-4">
            Failed to load message source: {error}
          </div>
        )}
        {raw && (
          <pre className="text-xs font-mono text-text-secondary whitespace-pre-wrap break-all select-text">
            {raw}
          </pre>
        )}
      </div>
    </Modal>
  );
}
