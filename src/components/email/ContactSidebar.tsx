import { useState, useEffect, useRef, useCallback } from "react";
import { Mail, Clock, X } from "lucide-react";
import { getContactByEmail, getContactStats, getRecentThreadsWithContact, type ContactStats } from "@/services/db/contacts";
import { fetchAndCacheGravatarUrl } from "@/services/contacts/gravatar";
import { useThreadStore } from "@/stores/threadStore";
import { getThreadById, getThreadLabelIds } from "@/services/db/threads";
import { formatRelativeDate } from "@/utils/date";

interface ContactSidebarProps {
  email: string;
  name: string | null;
  accountId: string;
  onClose: () => void;
}

export function ContactSidebar({ email, name, accountId, onClose }: ContactSidebarProps) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<ContactStats | null>(null);
  const [recentThreads, setRecentThreads] = useState<{ thread_id: string; subject: string | null; last_message_at: number | null }[]>([]);
  const loadedRef = useRef<string | null>(null);
  const { selectThread, threads, setThreads } = useThreadStore();

  const handleThreadClick = useCallback(async (threadId: string) => {
    // If thread is already loaded in the store, just select it
    if (threads.some((t) => t.id === threadId)) {
      selectThread(threadId);
      return;
    }
    // Otherwise load from DB and add to store
    const dbThread = await getThreadById(accountId, threadId);
    if (!dbThread) return;
    const labelIds = await getThreadLabelIds(accountId, threadId);
    const mapped = {
      id: dbThread.id,
      accountId: dbThread.account_id,
      subject: dbThread.subject,
      snippet: dbThread.snippet,
      lastMessageAt: dbThread.last_message_at ?? 0,
      messageCount: dbThread.message_count,
      isRead: dbThread.is_read === 1,
      isStarred: dbThread.is_starred === 1,
      isPinned: dbThread.is_pinned === 1,
      hasAttachments: dbThread.has_attachments === 1,
      labelIds,
      fromName: dbThread.from_name,
      fromAddress: dbThread.from_address,
    };
    setThreads([...threads, mapped]);
    selectThread(threadId);
  }, [accountId, threads, selectThread, setThreads]);

  useEffect(() => {
    if (!email || loadedRef.current === email) return;
    loadedRef.current = email;

    // Load contact avatar
    getContactByEmail(email).then((contact) => {
      if (contact?.avatar_url) {
        setAvatarUrl(contact.avatar_url);
      } else {
        fetchAndCacheGravatarUrl(email).then(setAvatarUrl);
      }
    });

    // Load stats
    getContactStats(email).then(setStats);

    // Load recent threads
    getRecentThreadsWithContact(email).then(setRecentThreads);
  }, [email]);

  const initial = (name?.[0] ?? email[0] ?? "?").toUpperCase();

  return (
    <div className="w-72 h-full border-l border-border-primary bg-bg-secondary overflow-y-auto shrink-0">
      <div className="p-4">
        {/* Close button */}
        <div className="flex justify-end -mt-1 -mr-1 mb-1">
          <button
            onClick={onClose}
            title="Close contact sidebar"
            className="p-1 text-text-tertiary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        {/* Avatar + Name */}
        <div className="flex flex-col items-center text-center mb-4">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={name ?? email}
              className="w-16 h-16 rounded-full mb-2"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xl font-semibold mb-2">
              {initial}
            </div>
          )}
          <div className="text-sm font-medium text-text-primary">
            {name ?? email.split("@")[0]}
          </div>
          <div className="text-xs text-text-tertiary mt-0.5">
            {email}
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="space-y-2 mb-4">
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <Mail size={12} className="text-text-tertiary shrink-0" />
              <span>{stats.emailCount} emails</span>
            </div>
            {stats.firstEmail && (
              <div className="flex items-center gap-2 text-xs text-text-secondary">
                <Clock size={12} className="text-text-tertiary shrink-0" />
                <span>First email: {formatRelativeDate(stats.firstEmail)}</span>
              </div>
            )}
            {stats.lastEmail && (
              <div className="flex items-center gap-2 text-xs text-text-secondary">
                <Clock size={12} className="text-text-tertiary shrink-0" />
                <span>Last email: {formatRelativeDate(stats.lastEmail)}</span>
              </div>
            )}
          </div>
        )}

        {/* Recent threads */}
        {recentThreads.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-2">
              Recent Conversations
            </h4>
            <div className="space-y-1">
              {recentThreads.map((thread) => (
                <button
                  key={thread.thread_id}
                  onClick={() => handleThreadClick(thread.thread_id)}
                  className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-bg-hover transition-colors group"
                >
                  <div className="text-text-secondary group-hover:text-text-primary truncate">
                    {thread.subject ?? "(No subject)"}
                  </div>
                  {thread.last_message_at && (
                    <div className="text-text-tertiary text-[10px] mt-0.5">
                      {formatRelativeDate(thread.last_message_at)}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
