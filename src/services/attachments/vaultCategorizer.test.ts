import { describe, it, expect } from "vitest";
import { categorizeByFilename, extractKeywordsForCategory } from "./vaultCategorizer";

describe("categorizeByFilename", () => {
  it("categorizes invoice_123.pdf as documents", () => {
    expect(categorizeByFilename("invoice_123.pdf")).toBe("documents");
  });

  it("categorizes IMG_001.jpg as images", () => {
    expect(categorizeByFilename("IMG_001.jpg")).toBe("images");
  });

  it("categorizes photo.jpeg as images", () => {
    expect(categorizeByFilename("photo.jpeg")).toBe("images");
  });

  it("categorizes document.pdf as documents", () => {
    expect(categorizeByFilename("document.pdf")).toBe("documents");
  });

  it("categorizes report.docx as documents", () => {
    expect(categorizeByFilename("report.docx")).toBe("documents");
  });

  it("categorizes video.mp4 as videos", () => {
    expect(categorizeByFilename("video.mp4")).toBe("videos");
  });

  it("categorizes audio.mp3 as audio", () => {
    expect(categorizeByFilename("audio.mp3")).toBe("audio");
  });

  it("categorizes archive.zip as archives", () => {
    expect(categorizeByFilename("archive.zip")).toBe("archives");
  });

  it("categorizes installer.exe as executables", () => {
    expect(categorizeByFilename("installer.exe")).toBe("executables");
  });

  it("categorizes certificate.pem as certificates", () => {
    expect(categorizeByFilename("certificate.pem")).toBe("certificates");
  });

  it("categorizes event.ics as calendar", () => {
    expect(categorizeByFilename("event.ics")).toBe("calendar");
  });

  it("categorizes contact.vcf as contacts", () => {
    expect(categorizeByFilename("contact.vcf")).toBe("contacts");
  });

  it("categorizes signature.pgp as signatures", () => {
    expect(categorizeByFilename("signature.pgp")).toBe("signatures");
  });

  it("returns uncategorized for unknown extension", () => {
    expect(categorizeByFilename("random.xyz")).toBe("uncategorized");
  });

  it("handles uppercase extensions", () => {
    expect(categorizeByFilename("INVOICE.PDF")).toBe("documents");
  });

  it("handles filenames without extension", () => {
    expect(categorizeByFilename("README")).toBe("uncategorized");
  });
});

describe("extractKeywordsForCategory", () => {
  it("extracts invoice keyword from invoice filename", () => {
    expect(extractKeywordsForCategory("invoice_001.pdf")).toContain("invoice");
  });

  it("extracts contract keyword from agreement filename", () => {
    const keywords = extractKeywordsForCategory("service_agreement.docx");
    expect(keywords).toContain("contract");
  });

  it("extracts receipt keyword", () => {
    expect(extractKeywordsForCategory("receipt_2024.pdf")).toContain("receipt");
  });

  it("returns empty array for generic filename", () => {
    expect(extractKeywordsForCategory("document.pdf")).toEqual([]);
  });
});
