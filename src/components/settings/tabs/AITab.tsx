import { useState, useEffect } from "react";
import { t } from "@/i18n";
import { useAccountStore } from "@/stores/accountStore";
import { getSetting, setSetting, getSecureSetting, setSecureSetting } from "@/services/db/settings";
import { PROVIDER_MODELS } from "@/services/ai/types";
import { Section, SettingRow, ToggleRow } from "./shared";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { SoulEditorDialog } from "@/components/settings/SoulEditorDialog";


function BundleSettings() {
  const accounts = useAccountStore((s) => s.accounts);
  const storedActiveId = useAccountStore((s) => s.activeAccountId);
  const activeAccountId = storedActiveId ?? accounts[0]?.id;
  const [rules, setRules] = useState<
    Record<string, { bundled: boolean; delivery: boolean; days: number[]; hour: number; minute: number }>
  >({});

  useEffect(() => {
    if (!activeAccountId) return;
    import("@/services/db/bundleRules").then(async ({ getBundleRules }) => {
      const dbRules = await getBundleRules(activeAccountId);
      const map: typeof rules = {};
      for (const r of dbRules) {
        let schedule = { days: [6], hour: 9, minute: 0 };
        try {
          if (r.delivery_schedule) schedule = JSON.parse(r.delivery_schedule);
        } catch {
          /* use defaults */
        }
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

  const saveRule = async (category: string, update: Partial<(typeof rules)[string]>) => {
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

  const dayNames = [
    t("settings.ai.days.sun"), t("settings.ai.days.mon"), t("settings.ai.days.tue"),
    t("settings.ai.days.wed"), t("settings.ai.days.thu"), t("settings.ai.days.fri"),
    t("settings.ai.days.sat"),
  ];

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
                  {t("settings.ai.bundle")}
                </label>
                <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={rule?.delivery ?? false}
                    onChange={() => saveRule(cat, { delivery: !(rule?.delivery ?? false) })}
                    className="accent-accent"
                  />
                  {t("settings.ai.schedule")}
                </label>
              </div>
            </div>
            {rule?.delivery && (
              <div className="space-y-2 pt-1">
                <div className="flex gap-1">
                  {dayNames.map((name, idx) => (
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
                  <span className="text-xs text-text-tertiary">{t("settings.ai.at")}</span>
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

export function AITab() {
  const accounts = useAccountStore((s) => s.accounts);
  const storedActiveId = useAccountStore((s) => s.activeAccountId);
  const activeAccountId = storedActiveId ?? accounts[0]?.id;

  const [aiProvider, setAiProvider] = useState<"claude" | "openai" | "gemini" | "ollama" | "copilot">("claude");
  const [claudeApiKey, setClaudeApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [copilotApiKey, setCopilotApiKey] = useState("");
  const [ollamaServerUrl, setOllamaServerUrl] = useState("http://localhost:11434");
  const [ollamaModel, setOllamaModel] = useState("llama3.2");
  const [claudeModel, setClaudeModel] = useState("claude-haiku-4-5-20251001");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o-mini");
  const [geminiModel, setGeminiModel] = useState("gemini-2.5-flash-preview-05-20");
  const [copilotModel, setCopilotModel] = useState("openai/gpt-4o-mini");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [aiAutoCategorize, setAiAutoCategorize] = useState(true);
  const [aiAutoSummarize, setAiAutoSummarize] = useState(true);
  const [aiKeySaved, setAiKeySaved] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<"success" | "fail" | null>(null);
  const [aiAutoDraftEnabled, setAiAutoDraftEnabled] = useState(true);
  const [aiWritingStyleEnabled, setAiWritingStyleEnabled] = useState(true);
  const [styleAnalyzing, setStyleAnalyzing] = useState(false);
  const [styleAnalyzeDone, setStyleAnalyzeDone] = useState(false);
  const [aiLanguage, setAiLanguage] = useState("English");
  const [soulEditorOpen, setSoulEditorOpen] = useState(false);
  const [autoArchiveCategories, setAutoArchiveCategories] = useState<Set<string>>(() => new Set());
  const [behaviorEnabled, setBehaviorEnabled] = useState(true);
  const [urgencyEnabled, setUrgencyEnabled] = useState(true);
  const [urgencyMuteWindow, setUrgencyMuteWindow] = useState("30");
  const [urgencyMuteThreshold, setUrgencyMuteThreshold] = useState("3");
  const [urgencyAutoExtinguish, setUrgencyAutoExtinguish] = useState(true);

  useEffect(() => {
    async function load() {
      const provider = await getSetting("ai_provider");
      if (provider === "openai" || provider === "gemini" || provider === "ollama" || provider === "copilot")
        setAiProvider(provider);
      const ollamaUrl = await getSetting("ollama_server_url");
      if (ollamaUrl) setOllamaServerUrl(ollamaUrl);
      const ollamaModelVal = await getSetting("ollama_model");
      if (ollamaModelVal) setOllamaModel(ollamaModelVal);
      const claudeModelVal = await getSetting("claude_model");
      if (claudeModelVal) setClaudeModel(claudeModelVal);
      const openaiModelVal = await getSetting("openai_model");
      if (openaiModelVal) setOpenaiModel(openaiModelVal);
      const geminiModelVal = await getSetting("gemini_model");
      if (geminiModelVal) setGeminiModel(geminiModelVal);
      const copilotModelVal = await getSetting("copilot_model");
      if (copilotModelVal) setCopilotModel(copilotModelVal);
      const aiKey = await getSecureSetting("claude_api_key");
      setClaudeApiKey(aiKey ?? "");
      const oaiKey = await getSecureSetting("openai_api_key");
      setOpenaiApiKey(oaiKey ?? "");
      const gemKey = await getSecureSetting("gemini_api_key");
      setGeminiApiKey(gemKey ?? "");
      const copKey = await getSecureSetting("copilot_api_key");
      setCopilotApiKey(copKey ?? "");
      const aiEn = await getSetting("ai_enabled");
      setAiEnabled(aiEn !== "false");
      const aiCat = await getSetting("ai_auto_categorize");
      setAiAutoCategorize(aiCat !== "false");
      const aiSum = await getSetting("ai_auto_summarize");
      setAiAutoSummarize(aiSum !== "false");
      const aiDraft = await getSetting("ai_auto_draft_enabled");
      setAiAutoDraftEnabled(aiDraft !== "false");
      const aiStyle = await getSetting("ai_writing_style_enabled");
      setAiWritingStyleEnabled(aiStyle !== "false");
      const lang = await getSetting("ai_language");
      if (lang) setAiLanguage(lang);
      const autoArchive = await getSetting("auto_archive_categories");
      if (autoArchive) {
        setAutoArchiveCategories(
          new Set(autoArchive.split(",").map((s) => s.trim()).filter(Boolean)),
        );
      }
      const behaviorEnabledSetting = await getSetting("ai_behavior_enabled");
      setBehaviorEnabled(behaviorEnabledSetting !== "false");
      const urgencyEnabledSetting = await getSetting("ai_urgency_enabled");
      setUrgencyEnabled(urgencyEnabledSetting !== "false");
      const muteWindow = await getSetting("ai_urgency_mute_window_days");
      if (muteWindow) setUrgencyMuteWindow(muteWindow);
      const muteThreshold = await getSetting("ai_urgency_mute_threshold");
      if (muteThreshold) setUrgencyMuteThreshold(muteThreshold);
      const autoExtinguish = await getSetting("ai_urgency_auto_extinguish");
      setUrgencyAutoExtinguish(autoExtinguish !== "false");
    }
    load();
  }, []);

  const currentApiKey =
    aiProvider === "claude"
      ? claudeApiKey
      : aiProvider === "openai"
        ? openaiApiKey
        : aiProvider === "copilot"
          ? copilotApiKey
          : geminiApiKey;

  const handleTestConnection = async () => {
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
  };

  return (
    <>
      <Section title={t("settings.ai.sections.provider")}>
        <p className="text-xs text-text-tertiary mb-3">
          {t("settings.ai.providerDesc")}
        </p>
        <SettingRow label={t("settings.ai.aiProvider")}>
          <select
            value={aiProvider}
            onChange={async (e) => {
              const val = e.target.value as typeof aiProvider;
              setAiProvider(val);
              setAiTestResult(null);
              await setSetting("ai_provider", val);
              const { clearProviderClients } = await import("@/services/ai/providerManager");
              clearProviderClients();
            }}
            className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
          >
            <option value="claude">{t("settings.ai.providerClaude")}</option>
            <option value="openai">{t("settings.ai.providerOpenAI")}</option>
            <option value="gemini">{t("settings.ai.providerGemini")}</option>
            <option value="ollama">{t("settings.ai.providerOllama")}</option>
            <option value="copilot">{t("settings.ai.providerCopilot")}</option>
          </select>
        </SettingRow>
        <p className="text-xs text-text-tertiary">
          {aiProvider === "claude" &&
            t("settings.ai.usesModel", { model: PROVIDER_MODELS.claude.find((m) => m.id === claudeModel)?.label ?? claudeModel })}
          {aiProvider === "openai" &&
            t("settings.ai.usesModel", { model: PROVIDER_MODELS.openai.find((m) => m.id === openaiModel)?.label ?? openaiModel })}
          {aiProvider === "gemini" &&
            t("settings.ai.usesModel", { model: PROVIDER_MODELS.gemini.find((m) => m.id === geminiModel)?.label ?? geminiModel })}
          {aiProvider === "ollama" && t("settings.ai.ollamaNoKey")}
          {aiProvider === "copilot" &&
            t("settings.ai.copilotDesc", { model: PROVIDER_MODELS.copilot.find((m) => m.id === copilotModel)?.label ?? copilotModel })}
        </p>
      </Section>

      {aiProvider === "ollama" ? (
        <Section title={t("settings.ai.sections.localServer")}>
          <div className="space-y-3">
            <TextField
              label={t("settings.ai.serverUrl")}
              size="md"
              value={ollamaServerUrl}
              onChange={(e) => setOllamaServerUrl(e.target.value)}
              placeholder="http://localhost:11434"
            />
            <TextField
              label={t("settings.ai.modelName")}
              size="md"
              value={ollamaModel}
              onChange={(e) => setOllamaModel(e.target.value)}
              placeholder="llama3.2"
            />
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="md"
                onClick={async () => {
                  await setSetting("ollama_server_url", ollamaServerUrl.trim());
                  await setSetting("ollama_model", ollamaModel.trim());
                  const { clearProviderClients } = await import("@/services/ai/providerManager");
                  clearProviderClients();
                  setAiKeySaved(true);
                  setTimeout(() => setAiKeySaved(false), 2000);
                }}
                disabled={!ollamaServerUrl.trim() || !ollamaModel.trim()}
              >
                {aiKeySaved ? t("settings.ai.saved") : t("settings.ai.save")}
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={handleTestConnection}
                disabled={!ollamaServerUrl.trim() || !ollamaModel.trim() || aiTesting}
                className="bg-bg-tertiary text-text-primary border border-border-primary"
              >
                {aiTesting ? t("settings.ai.testing") : t("settings.ai.testConnection")}
              </Button>
              {aiTestResult === "success" && <span className="text-xs text-success">{t("settings.ai.connected")}</span>}
              {aiTestResult === "fail" && <span className="text-xs text-danger">{t("settings.ai.connectionFailed")}</span>}
            </div>
          </div>
        </Section>
      ) : (
        <Section title={t("settings.ai.sections.apiKey")}>
          <div className="space-y-3">
            <TextField
              label={
                aiProvider === "claude"
                  ? t("settings.ai.apiKeyClaude")
                  : aiProvider === "openai"
                    ? t("settings.ai.apiKeyOpenAI")
                    : aiProvider === "copilot"
                      ? t("settings.ai.apiKeyCopilot")
                      : t("settings.ai.apiKeyGemini")
              }
              size="md"
              type="password"
              value={currentApiKey}
              onChange={(e) => {
                if (aiProvider === "claude") setClaudeApiKey(e.target.value);
                else if (aiProvider === "openai") setOpenaiApiKey(e.target.value);
                else if (aiProvider === "copilot") setCopilotApiKey(e.target.value);
                else setGeminiApiKey(e.target.value);
              }}
              placeholder={
                aiProvider === "claude"
                  ? "sk-ant-..."
                  : aiProvider === "openai"
                    ? "sk-..."
                    : aiProvider === "copilot"
                      ? "ghp_..."
                      : "AI..."
              }
            />
            <SettingRow label={t("settings.ai.model")}>
              <select
                value={
                  aiProvider === "claude"
                    ? claudeModel
                    : aiProvider === "openai"
                      ? openaiModel
                      : aiProvider === "copilot"
                        ? copilotModel
                        : geminiModel
                }
                onChange={async (e) => {
                  const val = e.target.value;
                  const modelSettingMap = {
                    claude: "claude_model",
                    openai: "openai_model",
                    gemini: "gemini_model",
                    copilot: "copilot_model",
                  } as const;
                  if (aiProvider === "claude") setClaudeModel(val);
                  else if (aiProvider === "openai") setOpenaiModel(val);
                  else if (aiProvider === "copilot") setCopilotModel(val);
                  else setGeminiModel(val);
                  await setSetting(modelSettingMap[aiProvider], val);
                  const { clearProviderClients } = await import("@/services/ai/providerManager");
                  clearProviderClients();
                }}
                className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
              >
                {PROVIDER_MODELS[aiProvider].map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </SettingRow>
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="md"
                onClick={async () => {
                  const keySettingMap = {
                    claude: "claude_api_key",
                    openai: "openai_api_key",
                    gemini: "gemini_api_key",
                    copilot: "copilot_api_key",
                  } as const;
                  if (currentApiKey.trim()) {
                    await setSecureSetting(keySettingMap[aiProvider], currentApiKey.trim());
                    const { clearProviderClients } = await import("@/services/ai/providerManager");
                    clearProviderClients();
                  }
                  setAiKeySaved(true);
                  setTimeout(() => setAiKeySaved(false), 2000);
                }}
                disabled={!currentApiKey.trim()}
              >
                {aiKeySaved ? t("settings.ai.saved") : t("settings.ai.saveKey")}
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={handleTestConnection}
                disabled={!currentApiKey.trim() || aiTesting}
                className="bg-bg-tertiary text-text-primary border border-border-primary"
              >
                {aiTesting ? t("settings.ai.testing") : t("settings.ai.testConnection")}
              </Button>
              {aiTestResult === "success" && <span className="text-xs text-success">{t("settings.ai.connected")}</span>}
              {aiTestResult === "fail" && <span className="text-xs text-danger">{t("settings.ai.connectionFailed")}</span>}
            </div>
          </div>
        </Section>
      )}

      <Section title={t("settings.ai.sections.features")}>
        <ToggleRow
          label={t("settings.ai.enableAI")}
          description={t("settings.ai.enableAIDesc")}
          checked={aiEnabled}
          onToggle={async () => {
            const newVal = !aiEnabled;
            setAiEnabled(newVal);
            await setSetting("ai_enabled", newVal ? "true" : "false");
          }}
        />
        <ToggleRow
          label={t("settings.ai.autoCategorize")}
          description={t("settings.ai.autoCategorizeDesc")}
          checked={aiAutoCategorize}
          onToggle={async () => {
            const newVal = !aiAutoCategorize;
            setAiAutoCategorize(newVal);
            await setSetting("ai_auto_categorize", newVal ? "true" : "false");
          }}
        />
        <ToggleRow
          label={t("settings.ai.autoSummarize")}
          description={t("settings.ai.autoSummarizeDesc")}
          checked={aiAutoSummarize}
          onToggle={async () => {
            const newVal = !aiAutoSummarize;
            setAiAutoSummarize(newVal);
            await setSetting("ai_auto_summarize", newVal ? "true" : "false");
          }}
        />
        <SettingRow label={t("settings.ai.aiLanguage")}>
          <select
            value={aiLanguage}
            onChange={async (e) => {
              const val = e.target.value;
              setAiLanguage(val);
              await setSetting("ai_language", val);
            }}
            className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
          >
            <option value="English">English</option>
            <option value="Italian">Italiano</option>
            <option value="French">Français</option>
            <option value="German">Deutsch</option>
            <option value="Spanish">Español</option>
            <option value="Portuguese">Português</option>
            <option value="Dutch">Nederlands</option>
          </select>
        </SettingRow>
      </Section>

      <Section title={t("settings.ai.sections.autoDraftReplies")}>
        <ToggleRow
          label={t("settings.ai.autoDraft")}
          description={t("settings.ai.autoDraftDesc")}
          checked={aiAutoDraftEnabled}
          onToggle={async () => {
            const newVal = !aiAutoDraftEnabled;
            setAiAutoDraftEnabled(newVal);
            await setSetting("ai_auto_draft_enabled", newVal ? "true" : "false");
          }}
        />
        <ToggleRow
          label={t("settings.ai.learnWritingStyle")}
          description={t("settings.ai.learnWritingStyleDesc")}
          checked={aiWritingStyleEnabled}
          onToggle={async () => {
            const newVal = !aiWritingStyleEnabled;
            setAiWritingStyleEnabled(newVal);
            await setSetting("ai_writing_style_enabled", newVal ? "true" : "false");
          }}
        />
        {aiWritingStyleEnabled && (
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-text-secondary">{t("settings.ai.writingStyleProfile")}</span>
              <p className="text-xs text-text-tertiary mt-0.5">
                {t("settings.ai.reanalyzeDesc")}
              </p>
            </div>
            <Button
              variant="secondary"
              size="md"
              onClick={async () => {
                setStyleAnalyzing(true);
                setStyleAnalyzeDone(false);
                try {
                  if (activeAccountId) {
                    const { refreshWritingStyle } = await import("@/services/ai/writingStyleService");
                    await refreshWritingStyle(activeAccountId);
                    setStyleAnalyzeDone(true);
                    setTimeout(() => setStyleAnalyzeDone(false), 3000);
                  }
                } catch (err) {
                  console.error("Style analysis failed:", err);
                } finally {
                  setStyleAnalyzing(false);
                }
              }}
              disabled={styleAnalyzing}
              className="bg-bg-tertiary text-text-primary border border-border-primary"
            >
              {styleAnalyzing ? t("settings.ai.analyzing") : styleAnalyzeDone ? t("settings.ai.done") : t("settings.ai.reanalyze")}
            </Button>
          </div>
        )}
      </Section>

      <Section title={t("settings.ai.sections.aiSoul")}>
        <p className="text-xs text-text-tertiary mb-2">
          {t("settings.ai.soulDesc")}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="md" onClick={() => setSoulEditorOpen(true)}>
            {t("settings.ai.editSoul")}
          </Button>
          <span className="text-xs text-text-tertiary">
            {t("settings.ai.soulFileLocation")}
          </span>
        </div>
        <SoulEditorDialog isOpen={soulEditorOpen} onClose={() => setSoulEditorOpen(false)} />
      </Section>

      <Section title={t("settings.ai.sections.categories")}>
        <p className="text-xs text-text-tertiary mb-1">
          {t("settings.ai.categoriesDesc")}
        </p>
        <p className="text-xs text-text-tertiary mb-3">
          {t("settings.ai.categoriesAutoArchiveDesc")}
        </p>
        {(["Updates", "Promotions", "Social", "Newsletters"] as const).map((cat) => (
          <ToggleRow
            key={cat}
            label={t("settings.ai.autoArchive", { cat })}
            description={t("settings.ai.autoArchiveDesc", { cat: cat.toLowerCase() })}
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

      <Section title={t("settings.ai.sections.bundling")}>
        <p className="text-xs text-text-tertiary mb-3">
          {t("settings.ai.bundlingDesc")}
        </p>
        <BundleSettings />
      </Section>

      <Section title={t("settings.ai.sections.behavioralIntelligence")}>
        <p className="text-xs text-text-tertiary mb-3">
          {t("settings.ai.behavioralIntelligenceDesc")}
        </p>
        <ToggleRow
          label={t("settings.ai.enableBehavioral")}
          description={t("settings.ai.enableBehavioralDesc")}
          checked={behaviorEnabled}
          onToggle={async () => {
            const next = !behaviorEnabled;
            setBehaviorEnabled(next);
            await setSetting("ai_behavior_enabled", next ? "true" : "false");
            const { invalidateUrgencySettingsCache, runUrgencyBackfill } = await import(
              "@/services/ai/urgencyPipeline"
            );
            invalidateUrgencySettingsCache();
            if (next) runUrgencyBackfill().catch(() => {});
          }}
        />
        {behaviorEnabled && (
          <div className="mt-3">
            <ToggleRow
              label={t("settings.ai.urgencyIndicators")}
              description={t("settings.ai.urgencyIndicatorsDesc")}
              checked={urgencyEnabled}
              onToggle={async () => {
                const next = !urgencyEnabled;
                setUrgencyEnabled(next);
                await setSetting("ai_urgency_enabled", next ? "true" : "false");
                const { invalidateUrgencySettingsCache } = await import("@/services/ai/urgencyPipeline");
                invalidateUrgencySettingsCache();
              }}
            />
          </div>
        )}
      </Section>

      {behaviorEnabled && (
        <>
          <Section title={t("settings.ai.sections.senderReputation")}>
            <p className="text-xs text-text-tertiary mb-3">
              {t("settings.ai.senderReputationDesc")}
            </p>
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <TextField
                  label={t("settings.ai.forgivenessWindow")}
                  type="number"
                  min="1"
                  max="365"
                  value={urgencyMuteWindow}
                  onChange={(e) => setUrgencyMuteWindow(e.target.value)}
                />
                <p className="text-xs text-text-tertiary mt-1.5">
                  {t("settings.ai.forgivenessWindowDesc")}
                </p>
              </div>
              <div className="flex-1">
                <TextField
                  label={t("settings.ai.muteThreshold")}
                  type="number"
                  min="1"
                  max="100"
                  value={urgencyMuteThreshold}
                  onChange={(e) => setUrgencyMuteThreshold(e.target.value)}
                />
                <p className="text-xs text-text-tertiary mt-1.5">
                  {t("settings.ai.muteThresholdDesc")}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <Button
                variant="secondary"
                onClick={async () => {
                  await setSetting("ai_urgency_mute_window_days", urgencyMuteWindow.trim() || "30");
                  await setSetting("ai_urgency_mute_threshold", urgencyMuteThreshold.trim() || "3");
                  import("@/services/ai/reputationEngine").then(({ purgeOldInteractions }) => {
                    purgeOldInteractions().catch(() => {});
                  });
                }}
              >
                {t("settings.ai.saveAndApply")}
              </Button>
            </div>
          </Section>

          <Section title={t("settings.ai.sections.automation")}>
            <ToggleRow
              label={t("settings.ai.smartAutoExtinguish")}
              description={t("settings.ai.smartAutoExtinguishDesc")}
              checked={urgencyAutoExtinguish}
              onToggle={async () => {
                const next = !urgencyAutoExtinguish;
                setUrgencyAutoExtinguish(next);
                await setSetting("ai_urgency_auto_extinguish", next ? "true" : "false");
              }}
            />
          </Section>
        </>
      )}
    </>
  );
}
