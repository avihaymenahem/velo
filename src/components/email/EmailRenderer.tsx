import { useRef, useCallback, useEffect, useMemo, useState } from "react";
import { ImageOff } from "lucide-react";
import { t } from "@/i18n";
import { openUrl } from "@tauri-apps/plugin-opener";
import { stripRemoteImages, hasBlockedImages } from "@/utils/imageBlocker";
import { addToAllowlist } from "@/services/db/imageAllowlist";
import { sanitizeHtml } from "@/utils/sanitize";
import { transformPlainText, transformHtml, FW_CSS, FW_DARK_CSS, FW_JS } from "@/utils/forwardedMessage";
import { useUIStore } from "@/stores/uiStore";
import { useComposerStore } from "@/stores/composerStore";
import { parseMailtoUrl } from "@/utils/mailtoParser";

interface EmailRendererProps {
  html: string | null;
  text: string | null;
  blockImages?: boolean;
  senderAddress?: string | null;
  accountId?: string | null;
  senderAllowlisted?: boolean;
  cidMap?: Map<string, string>;
  cidFailed?: Set<string>;
}

export function EmailRenderer({
  html,
  text,
  blockImages = false,
  senderAddress,
  accountId,
  senderAllowlisted = false,
  cidMap,
  cidFailed,
}: EmailRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const rafRef = useRef<number>(0);
  // Per-instance nonce so the parent can identify messages from THIS iframe
  // without relying on e.source, which WKWebView returns as an opaque proxy
  // object for sandboxed null-origin iframes (never === contentWindow).
  const nonceRef = useRef<string>(Math.random().toString(36).slice(2));
  const [overrideShow, setOverrideShow] = useState(false);

  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark"
    || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  const shouldBlock = blockImages && !senderAllowlisted && !overrideShow;

  const sanitizedBody = useMemo(() => {
    if (!html) return null;
    // Hard safety cap: bodies above this threshold are not rendered as HTML.
    // The plain-text fallback path takes over (sanitizedBody === null triggers
    // the `<pre>${escapeHtml(text)}</pre>` branch in `bodyHtml` below).
    const MAX_BODY_BYTES = 10 * 1024 * 1024;
    if (html.length > MAX_BODY_BYTES) return null;
    return sanitizeHtml(stripOversizedDataImages(html));
  }, [html]);

  const isPlainText = !sanitizedBody;

  const bodyHtml = useMemo(() => {
    let body = sanitizedBody
      ? transformHtml(sanitizedBody)
      : transformPlainText(text ?? "");

    if (shouldBlock && sanitizedBody) {
      body = stripRemoteImages(body);
    }

    // Replace cid: references inline before building the Blob URL — no postMessage needed.
    // If already resolved: embed the asset:// URL directly.
    // If failed: embed an SVG placeholder.
    // Otherwise: transparent GIF so the img element exists in the DOM (height tracking).
    if (sanitizedBody) {
      body = body.replace(
        /\ssrc\s*=\s*["']cid:([^"']+)["']/gi,
        (_, rawCid: string) => {
          const cid = rawCid.trim().replace(/[<>]/g, "");
          const resolved = cidMap?.get(cid);
          if (resolved) return ` src="${resolved}"`;
          if (cidFailed?.has(cid)) {
            return ` src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' fill='%23e5e7eb' rx='4'/%3E%3Cpath d='M4 17l4-4 3 3 4-5 5 6H4z' fill='%239ca3af'/%3E%3C/svg%3E" style="opacity:0.4;width:48px;height:48px;object-fit:contain"`;
          }
          return ` src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"`;
        }
      );
    }

    // Rewrite anchor hrefs to data-link so the iframe never navigates; clicks
    // are forwarded to the parent via postMessage.
    if (sanitizedBody) {
      body = rewriteLinksForSrcdoc(body);
    }

    // Hint WebKit to defer image decode and skip off-screen images. Without these,
    // every <img> in the document is decoded eagerly on iframe load, producing a
    // full RGBA texture resident in the WebContent process — even for images far
    // below the fold. With lazy loading + async decoding, WebKit only allocates
    // texture memory for images currently intersecting the viewport.
    if (sanitizedBody) {
      body = body.replace(/<img\b(?![^>]*\bloading=)/gi, '<img loading="lazy" decoding="async"');
    }

    return body;
  }, [sanitizedBody, text, shouldBlock, cidMap, cidFailed]);

  const blocked = useMemo(() => {
    if (!shouldBlock || !sanitizedBody) return false;
    return hasBlockedImages(stripRemoteImages(sanitizedBody));
  }, [shouldBlock, sanitizedBody]);

  const nonce = nonceRef.current;
  const srcdoc = useMemo(() => {
    const plainTextDark = isDark && isPlainText;
    const htmlDark = isDark && !isPlainText;
    return `<!DOCTYPE html>
<html>
<head>
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
  <style>
    /* WKWebView quirk: without explicit height:auto, the body collapses to the
       iframe's initial viewport height when overflow:hidden is set, causing
       scrollHeight to report the wrong (clamped) value. */
    html {
      height: auto !important;
      min-height: 0 !important;
      ${htmlDark ? "filter: invert(1) hue-rotate(180deg);" : ""}
    }
    body {
      margin: 0;
      padding: 16px;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: ${plainTextDark ? "#e5e7eb" : "#1f2937"};
      background: ${plainTextDark ? "#1e1e2e" : "transparent"};
      word-wrap: break-word;
      overflow-wrap: break-word;
      overflow-x: hidden;
      overflow-y: visible;
      height: auto !important;
      min-height: 0 !important;
    }
    img { max-width: 100%; height: auto; ${htmlDark ? "filter: invert(1) hue-rotate(180deg);" : ""} }
    video, canvas, svg image { ${htmlDark ? "filter: invert(1) hue-rotate(180deg);" : ""} }
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
    ${FW_CSS}
    ${isDark ? FW_DARK_CSS : ""}
  </style>
  <script>(function() {
    var NONCE = '${nonce}';
    document.addEventListener('click', function(e) {
      var a = e.target && e.target.closest ? e.target.closest('a[data-link]') : null;
      if (!a) return;
      e.preventDefault();
      window.parent.postMessage({ type: 'link', nonce: NONCE, href: a.getAttribute('data-link') || '' }, '*');
    });
    window.addEventListener('message', function(e) {
      if (e.data && e.data.type === 'getHeight' && e.data.nonce === NONCE) sendHeight();
    });
    var lastH = 0;
    function sendHeight() {
      var h = Math.max(
        document.body ? document.body.scrollHeight : 0,
        document.body ? document.body.offsetHeight : 0,
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight
      );
      if (h === lastH) return;
      lastH = h;
      window.parent.postMessage({ type: 'height', nonce: NONCE, h: h }, '*');
    }
    function init() {
      var ro = new ResizeObserver(sendHeight);
      ro.observe(document.documentElement);
      if (document.body) ro.observe(document.body);
      sendHeight();
      ${FW_JS}
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  })();</script>
</head>
<body>${bodyHtml}</body>
</html>`;
  }, [bodyHtml, isDark, isPlainText]);

  // Unmount cleanup: navigate to about:blank to force WebKit to destroy the
  // document and release all decoded image textures and GPU allocations immediately.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      const iframe = iframeRef.current;
      if (iframe) iframe.src = "about:blank";
    };
  }, []);

  // srcdoc + message handling.
  //
  // The message listener is attached BEFORE setting iframe.srcdoc so we never miss
  // the initial ResizeObserver height report that fires as soon as the iframe
  // document renders — previously the listener was attached in onLoad (too late).
  //
  // srcdoc is used instead of blob: URLs because WebKit's frame-src CSP enforcement
  // does not reliably allow blob: as same-origin even when frame-src includes 'self'.
  // srcdoc is inline content and is never subject to frame-src restrictions. ✓
  //
  // Security: sandbox="allow-scripts" is preserved. A sandboxed iframe always gets
  // null origin regardless of srcdoc vs blob:, so the model is identical. ✓
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const instanceNonce = nonceRef.current;
    const onMessage = (e: MessageEvent) => {
      const msg = e.data as { type: string; nonce?: string; h?: number; href?: string } | null;
      if (!msg?.type || msg.nonce !== instanceNonce) return;

      if (msg.type === "height" && typeof msg.h === "number" && msg.h > 0) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          if (iframeRef.current) iframeRef.current.style.height = msg.h + "px";
        });
      } else if (msg.type === "link") {
        const href = msg.href ?? "";
        if (href.startsWith("mailto:")) {
          const { to, cc, bcc, subject } = parseMailtoUrl(href);
          useComposerStore.getState().openComposer({ to, cc, bcc, subject });
        } else if (href.startsWith("http://") || href.startsWith("https://")) {
          openUrl(href).catch((err) => console.error("Failed to open link:", err));
        }
      }
    };

    // Attach before setting srcdoc — ResizeObserver inside the iframe fires early
    window.addEventListener("message", onMessage);

    // Belt-and-suspenders: explicitly request height after load in case the
    // ResizeObserver message arrived before the listener was ready
    const onLoad = () => {
      iframe.contentWindow?.postMessage({ type: "getHeight", nonce: instanceNonce }, "*");
    };
    iframe.addEventListener("load", onLoad);

    iframe.srcdoc = srcdoc;

    return () => {
      window.removeEventListener("message", onMessage);
      iframe.removeEventListener("load", onLoad);
    };
  }, [srcdoc]);

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
            {t("email.renderer.imagesHidden")}
          </span>
          <button
            onClick={handleLoadImages}
            className="text-accent hover:text-accent-hover font-medium"
          >
            {t("email.renderer.loadImages")}
          </button>
          {senderAddress && accountId && (
            <button
              onClick={handleAlwaysLoad}
              className="text-accent hover:text-accent-hover font-medium"
            >
              {t("email.renderer.alwaysLoadFromSender")}
            </button>
          )}
        </div>
      )}
      <iframe
        ref={iframeRef}
        sandbox="allow-scripts"
        className={`w-full border-0 ${isDark && !isPlainText ? "rounded-lg ring-1 ring-inset ring-black/10" : ""}`}
        style={{ overflow: "hidden", minHeight: "120px" }}
        title={t("email.renderer.iframeTitle")}
      />
    </div>
  );
}

