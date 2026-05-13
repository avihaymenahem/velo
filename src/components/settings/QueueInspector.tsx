import { useState, useEffect, useCallback } from "react";
import { Clock, Pause, Play, RefreshCw, RotateCcw, Trash2, AlertCircle, CheckCircle, Loader, Hourglass, XCircle } from "lucide-react";
import { useUIStore } from "@/stores/uiStore";
import { queryWithRetry } from "@/services/db/connection";
import { getPendingOpsCount, clearFailedOperations, retryFailedOperations } from "@/services/db/pendingOperations";
import { stopQueueProcessor, startQueueProcessor } from "@/services/queue/queueProcessor";
import { getQueuePaused, setQueuePaused } from "@/services/db/settings";

interface QueueOperation {
  id: string;
  account_id: string;
  operation_type: string;
  resource_id: string;
  params: string;
  status: string;
  retry_count: number;
  max_retries: number;
  next_retry_at: number | null;
  created_at: number;
  error_message: string | null;
  campaign_id: string | null;
}

const STATUS_ICONS: Record<string, typeof Clock> = {
  pending: Hourglass,
  executing: Loader,
  sent: CheckCircle,
  failed: XCircle,
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-warning",
  executing: "text-accent",
  sent: "text-success",
  failed: "text-danger",
};

