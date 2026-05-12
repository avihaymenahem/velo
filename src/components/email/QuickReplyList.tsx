import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquarePlus, Zap, ChevronDown, ChevronRight } from "lucide-react";
import { getQuickReplies, incrementQuickReplyUsage, type QuickReply } from "@/services/db/quickReplies";

interface QuickReplyListProps {
  accountId: string;
  onInsert: (bodyHtml: string, title: string) => void;
}

export function QuickReplyList({ accountId, onInsert }: QuickReplyListProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);

  const load = useCallback(async () => {
    if (!accountId) return;
    const qrs = await getQuickReplies(accountId);
    setQuickReplies(qrs);
  }, [accountId]);

  useEffect(() => {
    if (expanded) load();
  }, [expanded, load]);

  const handleInsert = useCallback(async (qr: QuickReply) => {
    onInsert(qr.body_html, qr.title);
    await incrementQuickReplyUsage(qr.id).catch(() => {});
  }, [onInsert]);

  if (quickReplies.length === 0 && !expanded) return null;

  return (
    <div className="border-t border-border-secondary">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full px-4 py-2 text-xs text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <MessageSquarePlus size={13} />
        {t("quickReply.title")}
      </button>

      {expanded && (
        <div className="px-2 pb-2 space-y-0.5">
          {quickReplies.length === 0 ? (
            <p className="text-xs text-text-tertiary px-2 py-2">
              {t("quickReply.noReplies")}. {t("quickReply.createInSettings")}
            </p>
          ) : (
            quickReplies.map((qr) => (
              <button
                key={qr.id}
                onClick={() => handleInsert(qr)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-md transition-colors text-left"
              >
                <Zap size={12} className="text-accent shrink-0" />
                <span className="flex-1 truncate">{qr.title}</span>
                {qr.shortcut && (
                  <kbd className="text-[0.625rem] bg-bg-tertiary px-1.5 py-0.5 rounded border border-border-primary font-mono text-text-tertiary shrink-0">
                    {qr.shortcut}
                  </kbd>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
