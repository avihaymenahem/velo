import { useState, useCallback } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { Modal } from "@/components/ui/Modal";
import { exportMessages, type ExportFormat } from "@/services/export/exportService";
import { Download, FileText, File, Archive, Shield, Check } from "lucide-react";

interface ExportDialogProps {
  accountId: string;
  isOpen: boolean;
  onClose: () => void;
}

type Step = "format" | "filter" | "destination" | "encrypt";

const FORMATS: { value: ExportFormat; label: string; icon: typeof File; desc: string }[] = [
  { value: "mbox", label: "Mbox", icon: FileText, desc: "Standard mbox format — compatible with Thunderbird, Apple Mail, and most clients" },
  { value: "eml", label: "EML", icon: File, desc: "Individual .eml files — one file per message" },
  { value: "zip", label: "ZIP", icon: Archive, desc: "Compressed archive of all exported messages" },
];

export function ExportDialog({ accountId, isOpen, onClose }: ExportDialogProps) {
  const [step, setStep] = useState<Step>("format");
  const [format, setFormat] = useState<ExportFormat>("mbox");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [destinationPath, setDestinationPath] = useState("");
  const [encryptBackup, setEncryptBackup] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [done, setDone] = useState(false);

  const handlePickDestination = useCallback(async () => {
    const picked = await save({
      defaultPath: `velo-export-${Date.now()}.mbox`,
      filters: [
        { name: "Mbox", extensions: ["mbox"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    if (picked) setDestinationPath(picked);
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await exportMessages({
        accountId,
        format,
        destinationPath,
        dateFrom: dateFrom ? new Date(dateFrom).getTime() / 1000 : undefined,
        dateTo: dateTo ? new Date(dateTo).getTime() / 1000 : undefined,
        includeAttachments: true,
        encryptBackup,
      });
      setDone(true);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  }, [accountId, format, destinationPath, dateFrom, dateTo, encryptBackup]);

  const handleClose = useCallback(() => {
    setStep("format");
    setFormat("mbox");
    setDateFrom("");
    setDateTo("");
    setDestinationPath("");
    setEncryptBackup(false);
    setDone(false);
    onClose();
  }, [onClose]);

  const canProceed = destinationPath.length > 0;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Export Emails" width="w-[520px]">
      <div className="p-6 space-y-6">
        {done ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="w-12 h-12 rounded-full bg-success/15 flex items-center justify-center">
              <Check size={24} className="text-success" />
            </div>
            <p className="text-sm font-medium text-text-primary">Export Complete</p>
            <p className="text-xs text-text-tertiary text-center">
              Messages exported to<br />{destinationPath}
            </p>
            <button
              onClick={handleClose}
              className="mt-2 px-4 py-2 text-xs font-medium text-white bg-accent rounded-md hover:bg-accent-hover transition-colors"
            >
              Done
            </button>
          </div>
        ) : step === "format" ? (
          <>
            <p className="text-sm text-text-secondary">Choose export format</p>
            <div className="space-y-2">
              {FORMATS.map((f) => {
                const Icon = f.icon;
                const isSelected = format === f.value;
                return (
                  <button
                    key={f.value}
                    onClick={() => setFormat(f.value)}
                    className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                      isSelected
                        ? "border-accent bg-accent/5"
                        : "border-border-primary hover:bg-bg-hover"
                    }`}
                  >
                    <Icon size={18} className={`mt-0.5 ${isSelected ? "text-accent" : "text-text-tertiary"}`} />
                    <div className="min-w-0">
                      <div className={`text-sm font-medium ${isSelected ? "text-accent" : "text-text-primary"}`}>
                        {f.label}
                      </div>
                      <div className="text-xs text-text-tertiary mt-0.5">{f.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setStep("filter")}
                className="px-4 py-2 text-xs font-medium text-white bg-accent rounded-md hover:bg-accent-hover transition-colors"
              >
                Next
              </button>
            </div>
          </>
        ) : step === "filter" ? (
          <>
            <p className="text-sm text-text-secondary">Filter messages (optional)</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-tertiary block mb-1">From date</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-bg-tertiary border border-border-primary rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <div>
                <label className="text-xs text-text-tertiary block mb-1">To date</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-bg-tertiary border border-border-primary rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>
            <div className="flex justify-between">
              <button
                onClick={() => setStep("format")}
                className="px-4 py-2 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep("destination")}
                className="px-4 py-2 text-xs font-medium text-white bg-accent rounded-md hover:bg-accent-hover transition-colors"
              >
                Next
              </button>
            </div>
          </>
        ) : step === "destination" ? (
          <>
            <p className="text-sm text-text-secondary">Choose destination</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2 text-xs bg-bg-tertiary border border-border-primary rounded-md text-text-secondary truncate">
                {destinationPath || "No file selected"}
              </div>
              <button
                onClick={handlePickDestination}
                className="px-3 py-2 text-xs font-medium text-accent border border-accent/30 rounded-md hover:bg-accent/10 transition-colors"
              >
                Browse
              </button>
            </div>
            <div className="flex justify-between">
              <button
                onClick={() => setStep("filter")}
                className="px-4 py-2 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep("encrypt")}
                disabled={!canProceed}
                className="px-4 py-2 text-xs font-medium text-white bg-accent rounded-md hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-text-secondary">Review and confirm</p>
            <div className="space-y-2 p-3 bg-bg-tertiary rounded-lg">
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-tertiary">Format</span>
                <span className="text-text-primary font-medium">{format.toUpperCase()}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-tertiary">Destination</span>
                <span className="text-text-primary font-medium truncate max-w-[200px]">{destinationPath}</span>
              </div>
              {dateFrom && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-tertiary">From</span>
                  <span className="text-text-primary">{dateFrom}</span>
                </div>
              )}
              {dateTo && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-tertiary">To</span>
                  <span className="text-text-primary">{dateTo}</span>
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={encryptBackup}
                onChange={(e) => setEncryptBackup(e.target.checked)}
                className="accent-accent"
              />
              <Shield size={14} className="text-text-tertiary" />
              <span className="text-xs text-text-secondary">Encrypt backup file</span>
            </label>
            <div className="flex justify-between">
              <button
                onClick={() => setStep("destination")}
                className="px-4 py-2 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleExport}
                disabled={exporting || !canProceed}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-accent rounded-md hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                <Download size={14} />
                {exporting ? "Exporting..." : "Export"}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
