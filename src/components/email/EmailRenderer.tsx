import { useRef, useEffect, useMemo, useCallback, useState } from "react";
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
  cidMap?: Map<string, string>;
}

export function EmailRenderer({
  html,
  text,
  blockImages = false,
  senderAddress,
  accountId,
  senderAllowlisted = false,
  cidMap,
}: EmailRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [overrideShow, setOverrideShow] = useState(false);

  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark"
    || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  const shouldBlock = blockImages && !senderAllowlisted && !overrideShow;

  const sanitizedBody = useMemo(() => {
    if (!html) return null;
    return sanitizeHtml(html);
  }, [html]);

  const isPlainText = !sanitizedBody;

  const bodyHtml = useMemo(() => {
    let body = sanitizedBody
      ?? `<pre style="white-space: pre-wrap; font-family: inherit;">${escapeHtml(text ?? "")}</pre>`;

    if (cidMap && cidMap.size > 0 && sanitizedBody) {
      for (const [cid, blobUrl] of cidMap.entries()) {
        body = body.replace(new RegExp(`cid:${escapeCidRegex(cid)}`, "gi"), blobUrl);
      }
    }

    if (shouldBlock && sanitizedBody) {
      body = stripRemoteImages(body);
    }

    // Rewrite anchor hrefs to data-link before injecting into the iframe so
    // the webview can never navigate to an external URL — the inline script
    // below intercepts clicks and postMessages the URL to the parent instead.
    if (sanitizedBody) {
      body = rewriteLinksForSrcdoc(body);
    }

    return body;
  }, [sanitizedBody, text, shouldBlock, cidMap]);

  const blocked = useMemo(() => {
    if (!shouldBlock || !sanitizedBody) return false;
    return hasBlockedImages(stripRemoteImages(sanitizedBody));
  }, [shouldBlock, sanitizedBody]);

  const srcdoc = useMemo(() => {
    const plainTextDark = isDark && isPlainText;
    const htmlDark = isDark && !isPlainText;
    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      margin: 0;
      padding: 16px;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: ${plainTextDark ? "#e5e7eb" : "#1f2937"};
      background: ${htmlDark ? "#f8f9fa" : "transparent"};
      word-wrap: break-word;
      overflow-wrap: break-word;
      overflow: hidden;
    }
    img { max-width: 100%; height: auto; }
    a { color: ${plainTextDark ? "#60a5fa" : "#3b82f6"}; }
    a[data-link] { cursor: pointer; }
    blockquote {
      border-left: 3px solid ${plainTextDark ? "#4b5563" : "#d1d5db"};
      margin: 8px 0;
      padding: 4px 12px;
      color: ${plainTextDark ? "#9ca3af" : "#6b7280"};
    }
    pre { overflow-x: auto; }
    table { max-width: 100%; }
  </style>
</head>
<body>${bodyHtml}<script>(function () {
  function sendHeight() {
    try { window.parent.postMessage({ type: 'height', value: document.body.scrollHeight }, '*'); } catch (e) {}
  }
  new ResizeObserver(sendHeight).observe(document.body);
  sendHeight();
  document.addEventListener('click', function (e) {
    var el = e.target;
    while (el && el.tagName !== 'A') el = el.parentElement;
    if (!el) return;
    var href = el.getAttribute('data-link');
    if (!href) return;
    e.preventDefault();
    try { window.parent.postMessage({ type: 'link', href: href }, '*'); } catch (e2) {}
  });
})();<\/script>
</body>
</html>`;
  }, [bodyHtml, isDark, isPlainText]);

  // Receive height updates and link clicks from the sandboxed iframe via postMessage.
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;
      const data = e.data as { type: string; value?: unknown; href?: unknown };
      if (data?.type === "height") {
        const h = Number(data.value);
        if (h > 0 && iframeRef.current) iframeRef.current.style.height = h + "px";
      } else if (data?.type === "link") {
        const href = String(data.href ?? "");
        if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:")) {
          openUrl(href).catch((err) => console.error("Failed to open link:", err));
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

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
        sandbox="allow-scripts"
        srcDoc={srcdoc}
        className={`w-full border-0 ${isDark && !isPlainText ? "rounded-md" : ""}`}
        style={{ overflow: "hidden", minHeight: "40px" }}
        title="Email content"
      />
    </div>
  );
}

function escapeCidRegex(cid: string): string {
  return cid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Replaces every <a href="…"> with <a data-link="…"> (no href) before the
// content is injected into the sandboxed iframe. The inline script sends a
// postMessage to the parent on click; the parent calls openUrl to open
// the URL in the system browser.
function rewriteLinksForSrcdoc(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("a[href]").forEach((el) => {
    const href = el.getAttribute("href") ?? "";
    el.setAttribute("data-link", href);
    el.removeAttribute("href");
  });
  return doc.body.innerHTML;
}
