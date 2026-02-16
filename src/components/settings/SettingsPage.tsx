import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "@tanstack/react-router";
import { useUIStore } from "@/stores/uiStore";
import { navigateToLabel, navigateToSettings } from "@/router/navigate";
import { useAccountStore } from "@/stores/accountStore";
import { getSetting, setSetting, getSecureSetting, setSecureSetting } from "@/services/db/settings";
import { deleteAccount } from "@/services/db/accounts";
import { removeClient, reauthorizeAccount } from "@/services/gmail/tokenManager";
import { triggerSync, forceFullSync } from "@/services/gmail/syncManager";
import {
  registerComposeShortcut,
  getCurrentShortcut,
  DEFAULT_SHORTCUT,
} from "@/services/globalShortcut";
import {
  ArrowLeft,
  RefreshCw,
  Settings,
  PenLine,
  Tag,
  Filter,
  Users,
  UserCircle,
  Keyboard,
  Sparkles,
  MailMinus,
  Code,
  Check,
  Mail,
  FolderSearch,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { SignatureEditor } from "./SignatureEditor";
import { TemplateEditor } from "./TemplateEditor";
import { FilterEditor } from "./FilterEditor";
import { LabelEditor } from "./LabelEditor";
import { ContactEditor } from "./ContactEditor";
import { SubscriptionManager } from "./SubscriptionManager";
import { SmartFolderEditor } from "./SmartFolderEditor";
import { QuickStepEditor } from "./QuickStepEditor";
import { SHORTCUTS, getDefaultKeyMap } from "@/constants/shortcuts";
import { useShortcutStore } from "@/stores/shortcutStore";
import { COLOR_THEMES } from "@/constants/themes";
import {
  getAliasesForAccount,
  setDefaultAlias,
  mapDbAlias,
  type SendAsAlias,
} from "@/services/db/sendAsAliases";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

type SettingsTab = "general" | "composing" | "labels" | "filters" | "smart-folders" | "quickSteps" | "contacts" | "accounts" | "sync" | "shortcuts" | "ai" | "subscriptions" | "developer";

const tabs: { id: SettingsTab; label: string; icon: LucideIcon }[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "composing", label: "Composing", icon: PenLine },
  { id: "labels", label: "Labels", icon: Tag },
  { id: "filters", label: "Filters", icon: Filter },
  { id: "smart-folders", label: "Smart Folders", icon: FolderSearch },
  { id: "quickSteps", label: "Quick Steps", icon: Zap },
  { id: "contacts", label: "Contacts", icon: Users },
  { id: "subscriptions", label: "Subscriptions", icon: MailMinus },
  { id: "accounts", label: "Accounts", icon: UserCircle },
  { id: "sync", label: "Sync", icon: RefreshCw },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
  { id: "ai", label: "AI", icon: Sparkles },
  { id: "developer", label: "Developer", icon: Code },
];