export function QueueInspector() {
  const pendingOpsCount = useUIStore((s) => s.pendingOpsCount);
  const [operations, setOperations] = useState<QueueOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const loadOperations = useCallback(async () => {
    try {
      const rows = await queryWithRetry(async (db) =>
        db.select<QueueOperation[]>(
          "SELECT * FROM pending_operations ORDER BY created_at DESC LIMIT 100",
        ),
      );
      setOperations(rows);
    } catch (err) {
      console.error("Failed to load queue operations:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOperations();
    getQueuePaused().then(setPaused);
    const interval = setInterval(loadOperations, 10_000);
    return () => clearInterval(interval);
  }, [loadOperations]);

  async function handlePauseResume() {
    if (paused) {
      startQueueProcessor();
      setPaused(false);
      await setQueuePaused(false);
    } else {
      stopQueueProcessor();
      setPaused(true);
      await setQueuePaused(true);
    }
  }

  async function handleRetryFailed() {
    await retryFailedOperations();
    await loadOperations();
    await updatePendingCount();
  }

  async function handleClearFailed() {
    await clearFailedOperations();
    await loadOperations();
    await updatePendingCount();
  }

  async function handleDeleteOp(id: string) {
    await queryWithRetry(async (db) =>
      db.execute("DELETE FROM pending_operations WHERE id = $1", [id]),
    );
    await loadOperations();
    await updatePendingCount();
  }

  async function updatePendingCount() {
    const count = await getPendingOpsCount();
    useUIStore.getState().setPendingOpsCount(count);
  }

  const filteredOps = filter === "all" ? operations : operations.filter((o) => o.status === filter);

  const counts = {
    all: operations.length,
    pending: operations.filter((o) => o.status === "pending").length,
    executing: operations.filter((o) => o.status === "executing").length,
    failed: operations.filter((o) => o.status === "failed").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-text-primary font-medium">
          <Clock size={16} />
          Queue Inspector
          <span className="text-xs text-text-tertiary font-normal">({pendingOpsCount} pending)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handlePauseResume}
            className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
              paused
                ? "bg-accent text-white hover:bg-accent-hover"
                : "bg-bg-secondary text-text-secondary hover:text-text-primary border border-border-primary"
            }`}
          >
            {paused ? <Play size={14} /> : <Pause size={14} />}
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            onClick={handleRetryFailed}
            disabled={counts.failed === 0}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-bg-secondary text-text-secondary hover:text-text-primary rounded-lg border border-border-primary transition-colors disabled:opacity-40"
          >
            <RotateCcw size={14} />
            Retry Failed
          </button>
          <button
            onClick={handleClearFailed}
            disabled={counts.failed === 0}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-bg-secondary text-text-secondary hover:text-danger rounded-lg border border-border-primary transition-colors disabled:opacity-40"
          >
            <Trash2 size={14} />
            Clear Failed
          </button>
          <button
            onClick={loadOperations}
            className="p-1.5 text-text-tertiary hover:text-text-primary transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1">
        {(["all", "pending", "executing", "failed"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1 text-xs rounded-lg transition-colors ${
              filter === key
                ? "bg-accent/10 text-accent border border-accent/30"
                : "text-text-tertiary hover:text-text-secondary border border-transparent"
            }`}
          >
            {key.charAt(0).toUpperCase() + key.slice(1)}
            <span className="ml-1 text-[0.625rem] opacity-60">({counts[key]})</span>
          </button>
        ))}
      </div>

      {/* Queue table */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-sm text-text-tertiary">
          <Loader size={16} className="animate-spin mr-2" />
          Loading queue...
        </div>
      ) : filteredOps.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-sm text-text-tertiary">
          <CheckCircle size={24} className="mb-2 text-success" />
          Queue is empty
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-text-tertiary border-b border-border-primary">
                <th className="text-left py-2 px-2 font-medium">Type</th>
                <th className="text-left py-2 px-2 font-medium">Status</th>
                <th className="text-left py-2 px-2 font-medium">Resource</th>
                <th className="text-left py-2 px-2 font-medium">Campaign</th>
                <th className="text-left py-2 px-2 font-medium">Created</th>
                <th className="text-left py-2 px-2 font-medium">Retries</th>
                <th className="text-left py-2 px-2 font-medium">Error</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {filteredOps.map((op) => {
                const StatusIcon = STATUS_ICONS[op.status] ?? Clock;
                const statusColor = STATUS_COLORS[op.status] ?? "text-text-tertiary";
                return (
                  <tr key={op.id} className="border-b border-border-primary hover:bg-bg-hover transition-colors group">
                    <td className="py-2 px-2 text-text-primary font-mono text-xs">{op.operation_type}</td>
                    <td className="py-2 px-2">
                      <span className={`flex items-center gap-1 text-xs ${statusColor}`}>
                        <StatusIcon size={12} className={op.status === "executing" ? "animate-spin" : ""} />
                        {op.status}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-text-secondary text-xs max-w-[160px] truncate" title={op.resource_id}>
                      {op.resource_id}
                    </td>
                    <td className="py-2 px-2 text-text-secondary text-xs">
                      {op.campaign_id ? (
                        <span className="font-mono text-[0.625rem]">{op.campaign_id.slice(0, 12)}...</span>
                      ) : (
                        <span className="text-text-tertiary">—</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-text-tertiary text-xs">
                      {new Date(op.created_at * 1000).toLocaleString()}
                    </td>
                    <td className="py-2 px-2 text-text-tertiary text-xs">
                      {op.retry_count}/{op.max_retries}
                    </td>
                    <td className="py-2 px-2 text-xs max-w-[200px] truncate" title={op.error_message ?? ""}>
                      {op.error_message ? (
                        <span className="text-danger flex items-center gap-1">
                          <AlertCircle size={10} />
                          {op.error_message}
                        </span>
                      ) : (
                        <span className="text-text-tertiary">—</span>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      <button
                        onClick={() => handleDeleteOp(op.id)}
                        className="p-1 text-text-tertiary hover:text-danger transition-colors opacity-0 group-hover:opacity-100"
                        title="Remove from queue"
                      >
                        <XCircle size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {paused && (
        <div className="flex items-center gap-2 px-3 py-2 bg-warning/10 border border-warning/30 rounded-lg text-xs text-warning">
          <Pause size={14} />
          Queue is paused. New operations will accumulate until resumed.
        </div>
      )}
    </div>
  );
}
