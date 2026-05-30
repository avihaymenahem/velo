import { useEffect, useState } from "react";
import { isOfficeDoc } from "@/utils/fileTypeHelpers";

interface OfficeDocPreviewProps {
  bytes: Uint8Array;
  mimeType: string | null;
  filename: string | null;
}

export function OfficeDocPreview({ bytes, mimeType, filename }: OfficeDocPreviewProps) {
  const [htmlUrl, setHtmlUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;

    async function convert() {
      try {
        let bodyHtml: string;
        if (isOfficeDoc(mimeType, filename)) {
          const mammoth = await import("mammoth");
          const result = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer as ArrayBuffer });
          bodyHtml = result.value || "<p><em>Document is empty or could not be rendered.</em></p>";
        } else {
          const XLSX = await import("xlsx");
          const wb = XLSX.read(bytes, { type: "array" });
          const sheetName = wb.SheetNames[0];
          const firstSheet = sheetName !== undefined ? wb.Sheets[sheetName] : undefined;
          bodyHtml = firstSheet ? XLSX.utils.sheet_to_html(firstSheet) : "<p><em>Empty spreadsheet.</em></p>";
        }

        if (cancelled) return;

        const html = wrapInDocument(bodyHtml);
        const blob = new Blob([html], { type: "text/html" });
        url = URL.createObjectURL(blob);
        setHtmlUrl(url);
      } catch (err) {
        if (!cancelled) {
          console.error("Office preview conversion failed:", err);
          setError("Preview not available for this file.");
        }
      }
    }

    convert();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [bytes, mimeType, filename]);

  if (error) {
    return <p className="text-sm text-text-tertiary">{error}</p>;
  }
  if (!htmlUrl) {
    return <p className="text-sm text-text-tertiary">Converting…</p>;
  }

  return (
    <iframe
      src={htmlUrl}
      sandbox="allow-same-origin"
      title={filename ?? "Document preview"}
      className="w-full h-[70vh] border-0 rounded bg-white"
    />
  );
}

function wrapInDocument(body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: system-ui, -apple-system, sans-serif; padding: 1.5rem 2rem; color: #111; line-height: 1.6; font-size: 14px; }
  h1, h2, h3, h4, h5, h6 { margin: 1em 0 0.4em; }
  p { margin: 0.5em 0; }
  table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
  th, td { border: 1px solid #ccc; padding: 5px 10px; text-align: left; font-size: 13px; }
  th { background: #f0f0f0; font-weight: 600; }
  tr:nth-child(even) td { background: #fafafa; }
  a { color: #0066cc; }
</style>
</head>
<body>${body}</body>
</html>`;
}
