import { useEffect, useState, useCallback } from "react";
import { Download, Eye } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { Modal } from "./Modal";
import { isImage, isPdf, isText, isOfficeDoc, isOfficeSpreadsheet, canPreview, getFileIcon, formatFileSize } from "@/utils/fileTypeHelpers";
import { OfficeDocPreview } from "./OfficeDocPreview";
import { t } from "@/i18n";

interface LocalFilePreviewProps {
  file: File;
  onClose: () => void;
}

export function LocalFilePreview({ file, onClose }: LocalFilePreviewProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const [saving, setSaving] = useState(false);

  const previewable = canPreview(file.type || null, file.name);
  const isOffice = isOfficeDoc(file.type || null, file.name) || isOfficeSpreadsheet(file.type || null, file.name);

  useEffect(() => {
    if (!previewable || isOffice) return;
    const url = URL.createObjectURL(file);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, previewable, isOffice]);

  useEffect(() => {
    if (!isOffice) return;
    file.arrayBuffer().then((buf) => setFileBytes(new Uint8Array(buf)));
  }, [file, isOffice]);

  const handleDownload = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : undefined;
      const filePath = await save({
        defaultPath: file.name,
        filters: [{ name: "All Files", extensions: ext ? [ext] : ["*"] }],
      });
      if (!filePath) return;
      const bytes = new Uint8Array(await file.arrayBuffer());
      await writeFile(filePath, bytes);
    } catch (err) {
      console.error("Failed to save file:", err);
    } finally {
      setSaving(false);
    }
  }, [file, saving]);

  const header = (
    <div className="px-4 py-3 border-b border-border-primary flex items-center justify-between shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <span>{getFileIcon(file.type || null, file.name)}</span>
        <span className="text-sm font-medium text-text-primary truncate">{file.name}</span>
        <span className="text-xs text-text-tertiary whitespace-nowrap">
          ({formatFileSize(file.size)})
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-4">
        <button
          onClick={handleDownload}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors disabled:opacity-50"
        >
          <Download size={13} />
          {saving ? "Saving..." : "Save as..."}
        </button>
        <button
          onClick={onClose}
          className="text-text-tertiary hover:text-text-primary text-lg leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={file.name}
      width="w-[800px]"
      panelClassName="max-w-[90vw] max-h-[85vh] flex flex-col"
      renderHeader={header}
    >
      <div
        className="flex-1 overflow-auto min-h-[200px] flex items-center justify-center p-4"
        data-native-context-menu
      >
        {blobUrl && isImage(file.type) && (
          <img
            src={blobUrl}
            alt={file.name}
            className="max-w-full max-h-[70vh] object-contain rounded"
          />
        )}
        {blobUrl && isPdf(file.type, file.name) && (
          <iframe
            src={blobUrl}
            title={file.name}
            className="w-full h-[70vh] border-0 rounded"
          />
        )}
        {blobUrl && isText(file.type) && (
          <TextPreview url={blobUrl} />
        )}
        {isOffice && fileBytes && (
          <OfficeDocPreview bytes={fileBytes} mimeType={file.type || null} filename={file.name} />
        )}
        {!previewable && (
          <div className="flex flex-col items-center gap-3 text-text-tertiary">
            <Eye size={40} strokeWidth={1} />
            <p className="text-sm">Preview not available for this file type</p>
            <p className="text-xs">{file.type || "Unknown type"}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function TextPreview({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    fetch(url).then((r) => r.text()).then(setText).catch(() => setText("Failed to load"));
  }, [url]);
  return (
    <pre className="text-xs text-text-primary whitespace-pre-wrap break-words max-h-[70vh] overflow-auto w-full">
      {text ?? t("common.loading")}
    </pre>
  );
}