export function SettingsPage() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const readingPanePosition = useUIStore((s) => s.readingPanePosition);
  const setReadingPanePosition = useUIStore((s) => s.setReadingPanePosition);
  const emailDensity = useUIStore((s) => s.emailDensity);
  const setEmailDensity = useUIStore((s) => s.setEmailDensity);
  const fontScale = useUIStore((s) => s.fontScale);
  const setFontScale = useUIStore((s) => s.setFontScale);
  const colorTheme = useUIStore((s) => s.colorTheme);
  const setColorTheme = useUIStore((s) => s.setColorTheme);
  const defaultReplyMode = useUIStore((s) => s.defaultReplyMode);
  const setDefaultReplyMode = useUIStore((s) => s.setDefaultReplyMode);
  const markAsReadBehavior = useUIStore((s) => s.markAsReadBehavior);
  const setMarkAsReadBehavior = useUIStore((s) => s.setMarkAsReadBehavior);
  const sendAndArchive = useUIStore((s) => s.sendAndArchive);
  const setSendAndArchive = useUIStore((s) => s.setSendAndArchive);
  const inboxViewMode = useUIStore((s) => s.inboxViewMode);
  const setInboxViewMode = useUIStore((s) => s.setInboxViewMode);
  const accounts = useAccountStore((s) => s.accounts);
  const removeAccountFromStore = useAccountStore((s) => s.removeAccount);
  const { tab } = useParams({ strict: false }) as { tab?: string };
  const activeTab = (tab && tabs.some((t) => t.id === tab) ? tab : "general") as SettingsTab;
  const setActiveTab = (t: SettingsTab) => navigateToSettings(t);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [undoSendDelay, setUndoSendDelay] = useState("5");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [apiSettingsSaved, setApiSettingsSaved] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncPeriodDays, setSyncPeriodDays] = useState("365");
  const [blockRemoteImages, setBlockRemoteImages] = useState(true);
  const [phishingDetectionEnabled, setPhishingDetectionEnabled] = useState(true);
  const [phishingSensitivity, setPhishingSensitivity] = useState<"low" | "default" | "high">("default");
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [aiProvider, setAiProvider] = useState<"claude" | "openai" | "gemini">("claude");
  const [claudeApiKey, setClaudeApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [aiAutoCategorize, setAiAutoCategorize] = useState(true);
  const [aiAutoSummarize, setAiAutoSummarize] = useState(true);
  const [aiKeySaved, setAiKeySaved] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<"success" | "fail" | null>(null);
  const [cacheMaxMb, setCacheMaxMb] = useState("500");
  const [cacheSizeMb, setCacheSizeMb] = useState<number | null>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [reauthStatus, setReauthStatus] = useState<Record<string, "idle" | "authorizing" | "done" | "error">>({});
  const [autoArchiveCategories, setAutoArchiveCategories] = useState<Set<string>>(() => new Set());
  const [smartNotifications, setSmartNotifications] = useState(true);
  const [notifyCategories, setNotifyCategories] = useState<Set<string>>(() => new Set(["Primary"]));
  const [vipSenders, setVipSenders] = useState<{ email_address: string; display_name: string | null }[]>([]);
  const [newVipEmail, setNewVipEmail] = useState("");

  // Load settings from DB
  useEffect(() => {
    async function load() {
      const notif = await getSetting("notifications_enabled");
      setNotificationsEnabled(notif !== "false");
      const delay = await getSetting("undo_send_delay_seconds");
      setUndoSendDelay(delay ?? "5");
      const id = await getSetting("google_client_id");
      setClientId(id ?? "");
      const secret = await getSecureSetting("google_client_secret");
      setClientSecret(secret ?? "");
      const blockImg = await getSetting("block_remote_images");
      setBlockRemoteImages(blockImg !== "false");
      const phishingEnabled = await getSetting("phishing_detection_enabled");
      setPhishingDetectionEnabled(phishingEnabled !== "false");
      const phishingSens = await getSetting("phishing_sensitivity");
      if (phishingSens === "low" || phishingSens === "high") setPhishingSensitivity(phishingSens);
      const syncDays = await getSetting("sync_period_days");
      setSyncPeriodDays(syncDays ?? "365");

      // Load autostart state
      try {
        const { isEnabled } = await import("@tauri-apps/plugin-autostart");
        setAutostartEnabled(await isEnabled());
      } catch {
        // autostart plugin may not be available in dev
      }

      // Load AI settings
      const provider = await getSetting("ai_provider");
      if (provider === "openai" || provider === "gemini") setAiProvider(provider);
      const aiKey = await getSecureSetting("claude_api_key");
      setClaudeApiKey(aiKey ?? "");
      const oaiKey = await getSecureSetting("openai_api_key");
      setOpenaiApiKey(oaiKey ?? "");
      const gemKey = await getSecureSetting("gemini_api_key");
      setGeminiApiKey(gemKey ?? "");
      const aiEn = await getSetting("ai_enabled");
      setAiEnabled(aiEn !== "false");
      const aiCat = await getSetting("ai_auto_categorize");
      setAiAutoCategorize(aiCat !== "false");
      const aiSum = await getSetting("ai_auto_summarize");
      setAiAutoSummarize(aiSum !== "false");

      // Load auto-archive categories
      const autoArchive = await getSetting("auto_archive_categories");
      if (autoArchive) {
        setAutoArchiveCategories(new Set(autoArchive.split(",").map((s) => s.trim()).filter(Boolean)));
      }

      // Load smart notification settings
      const smartNotif = await getSetting("smart_notifications");
      setSmartNotifications(smartNotif !== "false");
      const notifCats = await getSetting("notify_categories");
      if (notifCats) {
        setNotifyCategories(new Set(notifCats.split(",").map((s) => s.trim()).filter(Boolean)));
      }
      try {
        const { getAllVipSenders } = await import("@/services/db/notificationVips");
        const activeId = accounts.find((a) => a.isActive)?.id;
        if (activeId) {
          const vips = await getAllVipSenders(activeId);
          setVipSenders(vips.map((v) => ({ email_address: v.email_address, display_name: v.display_name })));
        }
      } catch {
        // VIP table may not exist yet
      }

      // Load cache settings
      const cacheMax = await getSetting("attachment_cache_max_mb");
      setCacheMaxMb(cacheMax ?? "500");
      try {
        const { getCacheSize } = await import("@/services/attachments/cacheManager");
        const size = await getCacheSize();
        setCacheSizeMb(Math.round(size / (1024 * 1024) * 10) / 10);
      } catch {
        // cache manager may not be available
      }
    }
    load();
  }, []);

  const handleNotificationsToggle = useCallback(async () => {
    const newVal = !notificationsEnabled;
    setNotificationsEnabled(newVal);
    await setSetting("notifications_enabled", newVal ? "true" : "false");
  }, [notificationsEnabled]);

  const handleUndoDelayChange = useCallback(async (value: string) => {
    setUndoSendDelay(value);
    await setSetting("undo_send_delay_seconds", value);
  }, []);

  const handleSaveApiSettings = useCallback(async () => {
    const trimmedId = clientId.trim();
    if (trimmedId) {
      await setSetting("google_client_id", trimmedId);
    }
    const trimmedSecret = clientSecret.trim();
    if (trimmedSecret) {
      await setSecureSetting("google_client_secret", trimmedSecret);
    }
    setApiSettingsSaved(true);
    setTimeout(() => setApiSettingsSaved(false), 2000);
  }, [clientId, clientSecret]);

  const handleManualSync = useCallback(async () => {
    const activeIds = accounts.filter((a) => a.isActive).map((a) => a.id);
    if (activeIds.length === 0) return;
    setIsSyncing(true);
    try {
      await triggerSync(activeIds);
    } finally {
      setIsSyncing(false);
    }
  }, [accounts]);

  const handleForceFullSync = useCallback(async () => {
    const activeIds = accounts.filter((a) => a.isActive).map((a) => a.id);
    if (activeIds.length === 0) return;
    setIsSyncing(true);
    try {
      await forceFullSync(activeIds);
    } finally {
      setIsSyncing(false);
    }
  }, [accounts]);

  const handleAutostartToggle = useCallback(async () => {
    try {
      const { enable, disable } = await import("@tauri-apps/plugin-autostart");
      if (autostartEnabled) {
        await disable();
      } else {
        await enable();
      }
      setAutostartEnabled(!autostartEnabled);
    } catch (err) {
      console.error("Failed to toggle autostart:", err);
    }
  }, [autostartEnabled]);

  const handleRemoveAccount = useCallback(
    async (accountId: string) => {
      removeClient(accountId);
      await deleteAccount(accountId);
      removeAccountFromStore(accountId);
    },
    [removeAccountFromStore],
  );

  const handleReauthorizeAccount = useCallback(
    async (accountId: string, email: string) => {
      setReauthStatus((prev) => ({ ...prev, [accountId]: "authorizing" }));
      try {
        await reauthorizeAccount(accountId, email);
        setReauthStatus((prev) => ({ ...prev, [accountId]: "done" }));
        setTimeout(() => {
          setReauthStatus((prev) => ({ ...prev, [accountId]: "idle" }));
        }, 3000);
      } catch (err) {
        console.error("Re-authorization failed:", err);
        setReauthStatus((prev) => ({ ...prev, [accountId]: "error" }));
        setTimeout(() => {
          setReauthStatus((prev) => ({ ...prev, [accountId]: "idle" }));
        }, 3000);
      }
    },
    [],
  );

  const activeTabDef = tabs.find((t) => t.id === activeTab);

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-bg-primary/50">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border-primary shrink-0 bg-bg-primary/60 backdrop-blur-sm">
        <button
          onClick={() => navigateToLabel("inbox")}
          className="p-1.5 -ml-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
          title="Back to Inbox"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-base font-semibold text-text-primary">Settings</h1>
      </div>

      {/* Body: sidebar nav + content */}
      <div className="flex flex-1 min-h-0">
        {/* Vertical tab sidebar */}
        <nav className="w-48 border-r border-border-primary py-2 overflow-y-auto shrink-0 bg-bg-primary/30">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2.5 w-full px-4 py-2 text-[0.8125rem] transition-colors ${
                  isActive
                    ? "bg-bg-selected text-accent font-medium"
                    : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                }`}
              >
                <Icon size={15} className="shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl px-8 py-6">
            {/* Tab title */}
            {activeTabDef && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-text-primary">
                  {activeTabDef.label}
                </h2>
              </div>
            )}

            <div className="space-y-8">
              {activeTab === "general" && (
                <>
                  <Section title="Appearance">
                    <SettingRow label="Theme">
                      <select
                        value={theme}
                        onChange={(e) => {
                          const val = e.target.value as "light" | "dark" | "system";
                          setTheme(val);
                          setSetting("theme", val);
                        }}
                        className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                      >
                        <option value="system">System</option>
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                      </select>
                    </SettingRow>
                    <SettingRow label="Reading pane">
                      <select
                        value={readingPanePosition}
                        onChange={(e) => {
                          setReadingPanePosition(e.target.value as "right" | "bottom" | "hidden");
                        }}
                        className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                      >
                        <option value="right">Right</option>
                        <option value="bottom">Bottom</option>
                        <option value="hidden">Off</option>
                      </select>
                    </SettingRow>
                    <SettingRow label="Email density">
                      <select
                        value={emailDensity}
                        onChange={(e) => {
                          setEmailDensity(e.target.value as "compact" | "default" | "spacious");
                        }}
                        className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                      >
                        <option value="compact">Compact</option>
                        <option value="default">Default</option>
                        <option value="spacious">Spacious</option>
                      </select>
                    </SettingRow>
                    <SettingRow label="Font size">
                      <select
                        value={fontScale}
                        onChange={(e) => {
                          setFontScale(e.target.value as "small" | "default" | "large" | "xlarge");
                        }}
                        className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                      >
                        <option value="small">Small</option>
                        <option value="default">Default</option>
                        <option value="large">Large</option>
                        <option value="xlarge">Extra Large</option>
                      </select>
                    </SettingRow>
                    <SettingRow label="Accent color">
                      <div className="flex items-center gap-2">
                        {COLOR_THEMES.map((t) => {
                          const isSelected = colorTheme === t.id;
                          return (
                            <button
                              key={t.id}
                              onClick={() => setColorTheme(t.id)}
                              title={t.name}
                              className={`relative w-7 h-7 rounded-full transition-all ${
                                isSelected
                                  ? "ring-2 ring-offset-2 ring-offset-bg-primary scale-110"
                                  : "hover:scale-105"
                              }`}
                              style={{
                                backgroundColor: t.swatch,
                                boxShadow: isSelected
                                  ? `0 0 0 2px var(--color-bg-primary), 0 0 0 4px ${t.swatch}`
                                  : undefined,
                              }}
                            >
                              {isSelected && (
                                <Check size={14} className="absolute inset-0 m-auto text-white drop-shadow-sm" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </SettingRow>
                    <SettingRow label="Inbox view mode">
                      <select
                        value={inboxViewMode}
                        onChange={(e) => {
                          setInboxViewMode(e.target.value as "unified" | "split");
                        }}
                        className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                      >
                        <option value="unified">Unified</option>
                        <option value="split">Split (Categories)</option>
                      </select>
                    </SettingRow>
                  </Section>

                  <Section title="Startup">
                    <ToggleRow
                      label="Launch at login"
                      description="Start Velo automatically when you log in (minimized to tray)"
                      checked={autostartEnabled}
                      onToggle={handleAutostartToggle}
                    />
                  </Section>

                  <Section title="Notifications">
                    <ToggleRow
                      label="Enable notifications"
                      checked={notificationsEnabled}
                      onToggle={handleNotificationsToggle}
                    />
                    <ToggleRow
                      label="Smart notifications"
                      description="Only notify for selected categories and VIP senders"
                      checked={smartNotifications}
                      onToggle={async () => {
                        const newVal = !smartNotifications;
                        setSmartNotifications(newVal);
                        await setSetting("smart_notifications", newVal ? "true" : "false");
                      }}
                    />
                    {smartNotifications && (
                      <>
                        <div>
                          <span className="text-sm text-text-secondary">Notify for categories</span>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {(["Primary", "Updates", "Promotions", "Social", "Newsletters"] as const).map((cat) => (
                              <button
                                key={cat}
                                onClick={async () => {
                                  const next = new Set(notifyCategories);
                                  if (next.has(cat)) next.delete(cat);
                                  else next.add(cat);
                                  setNotifyCategories(next);
                                  await setSetting("notify_categories", [...next].join(","));
                                }}
                                className={`px-2.5 py-1 text-xs rounded-full transition-colors border ${
                                  notifyCategories.has(cat)
                                    ? "bg-accent/15 text-accent border-accent/30"
                                    : "bg-bg-tertiary text-text-tertiary border-border-primary hover:text-text-primary"
                                }`}
                              >
                                {cat}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <span className="text-sm text-text-secondary">VIP senders</span>
                          <p className="text-xs text-text-tertiary mt-0.5 mb-2">
                            These senders always trigger notifications regardless of category
                          </p>
                          <div className="space-y-1.5">
                            {vipSenders.map((vip) => (
                              <div key={vip.email_address} className="flex items-center justify-between py-1.5 px-3 bg-bg-secondary rounded-md">
                                <span className="text-xs text-text-primary truncate">
                                  {vip.display_name ? `${vip.display_name} (${vip.email_address})` : vip.email_address}
                                </span>
                                <button
                                  onClick={async () => {
                                    const activeId = accounts.find((a) => a.isActive)?.id;
                                    if (!activeId) return;
                                    const { removeVipSender } = await import("@/services/db/notificationVips");
                                    await removeVipSender(activeId, vip.email_address);
                                    setVipSenders((prev) => prev.filter((v) => v.email_address !== vip.email_address));
                                  }}
                                  className="text-xs text-danger hover:text-danger/80 ml-2 shrink-0"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-2 mt-2">
                            <input
                              type="email"
                              value={newVipEmail}
                              onChange={(e) => setNewVipEmail(e.target.value)}
                              placeholder="email@example.com"
                              className="flex-1 px-3 py-1.5 bg-bg-tertiary border border-border-primary rounded-md text-xs text-text-primary outline-none focus:border-accent"
                              onKeyDown={async (e) => {
                                if (e.key !== "Enter" || !newVipEmail.trim()) return;
                                const activeId = accounts.find((a) => a.isActive)?.id;
                                if (!activeId) return;
                                const { addVipSender } = await import("@/services/db/notificationVips");
                                await addVipSender(activeId, newVipEmail.trim());
                                setVipSenders((prev) => [...prev, { email_address: newVipEmail.trim().toLowerCase(), display_name: null }]);
                                setNewVipEmail("");
                              }}
                            />
                            <Button
                              variant="primary"
                              onClick={async () => {
                                if (!newVipEmail.trim()) return;
                                const activeId = accounts.find((a) => a.isActive)?.id;
                                if (!activeId) return;
                                const { addVipSender } = await import("@/services/db/notificationVips");
                                await addVipSender(activeId, newVipEmail.trim());
                                setVipSenders((prev) => [...prev, { email_address: newVipEmail.trim().toLowerCase(), display_name: null }]);
                                setNewVipEmail("");
                              }}
                              disabled={!newVipEmail.trim()}
                            >
                              Add
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </Section>

                  <Section title="Privacy & Security">
                    <ToggleRow
                      label="Block remote images"
                      description="Hides tracking pixels and remote images until you choose to load them"
                      checked={blockRemoteImages}
                      onToggle={async () => {
                        const newVal = !blockRemoteImages;
                        setBlockRemoteImages(newVal);
                        await setSetting("block_remote_images", newVal ? "true" : "false");
                      }}
                    />
                    <ToggleRow
                      label="Phishing link detection"
                      description="Scan message links for phishing indicators and show warnings"
                      checked={phishingDetectionEnabled}
                      onToggle={async () => {
                        const newVal = !phishingDetectionEnabled;
                        setPhishingDetectionEnabled(newVal);
                        await setSetting("phishing_detection_enabled", newVal ? "true" : "false");
                      }}
                    />
                    {phishingDetectionEnabled && (
                      <SettingRow label="Detection sensitivity">
                        <select
                          value={phishingSensitivity}
                          onChange={async (e) => {
                            const val = e.target.value as "low" | "default" | "high";
                            setPhishingSensitivity(val);
                            await setSetting("phishing_sensitivity", val);
                          }}
                          className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                        >
                          <option value="low">Low (fewer warnings)</option>
                          <option value="default">Default</option>
                          <option value="high">High (more warnings)</option>
                        </select>
                      </SettingRow>
                    )}
                  </Section>

                  <Section title="Storage">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm text-text-secondary">Attachment cache</span>
                        <p className="text-xs text-text-tertiary mt-0.5">
                          {cacheSizeMb !== null ? `${cacheSizeMb} MB used` : "Calculating..."}
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={async () => {
                          setClearingCache(true);
                          try {
                            const { clearAllCache } = await import("@/services/attachments/cacheManager");
                            await clearAllCache();
                            setCacheSizeMb(0);
                          } catch (err) {
                            console.error("Failed to clear cache:", err);
                          } finally {
                            setClearingCache(false);
                          }
                        }}
                        disabled={clearingCache}
                        className="bg-bg-tertiary text-text-primary border border-border-primary"
                      >
                        {clearingCache ? "Clearing..." : "Clear Cache"}
                      </Button>
                    </div>
                    <SettingRow label="Max cache size">
                      <select
                        value={cacheMaxMb}
                        onChange={async (e) => {
                          const val = e.target.value;
                          setCacheMaxMb(val);
                          await setSetting("attachment_cache_max_mb", val);
                        }}
                        className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                      >
                        <option value="100">100 MB</option>
                        <option value="250">250 MB</option>
                        <option value="500">500 MB</option>
                        <option value="1000">1 GB</option>
                        <option value="2000">2 GB</option>
                      </select>
                    </SettingRow>
                  </Section>

                  <SyncOfflineSection />
                </>
              )}

              {activeTab === "composing" && (
                <>
                  <Section title="Sending">
                    <SettingRow label="Undo send delay">
                      <select
                        value={undoSendDelay}
                        onChange={(e) => handleUndoDelayChange(e.target.value)}
                        className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                      >
                        <option value="5">5 seconds</option>
                        <option value="10">10 seconds</option>
                        <option value="30">30 seconds</option>
                      </select>
                    </SettingRow>
                    <ToggleRow
                      label="Send and archive"
                      description="Automatically archive threads after sending a reply"
                      checked={sendAndArchive}
                      onToggle={() => setSendAndArchive(!sendAndArchive)}
                    />
                  </Section>

                  <Section title="Behavior">
                    <SettingRow label="Default reply action">
                      <select
                        value={defaultReplyMode}
                        onChange={(e) => {
                          setDefaultReplyMode(e.target.value as "reply" | "replyAll");
                        }}
                        className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                      >
                        <option value="reply">Reply</option>
                        <option value="replyAll">Reply All</option>
                      </select>
                    </SettingRow>
                    <SettingRow label="Mark as read">
                      <select
                        value={markAsReadBehavior}
                        onChange={(e) => {
                          setMarkAsReadBehavior(e.target.value as "instant" | "2s" | "manual");
                        }}
                        className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                      >
                        <option value="instant">Instantly</option>
                        <option value="2s">After 2 seconds</option>
                        <option value="manual">Manually</option>
                      </select>
                    </SettingRow>
                  </Section>

                  <Section title="Signatures">
                    <SignatureEditor />
                  </Section>

                  <Section title="Templates">
                    <TemplateEditor />
                  </Section>
                </>
              )}

              {activeTab === "labels" && (
                <Section title="Manage Labels">
                  <p className="text-xs text-text-tertiary mb-3">
                    Create, rename, recolor, delete, or reorder your Gmail labels.
                  </p>
                  <LabelEditor />
                </Section>
              )}

              {activeTab === "filters" && (
                <Section title="Email Filters">
                  <p className="text-xs text-text-tertiary mb-3">
                    Filters automatically apply actions to new incoming emails during sync.
                  </p>
                  <FilterEditor />
                </Section>
              )}

              {activeTab === "smart-folders" && (
                <Section title="Smart Folders">
                  <p className="text-xs text-text-tertiary mb-3">
                    Smart folders are saved searches that automatically show matching emails. Use search operators like <code className="bg-bg-tertiary px-1 rounded">is:unread</code>, <code className="bg-bg-tertiary px-1 rounded">from:</code>, <code className="bg-bg-tertiary px-1 rounded">has:attachment</code>, <code className="bg-bg-tertiary px-1 rounded">after:</code>.
                  </p>
                  <SmartFolderEditor />
                </Section>
              )}

              {activeTab === "quickSteps" && (
                <Section title="Quick Steps">
                  <p className="text-xs text-text-tertiary mb-3">
                    Quick steps let you chain multiple actions together into a single click.
                    Apply them from the right-click menu on any thread.
                  </p>
                  <QuickStepEditor />
                </Section>
              )}

              {activeTab === "contacts" && (
                <Section title="Manage Contacts">
                  <p className="text-xs text-text-tertiary mb-3">
                    Contacts are automatically added when you send or receive emails. Edit display names or remove contacts below.
                  </p>
                  <ContactEditor />
                </Section>
              )}

              {activeTab === "accounts" && (
                <>
                  <Section title="Connected Accounts">
                    {accounts.length === 0 ? (
                      <p className="text-sm text-text-tertiary">
                        No accounts connected
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {accounts.map((account) => (
                          <div
                            key={account.id}
                            className="flex items-center justify-between py-2.5 px-4 bg-bg-secondary rounded-lg"
                          >
                            <div>
                              <div className="text-sm font-medium text-text-primary">
                                {account.displayName ?? account.email}
                              </div>
                              <div className="text-xs text-text-tertiary">
                                {account.email}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => handleReauthorizeAccount(account.id, account.email)}
                                disabled={reauthStatus[account.id] === "authorizing"}
                                className="text-xs text-accent hover:text-accent-hover transition-colors disabled:opacity-50"
                              >
                                {reauthStatus[account.id] === "authorizing" && "Waiting..."}
                                {reauthStatus[account.id] === "done" && "Done!"}
                                {reauthStatus[account.id] === "error" && "Failed"}
                                {(!reauthStatus[account.id] || reauthStatus[account.id] === "idle") && "Re-authorize"}
                              </button>
                              <button
                                onClick={() => handleRemoveAccount(account.id)}
                                className="text-xs text-danger hover:text-danger/80 transition-colors"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>

                  <SendAsAliasesSection />

                  <Section title="Google API">
                    <div className="space-y-3">
                      <TextField
                        label="Client ID"
                        size="md"
                        type="text"
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                        placeholder="Google OAuth Client ID"
                      />
                      <TextField
                        label="Client Secret"
                        size="md"
                        type="password"
                        value={clientSecret}
                        onChange={(e) => setClientSecret(e.target.value)}
                        placeholder="Google OAuth Client Secret"
                      />
                      <Button
                        variant="primary"
                        size="md"
                        onClick={handleSaveApiSettings}
                        disabled={!clientId.trim()}
                      >
                        {apiSettingsSaved ? "Saved!" : "Save"}
                      </Button>
                    </div>
                  </Section>
                </>
              )}

              {activeTab === "sync" && (
                <>
                  <Section title="Sync">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-text-secondary">
                        Check for new mail
                      </span>
                      <Button
                        variant="primary"
                        size="md"
                        icon={<RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />}
                        onClick={handleManualSync}
                        disabled={isSyncing || accounts.length === 0}
                      >
                        {isSyncing ? "Syncing..." : "Sync now"}
                      </Button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm text-text-secondary">
                          Full resync
                        </span>
                        <p className="text-xs text-text-tertiary mt-0.5">
                          Re-download all emails from scratch
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        size="md"
                        icon={<RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />}
                        onClick={handleForceFullSync}
                        disabled={isSyncing || accounts.length === 0}
                        className="bg-bg-tertiary text-text-primary border border-border-primary"
                      >
                        {isSyncing ? "Syncing..." : "Full resync"}
                      </Button>
                    </div>
                  </Section>

                  <Section title="Sync Period">
                    <SettingRow label="Sync emails from">
                      <select
                        value={syncPeriodDays}
                        onChange={async (e) => {
                          const val = e.target.value;
                          setSyncPeriodDays(val);
                          await setSetting("sync_period_days", val);
                        }}
                        className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                      >
                        <option value="30">Last 30 days</option>
                        <option value="90">Last 90 days</option>
                        <option value="180">Last 180 days</option>
                        <option value="365">Last 1 year</option>
                      </select>
                    </SettingRow>
                    <p className="text-xs text-text-tertiary">
                      Changes apply on the next full resync.
                    </p>
                  </Section>
                </>
              )}

              {activeTab === "shortcuts" && (
                <ShortcutsTab />
              )}

              {activeTab === "ai" && (
                <>
                  <Section title="Provider">
                    <p className="text-xs text-text-tertiary mb-3">
                      Choose which AI provider to use for summarization, compose assistance, and smart categorization.
                    </p>
                    <SettingRow label="AI Provider">
                      <select
                        value={aiProvider}
                        onChange={async (e) => {
                          const val = e.target.value as "claude" | "openai" | "gemini";
                          setAiProvider(val);
                          setAiTestResult(null);
                          await setSetting("ai_provider", val);
                          const { clearProviderClients } = await import("@/services/ai/providerManager");
                          clearProviderClients();
                        }}
                        className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
                      >
                        <option value="claude">Claude (Anthropic)</option>
                        <option value="openai">OpenAI</option>
                        <option value="gemini">Gemini (Google)</option>
                      </select>
                    </SettingRow>
                    <p className="text-xs text-text-tertiary">
                      {aiProvider === "claude" && "Uses Claude Haiku — fast and affordable."}
                      {aiProvider === "openai" && "Uses GPT-4o Mini — fast and affordable."}
                      {aiProvider === "gemini" && "Uses Gemini 2.0 Flash — fast and affordable."}
                    </p>
                  </Section>

                  <Section title="API Key">
                    <div className="space-y-3">
                      <TextField
                        label={
                          aiProvider === "claude" ? "Anthropic API Key"
                          : aiProvider === "openai" ? "OpenAI API Key"
                          : "Google AI API Key"
                        }
                        size="md"
                        type="password"
                        value={
                          aiProvider === "claude" ? claudeApiKey
                          : aiProvider === "openai" ? openaiApiKey
                          : geminiApiKey
                        }
                        onChange={(e) => {
                          if (aiProvider === "claude") setClaudeApiKey(e.target.value);
                          else if (aiProvider === "openai") setOpenaiApiKey(e.target.value);
                          else setGeminiApiKey(e.target.value);
                        }}
                        placeholder={
                          aiProvider === "claude" ? "sk-ant-..."
                          : aiProvider === "openai" ? "sk-..."
                          : "AI..."
                        }
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          variant="primary"
                          size="md"
                          onClick={async () => {
                            const keySettingMap = {
                              claude: "claude_api_key",
                              openai: "openai_api_key",
                              gemini: "gemini_api_key",
                            } as const;
                            const keyValue =
                              aiProvider === "claude" ? claudeApiKey.trim()
                              : aiProvider === "openai" ? openaiApiKey.trim()
                              : geminiApiKey.trim();
                            if (keyValue) {
                              await setSecureSetting(keySettingMap[aiProvider], keyValue);
                              const { clearProviderClients } = await import("@/services/ai/providerManager");
                              clearProviderClients();
                            }
                            setAiKeySaved(true);
                            setTimeout(() => setAiKeySaved(false), 2000);
                          }}
                          disabled={
                            !(aiProvider === "claude" ? claudeApiKey.trim()
                            : aiProvider === "openai" ? openaiApiKey.trim()
                            : geminiApiKey.trim())
                          }
                        >
                          {aiKeySaved ? "Saved!" : "Save Key"}
                        </Button>
                        <Button
                          variant="secondary"
                          size="md"
                          onClick={async () => {
                            setAiTesting(true);
                            setAiTestResult(null);
                            try {
                              const { testConnection } = await import("@/services/ai/aiService");
                              const ok = await testConnection();
                              setAiTestResult(ok ? "success" : "fail");
                            } catch {
                              setAiTestResult("fail");
                            } finally {
                              setAiTesting(false);
                            }
                          }}
                          disabled={
                            !(aiProvider === "claude" ? claudeApiKey.trim()
                            : aiProvider === "openai" ? openaiApiKey.trim()
                            : geminiApiKey.trim()) || aiTesting
                          }
                          className="bg-bg-tertiary text-text-primary border border-border-primary"
                        >
                          {aiTesting ? "Testing..." : "Test Connection"}
                        </Button>
                        {aiTestResult === "success" && (
                          <span className="text-xs text-success">Connected!</span>
                        )}
                        {aiTestResult === "fail" && (
                          <span className="text-xs text-danger">Connection failed</span>
                        )}
                      </div>
                    </div>
                  </Section>

                  <Section title="Features">
                    <ToggleRow
                      label="Enable AI features"
                      description="Master toggle for all AI functionality"
                      checked={aiEnabled}
                      onToggle={async () => {
                        const newVal = !aiEnabled;
                        setAiEnabled(newVal);
                        await setSetting("ai_enabled", newVal ? "true" : "false");
                      }}
                    />
                    <ToggleRow
                      label="Auto-categorize inbox"
                      description="Use AI to refine rule-based categorization"
                      checked={aiAutoCategorize}
                      onToggle={async () => {
                        const newVal = !aiAutoCategorize;
                        setAiAutoCategorize(newVal);
                        await setSetting("ai_auto_categorize", newVal ? "true" : "false");
                      }}
                    />
                    <ToggleRow
                      label="Auto-summarize threads"
                      description="Show AI summaries on multi-message threads"
                      checked={aiAutoSummarize}
                      onToggle={async () => {
                        const newVal = !aiAutoSummarize;
                        setAiAutoSummarize(newVal);
                        await setSetting("ai_auto_summarize", newVal ? "true" : "false");
                      }}
                    />
                  </Section>

                  <Section title="Categories">
                    <p className="text-xs text-text-tertiary mb-1">
                      Incoming emails are automatically sorted using rule-based heuristics (Gmail labels, sender domain, headers). When AI is enabled, it refines results for better accuracy.
                    </p>
                    <p className="text-xs text-text-tertiary mb-3">
                      Enable auto-archive to skip the inbox for specific categories.
                    </p>
                    {(["Updates", "Promotions", "Social", "Newsletters"] as const).map((cat) => (
                      <ToggleRow
                        key={cat}
                        label={`Auto-archive ${cat}`}
                        description={`Skip inbox for ${cat.toLowerCase()} emails`}
                        checked={autoArchiveCategories.has(cat)}
                        onToggle={async () => {
                          const next = new Set(autoArchiveCategories);
                          if (next.has(cat)) next.delete(cat);
                          else next.add(cat);
                          setAutoArchiveCategories(next);
                          await setSetting("auto_archive_categories", [...next].join(","));
                        }}
                      />
                    ))}
                  </Section>

                  <Section title="Bundling & Delivery Schedules">
                    <p className="text-xs text-text-tertiary mb-3">
                      Collapse categories into a single row in the inbox. Optionally set a delivery schedule to batch emails.
                    </p>
                    <BundleSettings />
                  </Section>
                </>
              )}

              {activeTab === "subscriptions" && (
                <Section title="Manage Subscriptions">
                  <p className="text-xs text-text-tertiary mb-3">
                    View all detected newsletter and promotional senders. Unsubscribe using RFC 8058 one-click POST, mailto, or browser fallback.
                  </p>
                  <SubscriptionManager />
                </Section>
              )}

              {activeTab === "developer" && (
                <DeveloperTab />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SendAsAliasesSection() {
  const accounts = useAccountStore((s) => s.accounts);
  const [aliases, setAliases] = useState<SendAsAlias[]>([]);

  useEffect(() => {
    const activeAccount = accounts.find((a) => a.isActive);
    if (!activeAccount) return;
    let cancelled = false;
    getAliasesForAccount(activeAccount.id).then((dbAliases) => {
      if (cancelled) return;
      setAliases(dbAliases.map(mapDbAlias));
    });
    return () => { cancelled = true; };
  }, [accounts]);

  const activeAccount = accounts.find((a) => a.isActive);

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
    <Section title="Send-As Aliases">
      <p className="text-xs text-text-tertiary mb-3">
        These aliases are synced from your Gmail settings. You can select which alias to use as the default sender.
      </p>
      {aliases.length === 0 ? (
        <p className="text-sm text-text-tertiary">
          No aliases found. Aliases are fetched from Gmail on startup.
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
                        Primary
                      </span>
                    )}
                    {alias.isDefault && (
                      <span className="text-[0.625rem] bg-success/15 text-success px-1.5 py-0.5 rounded-full">
                        Default
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
                  Set as default
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
    <Section title="Sync & Offline">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-text-secondary">Pending operations</span>
            <p className="text-xs text-text-tertiary mt-0.5">
              Changes waiting to sync to the server
            </p>
          </div>
          <span className="text-sm font-mono text-text-primary">{pendingCount}</span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-text-secondary">Failed operations</span>
            <p className="text-xs text-text-tertiary mt-0.5">
              Changes that could not be synced after multiple retries
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
                  Retry
                </button>
                <button
                  onClick={handleClearFailed}
                  disabled={loading}
                  className="text-xs text-danger hover:opacity-80 transition-colors disabled:opacity-50"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}

function DeveloperTab() {
  const [appVersion, setAppVersion] = useState("");
  const [tauriVersion, setTauriVersion] = useState("");
  const [webviewVersion, setWebviewVersion] = useState("");

  useEffect(() => {
    async function load() {
      const { getVersion, getTauriVersion } = await import("@tauri-apps/api/app");
      setAppVersion(await getVersion());
      setTauriVersion(await getTauriVersion());

      // Extract WebView version from user agent
      const ua = navigator.userAgent;
      const edgMatch = /Edg\/(\S+)/.exec(ua);
      const chromeMatch = /Chrome\/(\S+)/.exec(ua);
      const webkitMatch = /AppleWebKit\/(\S+)/.exec(ua);
      setWebviewVersion(edgMatch?.[1] ?? chromeMatch?.[1] ?? webkitMatch?.[1] ?? "Unknown");
    }
    load();
  }, []);

  return (
    <>
      <Section title="App Info">
        <InfoRow label="App version" value={appVersion || "..."} />
        <InfoRow label="Tauri version" value={tauriVersion || "..."} />
        <InfoRow label="WebView version" value={webviewVersion || "..."} />
        <InfoRow label="Platform" value={navigator.platform} />
      </Section>

      <Section title="Developer Tools">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-text-secondary">Open DevTools</span>
            <p className="text-xs text-text-tertiary mt-0.5">
              Open the WebView developer tools inspector
            </p>
          </div>
          <Button
            variant="secondary"
            size="md"
            onClick={async () => {
              const { invoke } = await import("@tauri-apps/api/core");
              await invoke("open_devtools");
            }}
            className="bg-bg-tertiary text-text-primary border border-border-primary"
          >
            Open DevTools
          </Button>
        </div>
      </Section>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="text-sm text-text-primary font-mono">{value}</span>
    </div>
  );
}

function ShortcutsTab() {
  const keyMap = useShortcutStore((s) => s.keyMap);
  const setKey = useShortcutStore((s) => s.setKey);
  const resetKey = useShortcutStore((s) => s.resetKey);
  const resetAll = useShortcutStore((s) => s.resetAll);
  const defaults = getDefaultKeyMap();
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [composeShortcut, setComposeShortcut] = useState(DEFAULT_SHORTCUT);
  const [recordingGlobal, setRecordingGlobal] = useState(false);
  const globalRecorderRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const current = getCurrentShortcut();
    if (current) setComposeShortcut(current);
  }, []);

  const handleGlobalRecord = useCallback((e: React.KeyboardEvent) => {
    if (!recordingGlobal) return;
    e.preventDefault();
    e.stopPropagation();

    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push("CmdOrCtrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");

    const key = e.key;
    if (key !== "Control" && key !== "Meta" && key !== "Shift" && key !== "Alt") {
      parts.push(key.length === 1 ? key.toUpperCase() : key);
      const shortcut = parts.join("+");
      setComposeShortcut(shortcut);
      setRecordingGlobal(false);
      registerComposeShortcut(shortcut).catch((err) => {
        console.error("Failed to register shortcut:", err);
      });
    }
  }, [recordingGlobal]);

  const handleKeyRecord = useCallback((e: React.KeyboardEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();

    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");

    const key = e.key;
    if (key === "Control" || key === "Meta" || key === "Shift" || key === "Alt") return;

    if (parts.length > 0) {
      parts.push(key.length === 1 ? key.toUpperCase() : key);
    } else {
      parts.push(key);
    }

    setKey(id, parts.join("+"));
    setRecordingId(null);
  }, [setKey]);

  const hasCustom = Object.entries(keyMap).some(([id, keys]) => defaults[id] !== keys);

  return (
    <>
      <Section title="Global Shortcut">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-text-secondary">Quick compose</span>
            <p className="text-xs text-text-tertiary mt-0.5">
              Open compose window from any app
            </p>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="text-xs bg-bg-tertiary px-2 py-1 rounded border border-border-primary font-mono">
              {composeShortcut}
            </kbd>
            <button
              ref={globalRecorderRef}
              onClick={() => setRecordingGlobal(true)}
              onKeyDown={handleGlobalRecord}
              onBlur={() => setRecordingGlobal(false)}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                recordingGlobal
                  ? "bg-accent text-white"
                  : "bg-bg-tertiary text-text-secondary hover:text-text-primary border border-border-primary"
              }`}
            >
              {recordingGlobal ? "Press keys..." : "Change"}
            </button>
          </div>
        </div>
      </Section>

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-text-tertiary">
          Click a shortcut to rebind it. Press any key or key combination to set.
        </p>
        {hasCustom && (
          <button
            onClick={resetAll}
            className="text-xs text-accent hover:text-accent-hover transition-colors shrink-0 ml-4"
          >
            Reset all
          </button>
        )}
      </div>
      {SHORTCUTS.map((section) => (
        <Section key={section.category} title={section.category}>
          <div className="space-y-1">
            {section.items.map((item) => {
              const currentKey = keyMap[item.id] ?? item.keys;
              const isDefault = currentKey === defaults[item.id];
              const isRecording = recordingId === item.id;

              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-2 px-1"
                >
                  <span className="text-sm text-text-secondary">
                    {item.desc}
                  </span>
                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    <button
                      onClick={() => setRecordingId(isRecording ? null : item.id)}
                      onKeyDown={(e) => {
                        if (isRecording) handleKeyRecord(e, item.id);
                      }}
                      onBlur={() => { if (isRecording) setRecordingId(null); }}
                      className={`text-xs px-2.5 py-1 rounded-md font-mono transition-colors ${
                        isRecording
                          ? "bg-accent text-white"
                          : "bg-bg-tertiary text-text-tertiary hover:text-text-primary border border-border-primary"
                      }`}
                    >
                      {isRecording ? "Press key..." : currentKey}
                    </button>
                    {!isDefault && (
                      <button
                        onClick={() => resetKey(item.id)}
                        className="text-xs text-text-tertiary hover:text-text-primary"
                        title={`Reset to ${defaults[item.id]}`}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      ))}
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-3">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function SettingRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-text-secondary">{label}</label>
      {children}
    </div>
  );
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function BundleSettings() {
  const accounts = useAccountStore((s) => s.accounts);
  const activeAccountId = accounts.find((a) => a.isActive)?.id;
  const [rules, setRules] = useState<Record<string, { bundled: boolean; delivery: boolean; days: number[]; hour: number; minute: number }>>({});

  useEffect(() => {
    if (!activeAccountId) return;
    import("@/services/db/bundleRules").then(async ({ getBundleRules }) => {
      const dbRules = await getBundleRules(activeAccountId);
      const map: typeof rules = {};
      for (const r of dbRules) {
        let schedule = { days: [6], hour: 9, minute: 0 };
        try {
          if (r.delivery_schedule) schedule = JSON.parse(r.delivery_schedule);
        } catch { /* use defaults */ }
        map[r.category] = {
          bundled: r.is_bundled === 1,
          delivery: r.delivery_enabled === 1,
          days: schedule.days,
          hour: schedule.hour,
          minute: schedule.minute,
        };
      }
      setRules(map);
    });
  }, [activeAccountId]);

  const saveRule = async (category: string, update: Partial<typeof rules[string]>) => {
    if (!activeAccountId) return;
    const current = rules[category] ?? { bundled: false, delivery: false, days: [6], hour: 9, minute: 0 };
    const merged = { ...current, ...update };
    setRules((prev) => ({ ...prev, [category]: merged }));
    const { setBundleRule } = await import("@/services/db/bundleRules");
    await setBundleRule(
      activeAccountId,
      category,
      merged.bundled,
      merged.delivery,
      merged.delivery ? { days: merged.days, hour: merged.hour, minute: merged.minute } : null,
    );
  };

  return (
    <div className="space-y-4">
      {(["Newsletters", "Promotions", "Social", "Updates"] as const).map((cat) => {
        const rule = rules[cat];
        return (
          <div key={cat} className="py-3 px-4 bg-bg-secondary rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-primary">{cat}</span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={rule?.bundled ?? false}
                    onChange={() => saveRule(cat, { bundled: !(rule?.bundled ?? false) })}
                    className="accent-accent"
                  />
                  Bundle
                </label>
                <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={rule?.delivery ?? false}
                    onChange={() => saveRule(cat, { delivery: !(rule?.delivery ?? false) })}
                    className="accent-accent"
                  />
                  Schedule
                </label>
              </div>
            </div>
            {rule?.delivery && (
              <div className="space-y-2 pt-1">
                <div className="flex gap-1">
                  {DAY_NAMES.map((name, idx) => (
                    <button
                      key={name}
                      onClick={() => {
                        const days = rule.days.includes(idx)
                          ? rule.days.filter((d) => d !== idx)
                          : [...rule.days, idx].sort();
                        saveRule(cat, { days });
                      }}
                      className={`w-8 h-7 text-[0.625rem] rounded transition-colors ${
                        rule.days.includes(idx)
                          ? "bg-accent text-white"
                          : "bg-bg-tertiary text-text-tertiary border border-border-primary"
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-tertiary">at</span>
                  <input
                    type="time"
                    value={`${String(rule.hour).padStart(2, "0")}:${String(rule.minute).padStart(2, "0")}`}
                    onChange={(e) => {
                      const [h, m] = e.target.value.split(":").map(Number);
                      saveRule(cat, { hour: h ?? 9, minute: m ?? 0 });
                    }}
                    className="bg-bg-tertiary text-text-primary text-xs px-2 py-1 rounded border border-border-primary"
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onToggle,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="text-sm text-text-secondary">{label}</span>
        {description && (
          <p className="text-xs text-text-tertiary mt-0.5">{description}</p>
        )}
      </div>
      <button
        onClick={onToggle}
        className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ml-4 ${
          checked ? "bg-accent" : "bg-bg-tertiary"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}
