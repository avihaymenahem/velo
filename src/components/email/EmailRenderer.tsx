import { useRef, useCallback, useLayoutEffect, useMemo, useState } from "react";
import { ImageOff } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { stripRemoteImages, hasBlockedImages } from "@/utils/imageBlocker";
import { addToAllowlist } from "@/services/db/imageAllowlist";
import { escapeHtml, sanitizeHtml } from "@/utils/sanitize";
import { useUIStore } from "@/stores/uiStore";

interface EmailRendererProps {
  html: string | null;
  text: string | null;
  blockImages?: boolean;
  senderAddress?: string | null;
  accountId?: string | null;
  senderAllowlisted?: boolean;
}

export function EmailRenderer({
  html,
  text,
  blockImages = false,
  senderAddress,
  accountId,
  senderAllowlisted = false,
}: EmailRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const rafRef = useRef<number>(0);
  const [overrideShow, setOverrideShow] = useState(false);

  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark"
    || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  const shouldBlock = blockImages && !senderAllowlisted && !overrideShow;

  // Sanitize once — reused by both content and blocked-image check
  const sanitizedBody = useMemo(() => {
    if (!html) return null;
    return sanitizeHtml(html);
  }, [html]);

  const isPlainText = !sanitizedBody;

  const bodyHtml = useMemo(() => {
    let body = sanitizedBody
      ?? `<pre style="white-space: pre-wrap; font-family: inherit;">${escapeHtml(text ?? "")}</pre>`;

    if (shouldBlock && sanitizedBody) {
      body = stripRemoteImages(body);
    }

    return body;
  }, [sanitizedBody, text, shouldBlock]);

  const blocked = useMemo(() => {
    if (!shouldBlock || !sanitizedBody) return false;
    return hasBlockedImages(stripRemoteImages(sanitizedBody));
  }, [shouldBlock, sanitizedBody]);

  // Write content directly into iframe document — synchronous, no srcDoc async parsing
  useLayoutEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    observerRef.current?.disconnect();

    const doc = iframe.contentDocument;
    if (!doc) return;

    doc.open();
    const applyDarkStyles = isDark && isPlainText;
    doc.write(`<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      margin: 0;
      padding: 16px;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: ${applyDarkStyles ? "#e5e7eb" : "#1f2937"};
      background: transparent;
      word-wrap: break-word;
      overflow-wrap: break-word;
      overflow: hidden;
    }
    img { max-width: 100%; height: auto; }
    a { color: ${applyDarkStyles ? "#60a5fa" : "#3b82f6"}; }
    blockquote {
      border-left: 3px solid ${applyDarkStyles ? "#4b5563" : "#d1d5db"};
      margin: 8px 0;
      padding: 4px 12px;
      color: ${applyDarkStyles ? "#9ca3af" : "#6b7280"};
    }
    pre { overflow-x: auto; }
    table { max-width: 100%; }
  </style>
</head>
<body>${bodyHtml}</body>
</html>`);
    doc.close();

    // Calculate and set height synchronously before paint
    const applyHeight = () => {
      if (!doc.body) return;
      const h = doc.body.scrollHeight;
      if (h > 0) {
        iframe.style.height = h + "px";
      }
    };
    applyHeight();

    // Watch for dynamic changes (images loading, etc.) — batched with rAF
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(applyHeight);
    });
    resizeObserver.observe(doc.body);
    observerRef.current = resizeObserver;

    // Open links in external browser via Tauri opener
    doc.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (anchor?.href) {
        e.preventDefault();
        openUrl(anchor.href).catch((err) => {
          console.error("Failed to open link:", err);
        });
      }
    });

    return () => {
      observerRef.current?.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [bodyHtml, isDark, isPlainText]);

  const handleLoadImages = useCallback(() => {
    setOverrideShow(true);
  }, []);

  const handleAlwaysLoad = useCallback(async () => {
    if (accountId && senderAddress) {
      await addToAllowlist(accountId, senderAddress);
    }
    setOverrideShow(true);
  }, [accountId, senderAddress]);

  return (
    <div>
      {blocked && (
        <div className="flex items-center gap-2 px-3 py-2 mb-2 text-xs bg-bg-tertiary rounded-md border border-border-secondary">
          <ImageOff size={14} className="text-text-tertiary shrink-0" />
          <span className="text-text-secondary">
            Images hidden to protect your privacy.
          </span>
          <button
            onClick={handleLoadImages}
            className="text-accent hover:text-accent-hover font-medium"
          >
            Load images
          </button>
          {senderAddress && accountId && (
            <button
              onClick={handleAlwaysLoad}
              className="text-accent hover:text-accent-hover font-medium"
            >
              Always load from sender
            </button>
          )}
        </div>
      )}
      <iframe
        ref={iframeRef}
        sandbox="allow-same-origin"
        className="w-full border-0"
        style={{ overflow: "hidden" }}
        title="Email content"
      />
    </div>
  );
}

