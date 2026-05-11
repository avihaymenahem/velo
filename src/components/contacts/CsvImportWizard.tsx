import { useState, useRef, useCallback } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Upload, FileText, Check, AlertCircle } from "lucide-react";
import { upsertContact } from "@/services/db/contacts";

interface CsvImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
}

interface ParsedContact {
  email: string;
  name: string;
}

type Step = "select" | "preview" | "importing" | "done";

export function CsvImportWizard({ isOpen, onClose }: CsvImportWizardProps) {
  const [step, setStep] = useState<Step>("select");
  const [contacts, setContacts] = useState<ParsedContact[]>([]);
  const [importResult, setImportResult] = useState({ imported: 0, failed: 0 });
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep("select");
    setContacts([]);
    setImportResult({ imported: 0, failed: 0 });
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const parseCSV = useCallback((text: string) => {
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length === 0) return [];

    const header = lines[0]!.toLowerCase();
    const hasHeader = header.includes("email") || header.includes("name");
    const dataLines = hasHeader ? lines.slice(1) : lines;

    const parsed: ParsedContact[] = [];
    for (const line of dataLines) {
      const parts = line.split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
      if (parts.length < 1) continue;
      const email = parts[0]!;
      if (!email.includes("@")) continue;
      parsed.push({
        email,
        name: parts[1] ?? "",
      });
    }
    return parsed;
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".csv")) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const parsed = parseCSV(text);
        setContacts(parsed);
        setStep("preview");
      };
      reader.readAsText(file);
    },
    [parseCSV],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleImport = useCallback(async () => {
    setStep("importing");
    let imported = 0;
    let failed = 0;
    for (const contact of contacts) {
      try {
        await upsertContact(contact.email, contact.name || null);
        imported++;
      } catch {
        failed++;
      }
    }
    setImportResult({ imported, failed });
    setStep("done");
  }, [contacts]);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Import Contacts from CSV" width="w-full max-w-lg">
      <div className="p-4">
        {step === "select" && (
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragOver
                ? "border-accent bg-accent/5"
                : "border-border-primary hover:border-accent/50"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Upload size={24} className="mx-auto mb-2 text-text-tertiary" />
            <p className="text-sm text-text-secondary mb-1">
              Click to select a CSV file or drag & drop
            </p>
            <p className="text-xs text-text-tertiary">
              CSV should have email and name columns
            </p>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <FileText size={14} />
              <span>
                {contacts.length} contact{contacts.length !== 1 ? "s" : ""} found
              </span>
            </div>
            <div className="max-h-48 overflow-y-auto border border-border-primary rounded-md">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-bg-tertiary">
                    <th className="text-left px-3 py-1.5 text-text-secondary font-medium">Email</th>
                    <th className="text-left px-3 py-1.5 text-text-secondary font-medium">Name</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.slice(0, 100).map((c, i) => (
                    <tr key={i} className="border-t border-border-primary">
                      <td className="px-3 py-1.5 text-text-primary">{c.email}</td>
                      <td className="px-3 py-1.5 text-text-secondary">{c.name || "-"}</td>
                    </tr>
                  ))}
                  {contacts.length > 100 && (
                    <tr className="border-t border-border-primary">
                      <td colSpan={2} className="px-3 py-1.5 text-text-tertiary text-center">
                        ...and {contacts.length - 100} more
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleImport}>
                Import {contacts.length} contact{contacts.length !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="flex flex-col items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent mb-3" />
            <p className="text-sm text-text-secondary">Importing contacts...</p>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-3 py-4">
            <div className="flex items-center gap-2">
              <Check size={16} className="text-success" />
              <span className="text-sm text-text-primary">
                Import complete
              </span>
            </div>
            <div className="text-xs text-text-secondary space-y-1">
              <p>
                Successfully imported: {importResult.imported}
              </p>
              {importResult.failed > 0 && (
                <p className="flex items-center gap-1 text-danger">
                  <AlertCircle size={12} />
                  Failed: {importResult.failed}
                </p>
              )}
            </div>
            <div className="flex justify-end pt-2">
              <Button variant="primary" onClick={handleClose}>
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
