import { describe, it, expect } from "vitest";
import { readFileAsBase64 } from "./fileUtils";

describe("readFileAsBase64", () => {
  it("returns base64 content without data URL prefix", async () => {
    const binaryContent = new Uint8Array([137, 80, 78, 71]); // PNG magic bytes
    const file = new File([binaryContent], "image.png", {
      type: "image/png",
    });

    const result = await readFileAsBase64(file);

    // Should not contain the data URL prefix
    expect(result).not.toContain("data:");
    expect(result).not.toContain("base64,");
    // Should be valid base64
    expect(result.length).toBeGreaterThan(0);
  });

  it("handles text files", async () => {
    const file = new File(["Hello, World!"], "test.txt", {
      type: "text/plain",
    });

    const result = await readFileAsBase64(file);

    // Decode base64 and verify content
    const decoded = atob(result);
    expect(decoded).toBe("Hello, World!");
  });

  it("rejects on error", async () => {
    // Create a file-like object that will trigger a FileReader error
    const file = new File([], "empty.txt");

    // Override FileReader to simulate an error
    const OriginalFileReader = globalThis.FileReader;
    const mockError = new DOMException("Read failed");

    class FailingFileReader {
      onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => void) | null = null;
      onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => void) | null = null;
      error: DOMException | null = mockError;
      result: string | ArrayBuffer | null = null;

      readAsDataURL() {
        // Simulate async error
        setTimeout(() => {
          if (this.onerror) {
            this.onerror.call(this as unknown as FileReader, {} as ProgressEvent<FileReader>);
          }
        }, 0);
      }
    }

    globalThis.FileReader = FailingFileReader as unknown as typeof FileReader;

    try {
      await expect(readFileAsBase64(file)).rejects.toEqual(mockError);
    } finally {
      globalThis.FileReader = OriginalFileReader;
    }
  });
});
