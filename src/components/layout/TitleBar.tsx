import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, Copy } from "lucide-react";

const isMac = navigator.userAgent.includes("Macintosh");

export function TitleBar() {
  const { t } = useTranslation("settings");
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    appWindow.isMaximized().then(setMaximized);

    // Listen for resize events to track maximize state
    let unlisten: (() => void) | undefined;
    appWindow.onResized(() => {
      appWindow.isMaximized().then(setMaximized);
    }).then((fn) => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, []);

  const handleMinimize = () => getCurrentWindow().minimize();
  const handleMaximize = () => getCurrentWindow().toggleMaximize();
  const handleClose = () => getCurrentWindow().close();

  return (
    <div
      data-tauri-drag-region
      className="flex items-center justify-between h-9 bg-sidebar-bg border-b border-border-primary select-none shrink-0"
    >
      {/* App title — left side (extra padding on macOS for traffic light buttons) */}
      <div data-tauri-drag-region className={`flex items-center gap-2 ${isMac ? "pl-20" : "pl-4"}`}>
        <span data-tauri-drag-region className="text-xs font-semibold text-sidebar-text tracking-wide">
          {t("common:velo")}
        </span>
      </div>

      {/* Window controls — right side (hidden on macOS, uses native traffic lights) */}
      {!isMac && (
        <div className="flex items-center h-full">
          <button
            onClick={handleMinimize}
            className="h-full px-3.5 flex items-center justify-center text-sidebar-text/70 hover:bg-sidebar-hover transition-colors"
            title={t("minimize")}
          >
            <Minus size={14} />
          </button>
          <button
            onClick={handleMaximize}
            className="h-full px-3.5 flex items-center justify-center text-sidebar-text/70 hover:bg-sidebar-hover transition-colors"
            title={maximized ? t("restore") : t("maximize")}
          >
            {maximized ? <Copy size={12} /> : <Square size={12} />}
          </button>
          <button
            onClick={handleClose}
            className="h-full px-3.5 flex items-center justify-center text-sidebar-text/70 hover:bg-danger hover:text-white transition-colors"
            title={t("close")}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
