import { useState, useEffect, useCallback } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAccountStore } from "@/stores/accountStore";
import { getSetting, setSetting } from "@/services/db/settings";
import { deleteAccount } from "@/services/db/accounts";
import { removeClient } from "@/services/gmail/tokenManager";
import { triggerSync, forceFullSync, resyncAccount } from "@/services/gmail/syncManager";
import { syncGoogleContacts } from "@/services/contacts/googleContacts";
import { RefreshCw, Mail, GripVertical } from "lucide-react";
import { Section, SettingRow } from "./shared";
import { Button } from "@/components/ui/Button";
import { t } from "@/i18n";
import { EditImapAccount } from "@/components/accounts/EditImapAccount";
import { ImapIdleFoldersEditor } from "@/components/settings/ImapIdleFoldersEditor";
import { EditGmailAccount } from "@/components/accounts/EditGmailAccount";
import { AddAccount } from "@/components/accounts/AddAccount";
import {
  getAliasesForAccount,
  setDefaultAlias,
  mapDbAlias,
  type SendAsAlias,
} from "@/services/db/sendAsAliases";

function SortableAccountRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center gap-1"
    >
      <button
        {...attributes}
        {...listeners}
        className="text-text-tertiary/40 hover:text-text-tertiary transition-colors cursor-grab active:cursor-grabbing touch-none p-1 shrink-0"
        tabIndex={-1}
        aria-label={t("settings.accounts.dragToReorder")}
      >
        <GripVertical size={15} />
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function SendAsAliasesSection() {
  const accounts = useAccountStore((s) => s.accounts);
  const storedActiveId = useAccountStore((s) => s.activeAccountId);
  const [aliases, setAliases] = useState<SendAsAlias[]>([]);

  const activeAccount = storedActiveId
    ? accounts.find((a) => a.id === storedActiveId)
    : accounts[0];

  useEffect(() => {
    if (!activeAccount) return;
    let cancelled = false;
    getAliasesForAccount(activeAccount.id).then((dbAliases) => {
      if (cancelled) return;
      setAliases(dbAliases.map(mapDbAlias));
    });
    return () => {
      cancelled = true;
    };
  }, [activeAccount]);

  const handleSetDefault = async (alias: SendAsAlias) => {
    if (!activeAccount) return;
    await setDefaultAlias(activeAccount.id, alias.id);
    setAliases((prev) =>
      prev.map((a) => ({
        ...a,
        isDefault: a.id === alias.id,
      })),
    );
  };

  return (
    <Section title={t("settings.accounts.sections.sendAsAliases")}>
      <p className="text-xs text-text-tertiary mb-3">
        {t("settings.accounts.aliasesDesc")}
      </p>
      {aliases.length === 0 ? (
        <p className="text-sm text-text-tertiary">
          {t("settings.accounts.noAliases")}
        </p>
      ) : (
        <div className="space-y-2">
          {aliases.map((alias) => (
            <div
              key={alias.id}
              className="flex items-center justify-between py-2.5 px-4 bg-bg-secondary rounded-lg"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Mail size={15} className="text-text-tertiary shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-text-primary truncate">
                    {alias.displayName ? `${alias.displayName} <${alias.email}>` : alias.email}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {alias.isPrimary && (
                      <span className="text-[0.625rem] bg-accent/15 text-accent px-1.5 py-0.5 rounded-full">
                        {t("settings.accounts.aliasPrimary")}
                      </span>
                    )}
                    {alias.isDefault && (
                      <span className="text-[0.625rem] bg-success/15 text-success px-1.5 py-0.5 rounded-full">
                        {t("settings.accounts.aliasDefault")}
                      </span>
                    )}
                    {alias.verificationStatus !== "accepted" && (
                      <span className="text-[0.625rem] bg-warning/15 text-warning px-1.5 py-0.5 rounded-full">
                        {alias.verificationStatus}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {!alias.isDefault && (
                <button
                  onClick={() => handleSetDefault(alias)}
                  className="text-xs text-accent hover:text-accent-hover transition-colors shrink-0 ml-3"
                >
                  {t("settings.accounts.setAsDefault")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function SyncOfflineSection() {
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadCounts = useCallback(async () => {
    const { getPendingOpsCount, getFailedOpsCount } = await import("@/services/db/pendingOperations");
    setPendingCount(await getPendingOpsCount());
    setFailedCount(await getFailedOpsCount());
  }, []);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  const handleRetryFailed = async () => {
    setLoading(true);
    try {
      const { retryFailedOperations } = await import("@/services/db/pendingOperations");
      await retryFailedOperations();
      await loadCounts();
    } finally {
      setLoading(false);
    }
  };

  const handleClearFailed = async () => {
    setLoading(true);
    try {
      const { clearFailedOperations } = await import("@/services/db/pendingOperations");
      await clearFailedOperations();
      await loadCounts();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Section title={t("settings.accounts.sections.syncOffline")}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-text-secondary">{t("settings.accounts.pendingOps")}</span>
            <p className="text-xs text-text-tertiary mt-0.5">
              {t("settings.accounts.pendingOpsDesc")}
            </p>
          </div>
          <span className="text-sm font-mono text-text-primary">{pendingCount}</span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-text-secondary">{t("settings.accounts.failedOps")}</span>
            <p className="text-xs text-text-tertiary mt-0.5">
              {t("settings.accounts.failedOpsDesc")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-text-primary">{failedCount}</span>
            {failedCount > 0 && (
              <>
                <button
                  onClick={handleRetryFailed}
                  disabled={loading}
                  className="text-xs text-accent hover:text-accent-hover transition-colors disabled:opacity-50"
                >
                  {t("settings.accounts.retryFailed")}
                </button>
                <button
                  onClick={handleClearFailed}
                  disabled={loading}
                  className="text-xs text-danger hover:opacity-80 transition-colors disabled:opacity-50"
                >
                  {t("settings.accounts.clearFailed")}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}


export function AccountsTab() {
  const accounts = useAccountStore((s) => s.accounts);
  const removeAccountFromStore = useAccountStore((s) => s.removeAccount);
  const reorderAccounts = useAccountStore((s) => s.reorderAccounts);
  const accountSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncPeriodDays, setSyncPeriodDays] = useState("365");
  const [resyncStatus, setResyncStatus] = useState<Record<string, "idle" | "syncing" | "done" | "error">>({});
  const [contactsProgress, setContactsProgress] = useState<{ current: number; total: number | undefined } | null>(null);
  const [editingImapAccountId, setEditingImapAccountId] = useState<string | null>(null);
  const [editingGmailAccount, setEditingGmailAccount] = useState<{
    id: string;
    email: string;
    displayName?: string | null;
    color?: string | null;
    includeInGlobal?: boolean;
    label?: string | null;
  } | null>(null);
  const [showAddAccount, setShowAddAccount] = useState(false);

  useEffect(() => {
    getSetting("sync_period_days").then((val) => {
      if (val) setSyncPeriodDays(val);
    });
  }, []);

  const handleManualSync = useCallback(async () => {
    const activeIds = accounts.map((a) => a.id);
    if (activeIds.length === 0) return;
    setIsSyncing(true);
    try {
      await triggerSync(activeIds);
    } finally {
      setIsSyncing(false);
    }
  }, [accounts]);

  const handleForceFullSync = useCallback(async () => {
    const activeIds = accounts.map((a) => a.id);
    if (activeIds.length === 0) return;
    setIsSyncing(true);
    try {
      await forceFullSync(activeIds);
      import("@/services/ai/urgencyPipeline")
        .then(({ runExtinguishBackfill }) => runExtinguishBackfill())
        .catch(() => {});
    } finally {
      setIsSyncing(false);
    }
  }, [accounts]);

  const handleRemoveAccount = useCallback(
    async (accountId: string) => {
      removeClient(accountId);
      await deleteAccount(accountId);
      removeAccountFromStore(accountId);
    },
    [removeAccountFromStore],
  );

  const handleResyncAccount = useCallback(async (accountId: string) => {
    setResyncStatus((prev) => ({ ...prev, [accountId]: "syncing" }));
    try {
      await resyncAccount(accountId);
      import("@/services/ai/urgencyPipeline")
        .then(({ runExtinguishBackfill }) => runExtinguishBackfill())
        .catch(() => {});
      setResyncStatus((prev) => ({ ...prev, [accountId]: "done" }));
      setTimeout(() => {
        setResyncStatus((prev) => ({ ...prev, [accountId]: "idle" }));
      }, 3000);
    } catch (err) {
      console.error("Resync failed:", err);
      setResyncStatus((prev) => ({ ...prev, [accountId]: "error" }));
      setTimeout(() => {
        setResyncStatus((prev) => ({ ...prev, [accountId]: "idle" }));
      }, 3000);
    }
  }, []);

  const handleSyncGoogleContacts = useCallback(async (accountId: string) => {
    setResyncStatus((prev) => ({ ...prev, [accountId]: "syncing" }));
    setContactsProgress({ current: 0, total: undefined });
    try {
      const count = await syncGoogleContacts(accountId, (current, total) => {
        setContactsProgress({ current, total });
      });
      setResyncStatus((prev) => ({ ...prev, [accountId]: "done" }));
      setContactsProgress({ current: count, total: count });
      setTimeout(() => {
        setContactsProgress(null);
        setResyncStatus((prev) => ({ ...prev, [accountId]: "idle" }));
      }, 3000);
    } catch (err) {
      console.error("Contacts sync failed:", err);
      setResyncStatus((prev) => ({ ...prev, [accountId]: "error" }));
      setContactsProgress(null);
      setTimeout(() => {
        setResyncStatus((prev) => ({ ...prev, [accountId]: "idle" }));
      }, 3000);
    }
  }, []);

  const mailAccounts = accounts.filter((a) => a.provider !== "caldav");

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = mailAccounts.findIndex((a) => a.id === active.id);
    const newIndex = mailAccounts.findIndex((a) => a.id === over.id);
    const reordered = arrayMove(mailAccounts, oldIndex, newIndex);
    reorderAccounts(reordered.map((a) => a.id));
  };

  return (
    <>
      <Section
        title={t("settings.accounts.sections.mailAccounts")}
        action={
          <button
            onClick={() => setShowAddAccount(true)}
            className="text-xs text-accent hover:text-accent-hover transition-colors"
          >
            {t("settings.accounts.addAccount")}
          </button>
        }
      >
        {mailAccounts.length === 0 ? (
          <p className="text-sm text-text-tertiary">{t("settings.accounts.noMailAccounts")}</p>
        ) : (
          <DndContext sensors={accountSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={mailAccounts.map((a) => a.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {mailAccounts.map((account) => {
                  const providerLabel = account.provider === "imap" ? "IMAP" : "Gmail";
                  return (
                    <SortableAccountRow key={account.id} id={account.id}>
                      <div className="py-2.5 px-4 bg-bg-secondary rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium text-text-primary flex items-center gap-2">
                              {account.color && (
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: account.color }}
                                />
                              )}
                              {account.label ?? account.displayName ?? account.email}
                              <span className="text-[0.6rem] font-medium px-1.5 py-0.5 rounded-full bg-bg-tertiary text-text-tertiary">
                                {providerLabel}
                              </span>
                            </div>
                            <div className="text-xs text-text-tertiary">{account.email}</div>
                          </div>
                          <div className="flex items-center gap-3">
                            {account.provider === "imap" && (
                              <button
                                onClick={() => setEditingImapAccountId(account.id)}
                                className="text-xs text-accent hover:text-accent-hover transition-colors"
                              >
                                {t("settings.accounts.editAccount")}
                              </button>
                            )}
                            {account.provider !== "imap" && (
                              <button
                                onClick={() =>
                                  setEditingGmailAccount({
                                    id: account.id,
                                    email: account.email,
                                    displayName: account.displayName,
                                    color: account.color,
                                    includeInGlobal: account.includeInGlobal,
                                    label: account.label,
                                  })
                                }
                                className="text-xs text-accent hover:text-accent-hover transition-colors"
                              >
                                {t("settings.accounts.editAccount")}
                              </button>
                            )}
                            <button
                              onClick={() => handleResyncAccount(account.id)}
                              disabled={resyncStatus[account.id] === "syncing"}
                              className="text-xs text-accent hover:text-accent-hover transition-colors disabled:opacity-50"
                            >
                              {resyncStatus[account.id] === "syncing" && t("settings.accounts.resyncing")}
                              {resyncStatus[account.id] === "done" && t("settings.accounts.resyncDone")}
                              {resyncStatus[account.id] === "error" && t("settings.accounts.resyncFailed")}
                              {(!resyncStatus[account.id] || resyncStatus[account.id] === "idle") && t("settings.accounts.resync")}
                            </button>
                            {account.provider === "gmail_api" && (
                              <button
                                onClick={() => handleSyncGoogleContacts(account.id)}
                                disabled={resyncStatus[account.id] === "syncing"}
                                className="text-xs text-accent hover:text-accent-hover transition-colors disabled:opacity-50"
                              >
                                {resyncStatus[account.id] === "syncing"
                                  ? contactsProgress
                                    ? t("settings.accounts.syncingContactsProgress", { count: contactsProgress.current })
                                    : t("settings.accounts.syncingContacts")
                                  : t("settings.accounts.syncContacts")}
                              </button>
                            )}
                            <button
                              onClick={() => handleRemoveAccount(account.id)}
                              className="text-xs text-danger hover:text-danger/80 transition-colors"
                            >
                              {t("settings.accounts.removeAccount")}
                            </button>
                          </div>
                        </div>
                        {account.provider === "imap" && (
                          <ImapIdleFoldersEditor accountId={account.id} />
                        )}
                      </div>
                    </SortableAccountRow>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </Section>

      <SendAsAliasesSection />

      <Section title={t("settings.accounts.sections.sync")}>
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-secondary">{t("settings.accounts.checkForNewMail")}</span>
          <Button
            variant="primary"
            size="md"
            icon={<RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />}
            onClick={handleManualSync}
            disabled={isSyncing || accounts.length === 0}
          >
            {isSyncing ? t("settings.accounts.syncing") : t("settings.accounts.syncNow")}
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-text-secondary">{t("settings.accounts.fullResync")}</span>
            <p className="text-xs text-text-tertiary mt-0.5">{t("settings.accounts.fullResyncDesc")}</p>
          </div>
          <Button
            variant="secondary"
            size="md"
            icon={<RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />}
            onClick={handleForceFullSync}
            disabled={isSyncing || accounts.length === 0}
            className="bg-bg-tertiary text-text-primary border border-border-primary"
          >
            {isSyncing ? t("settings.accounts.syncing") : t("settings.accounts.fullResync")}
          </Button>
        </div>
      </Section>

      <Section title={t("settings.accounts.sections.syncPeriod")}>
        <SettingRow label={t("settings.accounts.syncEmailsFrom")}>
          <select
            value={syncPeriodDays}
            onChange={async (e) => {
              const val = e.target.value;
              setSyncPeriodDays(val);
              await setSetting("sync_period_days", val);
            }}
            className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
          >
            <option value="0">{t("settings.accounts.syncEverything")}</option>
            <option value="30">{t("settings.accounts.syncLast30")}</option>
            <option value="90">{t("settings.accounts.syncLast90")}</option>
            <option value="180">{t("settings.accounts.syncLast180")}</option>
            <option value="365">{t("settings.accounts.syncLast1Year")}</option>
          </select>
        </SettingRow>
        <p className="text-xs text-text-tertiary">{t("settings.accounts.syncChangesNote")}</p>
      </Section>

      <SyncOfflineSection />

      {showAddAccount && (
        <AddAccount onClose={() => setShowAddAccount(false)} onSuccess={() => setShowAddAccount(false)} />
      )}

      {editingImapAccountId && (
        <EditImapAccount
          accountId={editingImapAccountId}
          onClose={() => setEditingImapAccountId(null)}
          onSaved={() => setEditingImapAccountId(null)}
        />
      )}

      {editingGmailAccount && (
        <EditGmailAccount
          accountId={editingGmailAccount.id}
          email={editingGmailAccount.email}
          displayName={editingGmailAccount.displayName}
          initialColor={editingGmailAccount.color}
          initialIncludeInGlobal={editingGmailAccount.includeInGlobal}
          initialLabel={editingGmailAccount.label}
          onClose={() => setEditingGmailAccount(null)}
        />
      )}
    </>
  );
}
