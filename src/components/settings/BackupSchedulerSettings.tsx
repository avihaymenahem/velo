import { useState, useEffect, useCallback } from "react";
import { useAccountStore } from "@/stores/accountStore";
import {
  getSchedules,
  toggleSchedule,
  deleteSchedule,
  scheduleBackup,
  runBackupNow,
  type BackupSchedule,
} from "@/services/export/exportService";
import { Archive, Play, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";

export function BackupSchedulerSettings() {
  const accounts = useAccountStore((s) => s.accounts);
  const activeAccount = accounts.find((a) => a.isActive);
  const accountId = activeAccount?.id ?? null;

  const [schedules, setSchedules] = useState<BackupSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);

  // New schedule form state
  const [formName, setFormName] = useState("");
  const [formFormat, setFormFormat] = useState("mbox");
  const [formCron, setFormCron] = useState("0 */6 * * *");
  const [formDest, setFormDest] = useState("");
  const [formEncrypt, setFormEncrypt] = useState(false);

  const loadSchedules = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const s = await getSchedules(accountId);
      setSchedules(s);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    if (accountId) loadSchedules();
    else setLoading(false);
  }, [accountId, loadSchedules]);

  const handleToggle = useCallback(async (id: string, enabled: boolean) => {
    await toggleSchedule(id, enabled);
    setSchedules((prev) =>
      prev.map((s) => (s.id === id ? { ...s, is_enabled: enabled ? 1 : 0 } : s)),
    );
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await deleteSchedule(id);
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleRunNow = useCallback(async (id: string) => {
    setRunningId(id);
    try {
      await runBackupNow(id);
      await loadSchedules();
    } finally {
      setRunningId(null);
    }
  }, [loadSchedules]);

  const handleCreate = useCallback(async () => {
    if (!accountId || !formName.trim() || !formDest.trim()) return;
    await scheduleBackup({
      accountId,
      name: formName.trim(),
      format: formFormat,
      cronExpression: formCron,
      destinationPath: formDest.trim(),
      encrypt: formEncrypt,
    });
    setShowForm(false);
    setFormName("");
    setFormFormat("mbox");
    setFormCron("0 */6 * * *");
    setFormDest("");
    setFormEncrypt(false);
    await loadSchedules();
  }, [accountId, formName, formFormat, formCron, formDest, formEncrypt, loadSchedules]);

  const formatLabel = (fmt: string) => {
    switch (fmt) {
      case "mbox": return "Mbox";
      case "eml": return "EML";
      case "zip": return "ZIP";
      default: return fmt;
    }
  };

  const cronDescriptions: Record<string, string> = {
    "0 */1 * * *": "Every hour",
    "0 */6 * * *": "Every 6 hours",
    "0 */12 * * *": "Every 12 hours",
    "0 0 * * *": "Daily at midnight",
    "0 0 * * 0": "Weekly on Sunday",
    "0 0 1 * *": "Monthly on 1st",
    "*/30 * * * *": "Every 30 minutes",
  };

  if (!accountId) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-text-tertiary">
        <Archive size={32} strokeWidth={1} />
        <p className="text-sm">Select an account to manage backups</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-tertiary">
          Schedule automatic email backups in mbox format.
        </p>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-accent border border-accent/30 rounded-md hover:bg-accent/10 transition-colors"
        >
          <Plus size={12} />
          {showForm ? "Cancel" : "Add Schedule"}
        </button>
      </div>

      {showForm && (
        <div className="p-4 bg-bg-secondary rounded-lg space-y-3">
          <input
            type="text"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Schedule name"
            className="w-full px-3 py-2 text-xs bg-bg-tertiary border border-border-primary rounded-md text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <div className="flex gap-2">
            <select
              value={formFormat}
              onChange={(e) => setFormFormat(e.target.value)}
              className="flex-1 px-3 py-2 text-xs bg-bg-tertiary border border-border-primary rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="mbox">Mbox</option>
              <option value="eml">EML</option>
              <option value="zip">ZIP</option>
            </select>
            <select
              value={formCron}
              onChange={(e) => setFormCron(e.target.value)}
              className="flex-1 px-3 py-2 text-xs bg-bg-tertiary border border-border-primary rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="*/30 * * * *">Every 30 minutes</option>
              <option value="0 */1 * * *">Every hour</option>
              <option value="0 */6 * * *">Every 6 hours</option>
              <option value="0 */12 * * *">Every 12 hours</option>
              <option value="0 0 * * *">Daily</option>
              <option value="0 0 * * 0">Weekly</option>
              <option value="0 0 1 * *">Monthly</option>
            </select>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={formDest}
              onChange={(e) => setFormDest(e.target.value)}
              placeholder="Destination path (e.g., C:\backups\velo\)"
              className="flex-1 px-3 py-2 text-xs bg-bg-tertiary border border-border-primary rounded-md text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formEncrypt}
              onChange={(e) => setFormEncrypt(e.target.checked)}
              className="accent-accent"
            />
            <span className="text-xs text-text-secondary">Encrypt backup</span>
          </label>
          <button
            onClick={handleCreate}
            disabled={!formName.trim() || !formDest.trim()}
            className="w-full px-4 py-2 text-xs font-medium text-white bg-accent rounded-md hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            Create Schedule
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <p className="text-sm text-text-tertiary">Loading schedules...</p>
        </div>
      ) : schedules.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-text-tertiary">
          <Archive size={32} strokeWidth={1} />
          <p className="text-sm">No backup schedules yet</p>
          <p className="text-xs">Create one to auto-export your emails</p>
        </div>
      ) : (
        <div className="space-y-2">
          {schedules.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between p-3 bg-bg-secondary rounded-lg"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">{s.name}</span>
                  <span className="text-[0.6rem] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent font-medium">
                    {formatLabel(s.format)}
                  </span>
                  <span
                    className={`text-[0.6rem] px-1.5 py-0.5 rounded-full font-medium ${
                      s.is_enabled
                        ? "bg-success/10 text-success"
                        : "bg-bg-tertiary text-text-tertiary"
                    }`}
                  >
                    {s.is_enabled ? "Active" : "Paused"}
                  </span>
                </div>
                <div className="text-xs text-text-tertiary mt-0.5">
                  {cronDescriptions[s.cron_expression] ?? s.cron_expression}
                  {s.last_run_at && ` · Last run: ${new Date(s.last_run_at * 1000).toLocaleDateString()}`}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <button
                  onClick={() => handleRunNow(s.id)}
                  disabled={runningId === s.id}
                  title="Run now"
                  className="p-1.5 text-text-tertiary hover:text-accent transition-colors disabled:opacity-50"
                >
                  <Play size={14} fill={runningId === s.id ? "currentColor" : "none"} />
                </button>
                <button
                  onClick={() => handleToggle(s.id, !s.is_enabled)}
                  title={s.is_enabled ? "Pause" : "Activate"}
                  className={`p-1.5 transition-colors ${
                    s.is_enabled ? "text-success hover:text-success/80" : "text-text-tertiary hover:text-text-primary"
                  }`}
                >
                  {s.is_enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
                  title="Delete"
                  className="p-1.5 text-text-tertiary hover:text-danger transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