// Threshold above which an inline base64 image is considered "oversized" and replaced
// with a 1×1 placeholder. 100 KB of base64 ≈ 75 KB of decoded image — large enough to
// fit normal small icons / button graphics, small enough to never accumulate to the
// tens-of-MB scale that quoted reply chains produce.
const MAX_INLINE_DATA_URI_LEN = 100_000;

// Pure string scan that replaces `src="data:image/...;base64,..."` whose payload
// exceeds the threshold with a transparent-GIF data URI. The regex's character class
// `[^"']+` is fully linear (no backtracking), so even on a 50 MB body it finishes
// in milliseconds without touching the DOM.
function stripOversizedDataImages(html: string): string {
  return html.replace(
    /\ssrc\s*=\s*["']data:image\/[^;"']+;base64,([^"']+)["']/gi,
    (match, payload: string) => {
      if (payload.length <= MAX_INLINE_DATA_URI_LEN) return match;
      return ` src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"`;
    },
  );
}

// Replaces every <a href="…"> with <a data-link="…"> (no href) before the
// srcdoc is created. This prevents any in-frame navigation; clicks are
// forwarded to the parent via postMessage by the inline script.
function rewriteLinksForSrcdoc(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("a[href]").forEach((el) => {
    const href = el.getAttribute("href") ?? "";
    el.setAttribute("data-link", href);
    el.removeAttribute("href");
  });
  return doc.body.innerHTML;
}
