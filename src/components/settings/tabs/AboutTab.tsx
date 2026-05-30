import { useState, useEffect } from "react";
import { Globe, Github, Mail, ExternalLink, Scale, RefreshCw, Download } from "lucide-react";
import { Section } from "./shared";
import { Button } from "@/components/ui/Button";
import appIcon from "@/assets/icon.png";
import { t } from "@/i18n";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="text-sm text-text-primary font-mono">{value}</span>
    </div>
  );
}

function DeveloperSection() {
  const [appVersion, setAppVersion] = useState("");
  const [tauriVersion, setTauriVersion] = useState("");
  const [webviewVersion, setWebviewVersion] = useState("");
  const [platformLabel, setPlatformLabel] = useState("...");
  const [checkingForUpdate, setCheckingForUpdate] = useState(false);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateCheckDone, setUpdateCheckDone] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);

  useEffect(() => {
    async function load() {
      const { getVersion, getTauriVersion } = await import("@tauri-apps/api/app");
      setAppVersion(await getVersion());
      setTauriVersion(await getTauriVersion());

      const ua = navigator.userAgent;
      const edgMatch = /Edg\/(\S+)/.exec(ua);
      const chromeMatch = /Chrome\/(\S+)/.exec(ua);
      const webkitMatch = /AppleWebKit\/(\S+)/.exec(ua);
      setWebviewVersion(edgMatch?.[1] ?? chromeMatch?.[1] ?? webkitMatch?.[1] ?? "Unknown");

      const { platform, arch } = await import("@tauri-apps/plugin-os");
      const p = platform();
      const a = arch();
      const archLabel = a === "aarch64" || a === "arm" ? "ARM" : a === "x86_64" ? "x64" : a;
      if (p === "macos") {
        setPlatformLabel(a === "aarch64" ? "macOS (Apple Silicon)" : `macOS (${archLabel})`);
      } else if (p === "windows") {
        setPlatformLabel(`Windows (${archLabel})`);
      } else if (p === "linux") {
        setPlatformLabel(`Linux (${archLabel})`);
      } else {
        setPlatformLabel(`${p} (${archLabel})`);
      }

      const { getAvailableUpdate } = await import("@/services/updateManager");
      const existing = getAvailableUpdate();
      if (existing) setUpdateVersion(existing.version);
    }
    load();
  }, []);

  const handleCheckForUpdate = async () => {
    setCheckingForUpdate(true);
    setUpdateCheckDone(false);
    setUpdateVersion(null);
    try {
      const { checkForUpdateNow } = await import("@/services/updateManager");
      const result = await checkForUpdateNow();
      if (result) {
        setUpdateVersion(result.version);
      } else {
        setUpdateCheckDone(true);
      }
    } catch (err) {
      console.error("Update check failed:", err);
      setUpdateCheckDone(true);
    } finally {
      setCheckingForUpdate(false);
    }
  };

  const handleInstallUpdate = async () => {
    setInstallingUpdate(true);
    try {
      const { installUpdate } = await import("@/services/updateManager");
      await installUpdate();
    } catch (err) {
      console.error("Update install failed:", err);
      setInstallingUpdate(false);
    }
  };

  return (
    <>
      <Section title={t("settings.about.sections.appInfo")}>
        <InfoRow label={t("settings.about.appVersion")} value={appVersion || "..."} />
        <InfoRow label={t("settings.about.tauriVersion")} value={tauriVersion || "..."} />
        <InfoRow label={t("settings.about.webViewVersion")} value={webviewVersion || "..."} />
        <InfoRow label={t("settings.about.platform")} value={platformLabel} />
      </Section>

      <Section title={t("settings.about.sections.updates")}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-text-secondary">{t("settings.about.softwareUpdates")}</span>
            {updateVersion && (
              <p className="text-xs text-accent mt-0.5">{t("settings.about.versionAvailable", { version: updateVersion })}</p>
            )}
            {updateCheckDone && !updateVersion && (
              <p className="text-xs text-success mt-0.5">{t("settings.about.upToDate")}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {updateVersion ? (
              <Button
                variant="primary"
                size="md"
                icon={<Download size={14} />}
                onClick={handleInstallUpdate}
                disabled={installingUpdate}
              >
                {installingUpdate ? t("settings.about.updating") : t("settings.about.updateAndRestart")}
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="md"
                icon={<RefreshCw size={14} className={checkingForUpdate ? "animate-spin" : ""} />}
                onClick={handleCheckForUpdate}
                disabled={checkingForUpdate}
                className="bg-bg-tertiary text-text-primary border border-border-primary"
              >
                {checkingForUpdate ? t("settings.about.checking") : t("settings.about.checkForUpdates")}
              </Button>
            )}
          </div>
        </div>
      </Section>

      <Section title={t("settings.about.sections.developerTools")}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-text-secondary">{t("settings.about.openDevTools")}</span>
            <p className="text-xs text-text-tertiary mt-0.5">{t("settings.about.openDevToolsDesc")}</p>
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
            {t("settings.about.openDevTools")}
          </Button>
        </div>
      </Section>
    </>
  );
}

export function AboutTab() {
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    import("@tauri-apps/api/app").then(({ getVersion }) => getVersion().then(setAppVersion));
  }, []);

  const openExternal = async (url: string) => {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  };

  return (
    <>
      <DeveloperSection />

      <Section title={t("settings.about.sections.meloMail")}>
        <div className="flex items-center gap-3 mb-2">
          <img src={appIcon} alt="Melo" className="w-12 h-12 rounded-xl" />
          <div>
            <h3 className="text-base font-semibold text-text-primary">Melo</h3>
            <p className="text-sm text-text-tertiary">
              {appVersion ? `Version ${appVersion}` : t("settings.about.loadingVersion")}
            </p>
          </div>
        </div>
        <p className="text-sm text-text-secondary leading-relaxed">
          {t("settings.about.appDescription")}
        </p>
      </Section>

      <Section title={t("settings.about.sections.links")}>
        <div className="space-y-1">
          <button
            onClick={() => openExternal("https://velomail.app")}
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg bg-bg-secondary hover:bg-bg-hover transition-colors text-left"
          >
            <Globe size={16} className="text-text-tertiary shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="text-sm text-text-primary">{t("settings.about.website")}</span>
              <p className="text-xs text-text-tertiary">velomail.app</p>
            </div>
            <ExternalLink size={14} className="text-text-tertiary shrink-0" />
          </button>

          <button
            onClick={() => openExternal("https://github.com/avihaymenahem/velo")}
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg bg-bg-secondary hover:bg-bg-hover transition-colors text-left"
          >
            <Github size={16} className="text-text-tertiary shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="text-sm text-text-primary">{t("settings.about.githubRepo")}</span>
              <p className="text-xs text-text-tertiary">avihaymenahem/velo</p>
            </div>
            <ExternalLink size={14} className="text-text-tertiary shrink-0" />
          </button>

          <button
            onClick={() => openExternal("mailto:info@velomail.app")}
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg bg-bg-secondary hover:bg-bg-hover transition-colors text-left"
          >
            <Mail size={16} className="text-text-tertiary shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="text-sm text-text-primary">{t("settings.about.contact")}</span>
              <p className="text-xs text-text-tertiary">info@velomail.app</p>
            </div>
            <ExternalLink size={14} className="text-text-tertiary shrink-0" />
          </button>
        </div>
      </Section>

      <Section title={t("settings.about.sections.license")}>
        <div className="px-4 py-3 bg-bg-secondary rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Scale size={15} className="text-text-tertiary" />
            <span className="text-sm font-medium text-text-primary">{t("settings.about.apacheLicense")}</span>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed mb-3">
            {t("settings.about.licenseText")}{" "}
            <button
              onClick={() => openExternal("https://www.apache.org/licenses/LICENSE-2.0")}
              className="text-accent hover:text-accent-hover transition-colors"
            >
              apache.org/licenses/LICENSE-2.0
            </button>
          </p>
          <p className="text-xs text-text-tertiary leading-relaxed">
            {t("settings.about.licenseText2")}
          </p>
        </div>
      </Section>
    </>
  );
}
