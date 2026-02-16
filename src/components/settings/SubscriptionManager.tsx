import { useState, useEffect, useCallback, useMemo } from "react";
import { useAccountStore } from "@/stores/accountStore";
import {
  getSubscriptions,
  executeUnsubscribe,
  parseUnsubscribeHeaders,
  type SubscriptionEntry,
} from "@/services/unsubscribe/unsubscribeManager";
import { MailMinus, Search, Loader2 } from "lucide-react";
import { formatRelativeDate } from "@/utils/date";

export function SubscriptionManager() {
  const { accounts } = useAccountStore();
  const activeAccountId = accounts.find((a) => a.isActive)?.id;
  const [subscriptions, setSubscriptions] = useState<SubscriptionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [unsubscribingIds, setUnsubscribingIds] = useState<Set<string>>(() => new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!activeAccountId) return;
    setLoading(true);
    getSubscriptions(activeAccountId)
      .then((subs) => setSubscriptions(subs))
      .catch((err) => console.error("Failed to load subscriptions:", err))
      .finally(() => setLoading(false));
  }, [activeAccountId]);

  const handleUnsubscribe = useCallback(async (sub: SubscriptionEntry) => {
    if (!activeAccountId || !sub.latest_unsubscribe_header) return;
    setUnsubscribingIds((prev) => new Set(prev).add(sub.from_address));
    try {
      const result = await executeUnsubscribe(
        activeAccountId,
        "", // threadId not critical for tracking
        sub.from_address,
        sub.from_name,
        sub.latest_unsubscribe_header,
        sub.latest_unsubscribe_post,
      );
      if (result.success) {
        setSubscriptions((prev) =>
          prev.map((s) =>
            s.from_address === sub.from_address
              ? { ...s, status: "unsubscribed" }
              : s,
          ),
        );
      }
    } catch (err) {
      console.error("Failed to unsubscribe:", err);
    } finally {
      setUnsubscribingIds((prev) => {
        const next = new Set(prev);
        next.delete(sub.from_address);
        return next;
      });
    }
  }, [activeAccountId]);

  const handleBulkUnsubscribe = useCallback(async () => {
    const toUnsubscribe = subscriptions.filter(
      (s) => selectedIds.has(s.from_address) && s.status !== "unsubscribed",
    );
    for (const sub of toUnsubscribe) {
      await handleUnsubscribe(sub);
    }
    setSelectedIds(new Set());
  }, [selectedIds, subscriptions, handleUnsubscribe]);

  const toggleSelect = (addr: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(addr)) next.delete(addr);
      else next.add(addr);
      return next;
    });
  };

  const filtered = useMemo(() => {
    if (!searchQuery) return subscriptions;
    const q = searchQuery.toLowerCase();
    return subscriptions.filter((s) =>
      s.from_address.toLowerCase().includes(q) ||
      (s.from_name?.toLowerCase().includes(q) ?? false),
    );
  }, [subscriptions, searchQuery]);

  if (!activeAccountId) {
    return <p className="text-sm text-text-tertiary">No active account selected.</p>;
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-text-tertiary">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Loading subscriptions...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search senders..."
            className="w-full pl-8 pr-3 py-1.5 bg-bg-tertiary border border-border-primary rounded-md text-xs text-text-primary outline-none focus:border-accent"
          />
        </div>
        {selectedIds.size > 0 && (
          <button
            onClick={handleBulkUnsubscribe}
            className="px-3 py-1.5 text-xs bg-danger text-white rounded-md hover:bg-danger/80 transition-colors shrink-0"
          >
            Unsubscribe ({selectedIds.size})
          </button>
        )}
      </div>

      <p className="text-xs text-text-tertiary">
        {subscriptions.length} sender{subscriptions.length !== 1 ? "s" : ""} detected with unsubscribe headers.
      </p>

      <div className="space-y-1 max-h-[500px] overflow-y-auto">
        {filtered.map((sub) => {
          const parsed = parseUnsubscribeHeaders(
            sub.latest_unsubscribe_header,
            sub.latest_unsubscribe_post,
          );
          const isUnsubscribed = sub.status === "unsubscribed";
          const isLoading = unsubscribingIds.has(sub.from_address);
          const isSelected = selectedIds.has(sub.from_address);

          return (
            <div
              key={sub.from_address}
              className={`flex items-center gap-3 py-2.5 px-3 rounded-lg transition-colors ${
                isSelected ? "bg-accent/10" : "bg-bg-secondary hover:bg-bg-hover"
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleSelect(sub.from_address)}
                disabled={isUnsubscribed}
                className="shrink-0 accent-accent"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-text-primary truncate font-medium">
                    {sub.from_name ?? sub.from_address}
                  </span>
                  {isUnsubscribed && (
                    <span className="text-[0.625rem] px-1.5 rounded-full bg-success/15 text-success">
                      Unsubscribed
                    </span>
                  )}
                  {parsed.hasOneClick && !isUnsubscribed && (
                    <span className="text-[0.625rem] px-1.5 rounded-full bg-accent/15 text-accent">
                      One-click
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-text-tertiary mt-0.5">
                  <span className="truncate">{sub.from_address}</span>
                  <span className="shrink-0">{sub.message_count} emails</span>
                  <span className="shrink-0">{formatRelativeDate(sub.latest_date)}</span>
                </div>
              </div>
              {!isUnsubscribed && (
                <button
                  onClick={() => handleUnsubscribe(sub)}
                  disabled={isLoading}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs text-danger hover:text-danger/80 bg-bg-tertiary rounded-md border border-border-primary transition-colors disabled:opacity-50 shrink-0"
                >
                  {isLoading ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <MailMinus size={12} />
                  )}
                  {isLoading ? "..." : "Unsubscribe"}
                </button>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-sm text-text-tertiary py-4 text-center">
            {searchQuery ? "No matching senders found." : "No subscriptions detected yet. Subscriptions appear as emails are synced."}
          </p>
        )}
      </div>
    </div>
  );
}
