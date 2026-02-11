import { useState, useEffect, useCallback, useRef } from "react";
import { useUIStore } from "@/stores/uiStore";
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
  type LucideIcon,
} from "lucide-react";
import { SignatureEditor } from "./SignatureEditor";
import { TemplateEditor } from "./TemplateEditor";
import { FilterEditor } from "./FilterEditor";
import { LabelEditor } from "./LabelEditor";
import { ContactEditor } from "./ContactEditor";
import { SHORTCUTS, getDefaultKeyMap } from "@/constants/shortcuts";
import { useShortcutStore } from "@/stores/shortcutStore";

type SettingsTab = "general" | "composing" | "labels" | "filters" | "contacts" | "accounts" | "sync" | "shortcuts" | "ai";

const tabs: { id: SettingsTab; label: string; icon: LucideIcon }[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "composing", label: "Composing", icon: PenLine },
  { id: "labels", label: "Labels", icon: Tag },
  { id: "filters", label: "Filters", icon: Filter },
  { id: "contacts", label: "Contacts", icon: Users },
  { id: "accounts", label: "Accounts", icon: UserCircle },
  { id: "sync", label: "Sync", icon: RefreshCw },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
  { id: "ai", label: "AI", icon: Sparkles },
];

export function SettingsPage() {
  const { theme, setTheme, readingPanePosition, setReadingPanePosition } = useUIStore();
  const setActiveLabel = useUIStore((s) => s.setActiveLabel);
  const { accounts, removeAccount: removeAccountFromStore } = useAccountStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [undoSendDelay, setUndoSendDelay] = useState("5");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [apiSettingsSaved, setApiSettingsSaved] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncPeriodDays, setSyncPeriodDays] = useState("365");
  const [blockRemoteImages, setBlockRemoteImages] = useState(true);
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [composeShortcut, setComposeShortcut] = useState(DEFAULT_SHORTCUT);
  const [recordingShortcut, setRecordingShortcut] = useState(false);
  const shortcutRecorderRef = useRef<HTMLButtonElement | null>(null);
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
      const syncDays = await getSetting("sync_period_days");
      setSyncPeriodDays(syncDays ?? "365");

      // Load autostart state
      try {
        const { isEnabled } = await import("@tauri-apps/plugin-autostart");
        setAutostartEnabled(await isEnabled());
      } catch {
        // autostart plugin may not be available in dev
      }

      // Load global shortcut
      const current = getCurrentShortcut();
      if (current) setComposeShortcut(current);

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

  const handleShortcutRecord = useCallback((e: React.KeyboardEvent) => {
    if (!recordingShortcut) return;
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
      setRecordingShortcut(false);
      registerComposeShortcut(shortcut).catch((err) => {
        console.error("Failed to register shortcut:", err);
      });
    }
  }, [recordingShortcut]);

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
          onClick={() => setActiveLabel("inbox")}
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
                className={`flex items-center gap-2.5 w-full px-4 py-2 text-[13px] transition-colors ${
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
                  </Section>

                  <Section title="Keyboard Shortcuts">
                    <p className="text-sm text-text-tertiary">
                      Press <kbd className="text-xs bg-bg-tertiary px-1.5 py-0.5 rounded border border-border-primary">?</kbd> anywhere to view all keyboard shortcuts.
                    </p>
                  </Section>

                  <Section title="Global Shortcut">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm text-text-secondary">
                          Quick compose
                        </span>
                        <p className="text-xs text-text-tertiary mt-0.5">
                          Open compose window from any app
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <kbd className="text-xs bg-bg-tertiary px-2 py-1 rounded border border-border-primary font-mono">
                          {composeShortcut}
                        </kbd>
                        <button
                          ref={shortcutRecorderRef}
                          onClick={() => setRecordingShortcut(true)}
                          onKeyDown={handleShortcutRecord}
                          onBlur={() => setRecordingShortcut(false)}
                          className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                            recordingShortcut
                              ? "bg-accent text-white"
                              : "bg-bg-tertiary text-text-secondary hover:text-text-primary border border-border-primary"
                          }`}
                        >
                          {recordingShortcut ? "Press keys..." : "Change"}
                        </button>
                      </div>
                    </div>
                  </Section>

                  <Section title="Privacy">
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
                  </Section>

                  <Section title="Storage">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm text-text-secondary">Attachment cache</span>
                        <p className="text-xs text-text-tertiary mt-0.5">
                          {cacheSizeMb !== null ? `${cacheSizeMb} MB used` : "Calculating..."}
                        </p>
                      </div>
                      <button
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
                        className="px-3 py-1.5 text-xs bg-bg-tertiary text-text-primary border border-border-primary rounded-md hover:bg-bg-hover transition-colors disabled:opacity-50"
                      >
                        {clearingCache ? "Clearing..." : "Clear Cache"}
                      </button>
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

                  <Section title="Google API">
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm text-text-secondary block mb-1.5">Client ID</label>
                        <input
                          type="text"
                          value={clientId}
                          onChange={(e) => setClientId(e.target.value)}
                          placeholder="Google OAuth Client ID"
                          className="w-full px-3 py-2 bg-bg-tertiary border border-border-primary rounded-md text-sm text-text-primary outline-none focus:border-accent"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-text-secondary block mb-1.5">Client Secret</label>
                        <input
                          type="password"
                          value={clientSecret}
                          onChange={(e) => setClientSecret(e.target.value)}
                          placeholder="Google OAuth Client Secret"
                          className="w-full px-3 py-2 bg-bg-tertiary border border-border-primary rounded-md text-sm text-text-primary outline-none focus:border-accent"
                        />
                      </div>
                      <button
                        onClick={handleSaveApiSettings}
                        disabled={!clientId.trim()}
                        className="px-4 py-1.5 text-sm bg-accent text-white rounded-md hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {apiSettingsSaved ? "Saved!" : "Save"}
                      </button>
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
                      <button
                        onClick={handleManualSync}
                        disabled={isSyncing || accounts.length === 0}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-accent text-white rounded-md hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
                        {isSyncing ? "Syncing..." : "Sync now"}
                      </button>
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
                      <button
                        onClick={handleForceFullSync}
                        disabled={isSyncing || accounts.length === 0}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-bg-tertiary text-text-primary border border-border-primary rounded-md hover:bg-bg-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
                        {isSyncing ? "Syncing..." : "Full resync"}
                      </button>
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
                      <div>
                        <label className="text-sm text-text-secondary block mb-1.5">
                          {aiProvider === "claude" && "Anthropic API Key"}
                          {aiProvider === "openai" && "OpenAI API Key"}
                          {aiProvider === "gemini" && "Google AI API Key"}
                        </label>
                        <input
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
                          className="w-full px-3 py-2 bg-bg-tertiary border border-border-primary rounded-md text-sm text-text-primary outline-none focus:border-accent"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
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
                          className="px-4 py-1.5 text-sm bg-accent text-white rounded-md hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {aiKeySaved ? "Saved!" : "Save Key"}
                        </button>
                        <button
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
                          className="px-4 py-1.5 text-sm bg-bg-tertiary text-text-primary border border-border-primary rounded-md hover:bg-bg-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {aiTesting ? "Testing..." : "Test Connection"}
                        </button>
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
                      description="Automatically sort new emails into categories"
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
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShortcutsTab() {
  const { keyMap, setKey, resetKey, resetAll } = useShortcutStore();
  const defaults = getDefaultKeyMap();
  const [recordingId, setRecordingId] = useState<string | null>(null);

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
