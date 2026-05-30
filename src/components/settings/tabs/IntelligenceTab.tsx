import { useState, useEffect } from "react";
import { useAccountStore } from "@/stores/accountStore";
import { getSetting, setSetting } from "@/services/db/settings";
import { Section, ToggleRow } from "./shared";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { t } from "@/i18n";

export function IntelligenceTab() {
  const accounts = useAccountStore((s) => s.accounts);

  const [ragEnabled, setRagEnabled] = useState(false);
  const [embeddingModel, setEmbeddingModel] = useState("nomic-embed-text");
  const [ollamaServerUrl, setOllamaServerUrl] = useState("http://localhost:11434");
  const [ragChunkSize, setRagChunkSize] = useState("512");
  const [ragBatchSize, setRagBatchSize] = useState("10");
  const [ragProgress, setRagProgress] = useState<{ indexed: number; total: number } | null>(null);
  const [ragTesting, setRagTesting] = useState(false);
  const [ragTestResult, setRagTestResult] = useState<"success" | "fail" | null>(null);
  const [ragTestError, setRagTestError] = useState<"server_down" | "model_not_found" | "unknown" | null>(null);
  const [ragDimensions, setRagDimensions] = useState<number | null>(null);
  const [ragSaved, setRagSaved] = useState(false);
  const [ragRunning, setRagRunning] = useState(false);
  const [ragError, setRagError] = useState<string | null>(null);
  const [ragPriorityDomains, setRagPriorityDomains] = useState("");
  const [urgencyDecayStart, setUrgencyDecayStart] = useState("20");
  const [urgencyDecayFloor, setUrgencyDecayFloor] = useState("30");
  const [ragDiagOpen, setRagDiagOpen] = useState(false);
  const [ragDiagData, setRagDiagData] = useState<any>(null);
  const [accountRagFlags, setAccountRagFlags] = useState<Record<string, boolean>>({});
  const [ragReindexConfirm, setRagReindexConfirm] = useState(false);
  const [ragClearing, setRagClearing] = useState(false);

  useEffect(() => {
    async function load() {
      const ragEn = await getSetting("rag_enabled");
      setRagEnabled(ragEn === "true");
      const ollamaUrl = await getSetting("ollama_server_url");
      if (ollamaUrl) setOllamaServerUrl(ollamaUrl);
      const embModel = await getSetting("embedding_model");
      if (embModel) setEmbeddingModel(embModel);
      const chunkSz = await getSetting("rag_chunk_size");
      if (chunkSz) setRagChunkSize(chunkSz);
      const batchSz = await getSetting("rag_batch_size");
      if (batchSz) setRagBatchSize(batchSz);
      const decayStart = await getSetting("ai_urgency_decay_start_days");
      if (decayStart) setUrgencyDecayStart(decayStart);
      const decayFloor = await getSetting("ai_urgency_decay_floor_days");
      if (decayFloor) setUrgencyDecayFloor(decayFloor);
      const priorityDomains = await getSetting("rag_priority_domains");
      if (priorityDomains !== null) setRagPriorityDomains(priorityDomains);

      try {
        const { getAccountRagEnabled } = await import("@/services/db/accounts");
        const flags: Record<string, boolean> = {};
        for (const acc of accounts) {
          flags[acc.id] = await getAccountRagEnabled(acc.id);
        }
        setAccountRagFlags(flags);

        const ragEnabledIds = accounts.filter((a) => flags[a.id]).map((a) => a.id);
        if (ragEnabledIds.length > 0) {
          const { getEmbeddingProgressAll } = await import("@/services/ai/ollamaEmbeddings");
          setRagProgress(await getEmbeddingProgressAll(ragEnabledIds));
        }
      } catch (err) {
        console.error("Failed to load RAG flags:", err);
      }
    }
    load();
  }, [accounts]);

  // Auto-refresh RAG progress while tab is visible and indexing is running
  useEffect(() => {
    if (!ragEnabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = async () => {
      if (cancelled) return;
      const { getEmbeddingProgressAll } = await import("@/services/ai/ollamaEmbeddings");
      const ragEnabledIds = accounts.filter((a) => accountRagFlags[a.id]).map((a) => a.id);
      if (ragEnabledIds.length > 0) {
        const progress = await getEmbeddingProgressAll(ragEnabledIds);
        if (!cancelled) setRagProgress(progress);
      }
      if (cancelled) return;
      const { isEmbeddingBackfillRunning, getLastError } = await import("@/services/ai/embeddingBackfill");
      if (!cancelled) {
        setRagRunning(isEmbeddingBackfillRunning());
        setRagError(getLastError());
        timer = setTimeout(refresh, 3000);
      }
    };
    refresh();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ragEnabled, accounts, accountRagFlags]);

  return (
    <>
      <Section title={t("settings.intelligence.sections.privacyLocal")}>
        <div className="rounded-md bg-bg-tertiary border border-border-primary px-3 py-3 text-sm text-text-secondary leading-relaxed">
          <p className="font-medium text-text-primary mb-1">{t("settings.intelligence.onDeviceTitle")}</p>
          <p className="text-xs">
            Melo uses a local Ollama server (
            <code className="bg-bg-secondary px-1 rounded">localhost:11434</code>) to generate vector
            embeddings of your emails. These embeddings are stored in the local SQLite database and never sent
            to any external server. Semantic search uses cosine similarity computed in-process.
          </p>
        </div>
      </Section>

      <Section title={t("settings.intelligence.sections.semanticSearch")}>
        <p className="text-xs text-text-tertiary mb-3">
          {t("settings.intelligence.semanticRagDesc")}
        </p>
        <ToggleRow
          label={t("settings.intelligence.enableSemantic")}
          description={t("settings.intelligence.enableSemanticDesc")}
          checked={ragEnabled}
          onToggle={async () => {
            const next = !ragEnabled;
            setRagEnabled(next);
            await setSetting("rag_enabled", next ? "true" : "false");
            if (next) {
              const { runEmbeddingBackfill } = await import("@/services/ai/embeddingBackfill");
              runEmbeddingBackfill().catch(() => {});
            } else {
              const { stopEmbeddingBackfill } = await import("@/services/ai/embeddingBackfill");
              stopEmbeddingBackfill();
            }
          }}
        />
      </Section>

      <Section title={t("settings.intelligence.sections.indexedAccounts")}>
        <p className="text-xs text-text-tertiary mb-3">
          {t("settings.intelligence.indexedAccountsDesc")}
        </p>
        {accounts.length === 0 ? (
          <p className="text-xs text-text-tertiary">{t("settings.intelligence.noAccountsConfigured")}</p>
        ) : (
          <div className="space-y-2">
            {accounts.map((acc) => (
              <ToggleRow
                key={acc.id}
                label={acc.email}
                description={acc.provider === "gmail" ? t("settings.intelligence.gmailAccount") : t("settings.intelligence.imapAccount")}
                checked={accountRagFlags[acc.id] ?? false}
                onToggle={async () => {
                  const next = !(accountRagFlags[acc.id] ?? false);
                  setAccountRagFlags((prev) => ({ ...prev, [acc.id]: next }));
                  const { setAccountRagEnabled } = await import("@/services/db/accounts");
                  await setAccountRagEnabled(acc.id, next);
                  if (next && ragEnabled) {
                    const { runEmbeddingBackfill } = await import("@/services/ai/embeddingBackfill");
                    runEmbeddingBackfill().catch(() => {});
                  }
                  const { getEmbeddingProgressAll } = await import("@/services/ai/ollamaEmbeddings");
                  const updatedFlags = { ...accountRagFlags, [acc.id]: next };
                  const ragEnabledIds = accounts.filter((a) => updatedFlags[a.id]).map((a) => a.id);
                  if (ragEnabledIds.length > 0) {
                    setRagProgress(await getEmbeddingProgressAll(ragEnabledIds));
                  } else {
                    setRagProgress(null);
                  }
                }}
              />
            ))}
          </div>
        )}
      </Section>

      <Section title={t("settings.intelligence.sections.embeddingModel")}>
        <p className="text-xs text-text-tertiary mb-3">
          {t("settings.intelligence.embeddingModelDesc")}
        </p>
        <div className="space-y-3">
          <TextField
            label={t("settings.intelligence.ollamaServerUrl")}
            size="md"
            value={ollamaServerUrl}
            onChange={(e) => setOllamaServerUrl(e.target.value)}
            placeholder="http://localhost:11434"
          />
          <TextField
            label={t("settings.intelligence.embeddingModel")}
            size="md"
            value={embeddingModel}
            onChange={(e) => setEmbeddingModel(e.target.value)}
            placeholder="nomic-embed-text"
          />
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="md"
              onClick={async () => {
                await setSetting("ollama_server_url", ollamaServerUrl.trim() || "http://localhost:11434");
                await setSetting("embedding_model", embeddingModel.trim() || "nomic-embed-text");
                setRagSaved(true);
                setTimeout(() => setRagSaved(false), 2000);
              }}
            >
              {ragSaved ? t("settings.intelligence.saved") : t("settings.intelligence.save")}
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={async () => {
                setRagTesting(true);
                setRagTestResult(null);
                setRagTestError(null);
                setRagDimensions(null);
                try {
                  const { testEmbeddingModel } = await import("@/services/ai/ollamaEmbeddings");
                  const res = await testEmbeddingModel(
                    ollamaServerUrl.trim() || "http://localhost:11434",
                    embeddingModel.trim() || "nomic-embed-text",
                  );
                  setRagTestResult(res.ok ? "success" : "fail");
                  if (res.ok) {
                    setRagDimensions(res.dimensions ?? null);
                  } else {
                    setRagTestError(res.errorType ?? "unknown");
                  }
                } catch {
                  setRagTestResult("fail");
                  setRagTestError("unknown");
                } finally {
                  setRagTesting(false);
                }
              }}
              disabled={ragTesting || !ollamaServerUrl.trim()}
              className="bg-bg-tertiary text-text-primary border border-border-primary"
            >
              {ragTesting ? t("settings.intelligence.testing") : t("settings.intelligence.testEmbeddingModel")}
            </Button>
            {ragTestResult === "success" && (
              <span className="text-xs text-success">
                {ragDimensions ? t("settings.intelligence.modelRespondingDims", { dims: ragDimensions }) : t("settings.intelligence.modelResponding")}
              </span>
            )}
            {ragTestResult === "fail" && ragTestError === "server_down" && (
              <span className="text-xs text-danger">{t("settings.intelligence.serverUnreachable")}</span>
            )}
            {ragTestResult === "fail" && ragTestError === "model_not_found" && (
              <span className="text-xs text-danger">
                {t("settings.intelligence.modelNotFound", { model: embeddingModel || "nomic-embed-text" })}
              </span>
            )}
            {ragTestResult === "fail" && ragTestError === "unknown" && (
              <span className="text-xs text-danger">{t("settings.intelligence.testFailed")}</span>
            )}
          </div>
        </div>
      </Section>

      <Section title={t("settings.intelligence.sections.indexingParams")}>
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <TextField
              label={t("settings.intelligence.chunkSizeLabel")}
              size="md"
              value={ragChunkSize}
              onChange={(e) => setRagChunkSize(e.target.value)}
              placeholder="512"
            />
            <p className="text-xs text-text-tertiary mt-1.5">
              {t("settings.intelligence.chunkSizeDesc")}
            </p>
          </div>
          <div className="flex-1">
            <TextField
              label={t("settings.intelligence.batchSizeLabel")}
              size="md"
              value={ragBatchSize}
              onChange={(e) => setRagBatchSize(e.target.value)}
              placeholder="10"
            />
            <p className="text-xs text-text-tertiary mt-1.5">
              {t("settings.intelligence.batchSizeDesc")}
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          size="md"
          className="mt-3"
          onClick={async () => {
            await setSetting("rag_chunk_size", ragChunkSize.trim() || "512");
            await setSetting("rag_batch_size", ragBatchSize.trim() || "10");
            setRagSaved(true);
            setTimeout(() => setRagSaved(false), 2000);
          }}
        >
          {ragSaved ? t("settings.intelligence.saved") : t("settings.intelligence.saveParameters")}
        </Button>
      </Section>

      <Section title={t("settings.intelligence.sections.indexingProgress")}>
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-text-secondary">{t("settings.intelligence.emailsIndexed")}</span>
            <span className="text-text-primary font-medium tabular-nums">
              {ragProgress
                ? `${ragProgress.indexed.toLocaleString()} / ${ragProgress.total.toLocaleString()}`
                : "— / —"}
            </span>
          </div>
          <div className="w-full bg-bg-tertiary rounded-full h-2 border border-border-primary">
            <div
              className="bg-accent h-2 rounded-full transition-all duration-300"
              style={{
                width:
                  ragProgress && ragProgress.total > 0
                    ? `${Math.min(100, (ragProgress.indexed / ragProgress.total) * 100)}%`
                    : "0%",
              }}
            />
          </div>
          <p className="text-xs text-text-tertiary mt-2">
            {!ragProgress
              ? accounts.some((a) => accountRagFlags[a.id])
                ? t("settings.intelligence.loadingIndexData")
                : t("settings.intelligence.enableForAccount")
              : ragProgress.indexed >= ragProgress.total && ragProgress.total > 0
                ? t("settings.intelligence.allIndexed")
                : ragProgress.indexed > ragProgress.total
                  ? t("settings.intelligence.indexingComplete", { count: (ragProgress.indexed - ragProgress.total).toLocaleString() })
                  : ragRunning
                    ? t("settings.intelligence.indexingInProgress", { count: (ragProgress.total - ragProgress.indexed).toLocaleString() })
                    : t("settings.intelligence.indexingPaused", { count: (ragProgress.total - ragProgress.indexed).toLocaleString() })}
          </p>
          {ragError && <p className="text-xs text-danger mt-1">{ragError}</p>}
          <div className="flex gap-2 mt-3">
            {ragProgress && ragProgress.indexed < ragProgress.total && ragEnabled && (
              <Button
                variant="secondary"
                size="md"
                className="bg-bg-tertiary text-text-primary border border-border-primary"
                onClick={async () => {
                  const { runEmbeddingBackfill, isEmbeddingBackfillRunning, getLastError } = await import(
                    "@/services/ai/embeddingBackfill"
                  );
                  runEmbeddingBackfill().catch(() => {});
                  setRagRunning(isEmbeddingBackfillRunning());
                  setRagError(getLastError());
                }}
              >
                {ragRunning ? t("settings.intelligence.restartIndexing") : t("settings.intelligence.resumeIndexing")}
              </Button>
            )}
            <Button
              variant="secondary"
              size="md"
              className="bg-bg-tertiary text-text-primary border border-border-primary"
              onClick={async () => {
                if (ragDiagOpen) {
                  setRagDiagOpen(false);
                  return;
                }
                const { getDiagnostics } = await import("@/services/ai/embeddingBackfill");
                const diag = await getDiagnostics();
                setRagDiagData(diag);
                setRagDiagOpen(true);
              }}
            >
              {ragDiagOpen ? t("settings.intelligence.hideDiagnostics") : t("settings.intelligence.showDiagnostics")}
            </Button>
          </div>

          {ragEnabled && ragProgress && ragProgress.total > 0 && (
            <div className="mt-3 pt-3 border-t border-border-secondary">
              {!ragReindexConfirm ? (
                <Button
                  variant="secondary"
                  size="md"
                  className="bg-bg-tertiary text-text-secondary border border-border-primary hover:border-danger hover:text-danger transition-colors"
                  onClick={() => setRagReindexConfirm(true)}
                >
                  {t("settings.intelligence.reindexFromScratch")}
                </Button>
              ) : (
                <div className="flex items-center gap-3">
                  <p className="text-xs text-danger flex-1">
                    {t("settings.intelligence.reindexConfirm", { count: ragProgress.indexed.toLocaleString() })}
                  </p>
                  <Button
                    variant="secondary"
                    size="md"
                    className="bg-bg-tertiary text-text-secondary border border-border-primary shrink-0"
                    onClick={() => setRagReindexConfirm(false)}
                    disabled={ragClearing}
                  >
                    {t("settings.intelligence.cancel")}
                  </Button>
                  <Button
                    variant="secondary"
                    size="md"
                    className="bg-danger/10 text-danger border border-danger/30 shrink-0"
                    disabled={ragClearing}
                    onClick={async () => {
                      setRagClearing(true);
                      try {
                        const {
                          stopEmbeddingBackfill,
                          clearAllEmbeddings,
                          runEmbeddingBackfill,
                          isEmbeddingBackfillRunning,
                          getLastError,
                        } = await import("@/services/ai/embeddingBackfill");
                        stopEmbeddingBackfill();
                        await new Promise((r) => setTimeout(r, 300));
                        await clearAllEmbeddings();
                        setRagProgress({ indexed: 0, total: ragProgress.total });
                        setRagDiagOpen(false);
                        runEmbeddingBackfill().catch(() => {});
                        setRagRunning(isEmbeddingBackfillRunning());
                        setRagError(getLastError());
                      } finally {
                        setRagClearing(false);
                        setRagReindexConfirm(false);
                      }
                    }}
                  >
                    {ragClearing ? t("settings.intelligence.clearing") : t("settings.intelligence.confirm")}
                  </Button>
                </div>
              )}
            </div>
          )}

          {ragDiagOpen && ragDiagData && (
            <div className="mt-4 p-4 rounded-lg bg-bg-secondary border border-border-primary space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-tertiary mb-2">
                {t("settings.intelligence.internalIndexState")}
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-[10px] text-text-tertiary uppercase">{t("settings.intelligence.databaseTotals")}</p>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-text-secondary">{t("settings.intelligence.totalMessages")}</span>
                    <span className="text-sm font-medium tabular-nums">
                      {ragDiagData.totalMessages.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-text-secondary">{t("settings.intelligence.ragEnabledAccounts")}</span>
                    <span className="text-sm font-medium tabular-nums">{ragDiagData.ragAccounts}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-text-tertiary uppercase">{t("settings.intelligence.eligibility")}</p>
                  <div className="flex justify-between items-baseline border-b border-border-primary pb-1 mb-1">
                    <span className="text-xs text-text-secondary font-semibold">{t("settings.intelligence.eligibleMessages")}</span>
                    <span className="text-sm font-bold tabular-nums text-accent">
                      {ragDiagData.eligibleMessages.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-text-secondary">{t("settings.intelligence.successfullyIndexed")}</span>
                    <span className="text-sm font-medium tabular-nums text-success">
                      {ragDiagData.indexed.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-text-secondary">{t("settings.intelligence.noContentSentinels")}</span>
                    <span className="text-sm font-medium tabular-nums text-text-tertiary">
                      {ragDiagData.sentinels.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline pt-1">
                    <span className="text-xs text-text-secondary">{t("settings.intelligence.pendingProcessing")}</span>
                    <span className="text-sm font-medium tabular-nums text-warning">
                      {ragDiagData.pending.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t border-border-primary">
                <p className="text-[10px] text-text-tertiary leading-relaxed italic">
                  {t("settings.intelligence.eligibilityNote")}
                </p>
              </div>
            </div>
          )}
        </div>
      </Section>

      <Section title={t("settings.intelligence.sections.temporalAging")}>
        <p className="text-xs text-text-tertiary mb-3">
          {t("settings.intelligence.temporalAgingDesc")}
        </p>
        <div className="flex items-start gap-4 mb-3">
          <div className="flex-1">
            <TextField
              label={t("settings.intelligence.decayStartLabel")}
              type="number"
              min="1"
              max="365"
              value={urgencyDecayStart}
              onChange={(e) => setUrgencyDecayStart(e.target.value)}
            />
            <p className="text-xs text-text-tertiary mt-1.5">
              {t("settings.intelligence.decayStartDesc")}
            </p>
          </div>
          <div className="flex-1">
            <TextField
              label={t("settings.intelligence.decayFloorLabel")}
              type="number"
              min="1"
              max="365"
              value={urgencyDecayFloor}
              onChange={(e) => setUrgencyDecayFloor(e.target.value)}
            />
            <p className="text-xs text-text-tertiary mt-1.5">
              {t("settings.intelligence.decayFloorDesc")}
            </p>
          </div>
        </div>
        <p className="text-xs text-text-tertiary mb-3 bg-bg-tertiary rounded-lg px-3 py-2">
          {t("settings.intelligence.decayExample")}
        </p>
        <Button
          variant="secondary"
          onClick={async () => {
            const start = Math.max(1, parseInt(urgencyDecayStart.trim() || "20", 10));
            const floor = Math.max(start + 1, parseInt(urgencyDecayFloor.trim() || "30", 10));
            setUrgencyDecayStart(String(start));
            setUrgencyDecayFloor(String(floor));
            await setSetting("ai_urgency_decay_start_days", String(start));
            await setSetting("ai_urgency_decay_floor_days", String(floor));
          }}
        >
          {t("settings.intelligence.saveAgingRules")}
        </Button>
      </Section>

      <Section title={t("settings.intelligence.sections.priorityDomains")}>
        <p className="text-xs text-text-tertiary mb-3">
          {t("settings.intelligence.priorityDomainsDesc")}
        </p>
        <TextField
          label={t("settings.intelligence.priorityDomainsLabel")}
          placeholder={t("settings.intelligence.priorityDomainsPlaceholder")}
          value={ragPriorityDomains}
          onChange={(e) => setRagPriorityDomains(e.target.value)}
        />
        <div className="mt-3">
          <Button
            variant="secondary"
            onClick={async () => {
              await setSetting("rag_priority_domains", ragPriorityDomains.trim());
            }}
          >
            {t("settings.intelligence.saveDomains")}
          </Button>
        </div>
      </Section>
    </>
  );
}
