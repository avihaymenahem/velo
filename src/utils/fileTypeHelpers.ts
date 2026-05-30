export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImage(mimeType: string | null): boolean {
  return mimeType?.startsWith("image/") ?? false;
}

export function isPdf(mimeType: string | null, filename?: string | null): boolean {
  if (mimeType === "application/pdf") return true;
  // Gmail sometimes returns application/octet-stream for PDFs
  return filename?.toLowerCase().endsWith(".pdf") ?? false;
}

export function isText(mimeType: string | null): boolean {
  if (!mimeType) return false;
  return mimeType.startsWith("text/") || mimeType === "application/json" || mimeType === "application/xml";
}

export function isOfficeDoc(mimeType: string | null, filename?: string | null): boolean {
  if (mimeType) {
    if (mimeType.includes("wordprocessingml") || mimeType.includes("msword")) return true;
  }
  const ext = filename?.toLowerCase();
  return ext?.endsWith(".docx") || ext?.endsWith(".doc") || false;
}

export function isOfficeSpreadsheet(mimeType: string | null, filename?: string | null): boolean {
  if (mimeType) {
    if (mimeType.includes("spreadsheetml") || mimeType.includes("excel") || mimeType.includes("opendocument.spreadsheet")) return true;
    if (mimeType === "text/csv") return true;
  }
  const ext = filename?.toLowerCase();
  return ext?.endsWith(".xlsx") || ext?.endsWith(".xls") || ext?.endsWith(".ods") || ext?.endsWith(".csv") || false;
}

export function canPreview(mimeType: string | null, filename: string | null): boolean {
  return isImage(mimeType) || isPdf(mimeType, filename) || isText(mimeType) || isOfficeDoc(mimeType, filename) || isOfficeSpreadsheet(mimeType, filename);
}

export function isDocument(mimeType: string | null, filename?: string | null): boolean {
  if (mimeType) {
    if (mimeType.includes("msword") || mimeType.includes("wordprocessingml") || mimeType.includes("opendocument.text") || mimeType === "application/rtf") return true;
  }
  const ext = filename?.toLowerCase();
  return ext?.endsWith(".doc") || ext?.endsWith(".docx") || ext?.endsWith(".odt") || ext?.endsWith(".rtf") || false;
}

export function isSpreadsheet(mimeType: string | null, filename?: string | null): boolean {
  if (mimeType) {
    if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType === "text/csv") return true;
  }
  const ext = filename?.toLowerCase();
  return ext?.endsWith(".xls") || ext?.endsWith(".xlsx") || ext?.endsWith(".ods") || ext?.endsWith(".csv") || false;
}

export function isArchive(mimeType: string | null, filename?: string | null): boolean {
  if (mimeType && (mimeType.includes("zip") || mimeType.includes("compressed") || mimeType.includes("archive") || mimeType.includes("tar") || mimeType === "application/gzip" || mimeType === "application/x-gzip")) return true;
  const ext = filename?.toLowerCase();
  return ext?.endsWith(".zip") || ext?.endsWith(".rar") || ext?.endsWith(".7z") || ext?.endsWith(".tar") || ext?.endsWith(".gz") || ext?.endsWith(".bz2") || false;
}

export function isPresentation(mimeType: string | null, filename?: string | null): boolean {
  if (mimeType) {
    if (mimeType.includes("presentationml") || mimeType.includes("ms-powerpoint") || mimeType.includes("opendocument.presentation")) return true;
  }
  const ext = filename?.toLowerCase();
  return ext?.endsWith(".ppt") || ext?.endsWith(".pptx") || ext?.endsWith(".odp") || false;
}

export function isCalendarInvite(mimeType: string | null, filename?: string | null): boolean {
  if (mimeType && (mimeType.includes("text/calendar") || mimeType.includes("application/ics") || mimeType.includes("text/x-vcalendar"))) return true;
  const ext = filename?.toLowerCase();
  return ext?.endsWith(".ics") || ext?.endsWith(".ical") || false;
}

export function getFileIcon(mimeType: string | null, filename?: string | null): string {
  if (mimeType?.startsWith("image/")) return "\u{1F5BC}";
  if (mimeType?.startsWith("video/")) return "\u{1F3AC}";
  if (mimeType?.startsWith("audio/")) return "\u{1F3B5}";
  if (isPdf(mimeType, filename)) return "\u{1F4D5}";
  if (isPresentation(mimeType, filename)) return "\u{1F4D9}";
  if (isDocument(mimeType, filename)) return "\u{1F4D8}";
  if (isSpreadsheet(mimeType, filename)) return "\u{1F4CA}";
  if (isArchive(mimeType, filename)) return "\u{1F4E6}";
  return "\u{1F4CE}";
}
