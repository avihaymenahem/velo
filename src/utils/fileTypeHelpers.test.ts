import { describe, it, expect } from "vitest";
import {
  isDocument,
  isSpreadsheet,
  isArchive,
  isImage,
  isPdf,
  isText,
  canPreview,
  formatFileSize,
  getFileIcon,
} from "./fileTypeHelpers";

describe("isDocument", () => {
  it("detects Word documents by mime type", () => {
    expect(isDocument("application/msword")).toBe(true);
    expect(isDocument("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(true);
  });

  it("detects ODT by mime type", () => {
    expect(isDocument("application/vnd.oasis.opendocument.text")).toBe(true);
  });

  it("detects RTF by mime type", () => {
    expect(isDocument("application/rtf")).toBe(true);
  });

  it("detects documents by file extension", () => {
    expect(isDocument(null, "report.doc")).toBe(true);
    expect(isDocument(null, "report.docx")).toBe(true);
    expect(isDocument(null, "report.odt")).toBe(true);
    expect(isDocument(null, "report.rtf")).toBe(true);
    expect(isDocument("application/octet-stream", "Report.DOCX")).toBe(true);
  });

  it("returns false for non-documents", () => {
    expect(isDocument("image/png")).toBe(false);
    expect(isDocument(null, "photo.png")).toBe(false);
    expect(isDocument(null)).toBe(false);
  });
});

describe("isSpreadsheet", () => {
  it("detects Excel by mime type", () => {
    expect(isSpreadsheet("application/vnd.ms-excel")).toBe(true);
    expect(isSpreadsheet("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(true);
  });

  it("detects CSV by mime type", () => {
    expect(isSpreadsheet("text/csv")).toBe(true);
  });

  it("detects spreadsheets by file extension", () => {
    expect(isSpreadsheet(null, "data.xls")).toBe(true);
    expect(isSpreadsheet(null, "data.xlsx")).toBe(true);
    expect(isSpreadsheet(null, "data.ods")).toBe(true);
    expect(isSpreadsheet(null, "data.csv")).toBe(true);
  });

  it("returns false for non-spreadsheets", () => {
    expect(isSpreadsheet("application/pdf")).toBe(false);
    expect(isSpreadsheet(null, "doc.pdf")).toBe(false);
    expect(isSpreadsheet(null)).toBe(false);
  });
});

describe("isArchive", () => {
  it("detects zip archives", () => {
    expect(isArchive("application/zip")).toBe(true);
    expect(isArchive("application/x-zip-compressed")).toBe(true);
  });

  it("detects tar/gzip", () => {
    expect(isArchive("application/x-tar")).toBe(true);
    expect(isArchive("application/gzip")).toBe(true);
    expect(isArchive("application/x-gzip")).toBe(true);
  });

  it("detects compressed archives", () => {
    expect(isArchive("application/x-compressed")).toBe(true);
    expect(isArchive("application/x-7z-compressed")).toBe(true);
  });

  it("returns false for non-archives", () => {
    expect(isArchive("application/pdf")).toBe(false);
    expect(isArchive("image/png")).toBe(false);
    expect(isArchive(null)).toBe(false);
  });
});

describe("existing helpers", () => {
  it("isImage works", () => {
    expect(isImage("image/png")).toBe(true);
    expect(isImage("text/plain")).toBe(false);
    expect(isImage(null)).toBe(false);
  });

  it("isPdf works", () => {
    expect(isPdf("application/pdf")).toBe(true);
    expect(isPdf("application/octet-stream", "file.pdf")).toBe(true);
    expect(isPdf("text/plain")).toBe(false);
  });

  it("isText works", () => {
    expect(isText("text/plain")).toBe(true);
    expect(isText("application/json")).toBe(true);
    expect(isText("image/png")).toBe(false);
  });

  it("canPreview works", () => {
    expect(canPreview("image/png", null)).toBe(true);
    expect(canPreview("application/pdf", null)).toBe(true);
    expect(canPreview("text/plain", null)).toBe(true);
    expect(canPreview("application/zip", null)).toBe(false);
  });

  it("formatFileSize works", () => {
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(1500)).toBe("1.5 KB");
    expect(formatFileSize(1500000)).toBe("1.4 MB");
  });

  it("getFileIcon returns emoji strings", () => {
    expect(typeof getFileIcon("image/png")).toBe("string");
    expect(typeof getFileIcon(null)).toBe("string");
  });
});
