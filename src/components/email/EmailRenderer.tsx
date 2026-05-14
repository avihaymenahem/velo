import { useRef, useCallback, useEffect, useMemo, useState } from "react";
import { ImageOff } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { stripRemoteImages, hasBlockedImages } from "@/utils/imageBlocker";
import { addToAllowlist } from "@/services/db/imageAllowlist";
import { escapeHtml, sanitizeHtml } from "@/utils/sanitize";
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
  const listenerRef = useRef<((e: MessageEvent) => void) | null>(null);
  const rafRef = useRef<number>(0);
  // Refs so the stable handleLoad callback can always read the latest values.
  const cidMapRef = useRef(cidMap);
  const cidFailedRef = useRef(cidFailed);
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

    if (shouldBlock && sanitizedBody) {
      body = stripRemoteImages(body);
    }

    // Replace cid: src with a 1×1 transparent GIF placeholder + data-cid attribute.
    // Using a real src keeps the img element fully alive in WebKit's render tree so
    // that querySelectorAll('img[data-cid]') finds it; the srcdoc script then
    // replaces it with the actual data: URI via postMessage.
    if (sanitizedBody) {
      body = body.replace(
        /\ssrc\s*=\s*["']cid:([^"']+)["']/gi,
        (_, rawCid: string) => {
          const cid = rawCid.trim().replace(/[<>]/g, "");
          return ` src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" data-cid="${cid}"`;
        }
      );
    }

    // Rewrite anchor hrefs to data-link so the iframe never navigates; clicks
    // are forwarded to the parent via postMessage.
    if (sanitizedBody) {
      body = rewriteLinksForSrcdoc(body);
    }

    return body;
  }, [sanitizedBody, text, shouldBlock]);

  const blocked = useMemo(() => {
    if (!shouldBlock || !sanitizedBody) return false;
    return hasBlockedImages(stripRemoteImages(sanitizedBody));
  }, [shouldBlock, sanitizedBody]);

  const srcdoc = useMemo(() => {
    const plainTextDark = isDark && isPlainText;
    const htmlDark = isDark && !isPlainText;
    // Inline script handles three responsibilities so the iframe can run with
    // sandbox="allow-scripts" only (no allow-same-origin), which prevents the
    // parent's Tauri CSP from blocking remote images in email signatures.
    return `<!DOCTYPE html>
<html>
<head>
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
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
  <script>(function() {
    // 1. Link clicks — forward to parent for openUrl / openComposer
    document.addEventListener('click', function(e) {
      var a = e.target && e.target.closest ? e.target.closest('a[data-link]') : null;
      if (!a) return;
      e.preventDefault();
      window.parent.postMessage({ type: 'link', href: a.getAttribute('data-link') || '' }, '*');
    });

    // 2. Messages from parent — CID injection and height requests
    window.addEventListener('message', function(e) {
      var d = e.data;
      if (!d) return;
      if (d.type === 'cid') {
        var imgs = document.querySelectorAll('img[data-cid]');
        console.log('[CID-DBG iframe] got cid msg, img[data-cid] count:', imgs.length, 'map keys:', Object.keys(d.map));
        imgs.forEach(function(img) {
          var cid = (img.getAttribute('data-cid') || '').replace(/[<>]/g, '').trim();
          var found = !!(cid && d.map[cid]);
          console.log('[CID-DBG iframe] cid="' + cid + '" → match=' + found);
          if (found) img.setAttribute('src', d.map[cid]);
        });
      } else if (d.type === 'cidFailed') {
        var failed = d.cids || [];
        document.querySelectorAll('img[data-cid]').forEach(function(img) {
          var cid = (img.getAttribute('data-cid') || '').replace(/[<>]/g, '').trim();
          if (failed.indexOf(cid) === -1) return;
          img.setAttribute('src', "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' fill='%23e5e7eb' rx='4'/%3E%3Cpath d='M4 17l4-4 3 3 4-5 5 6H4z' fill='%239ca3af'/%3E%3C/svg%3E");
          img.style.opacity = '0.4';
          img.style.width = '48px';
          img.style.height = '48px';
          img.style.objectFit = 'contain';
        });
      } else if (d.type === 'getHeight') {
        window.parent.postMessage({ type: 'height', h: document.documentElement.scrollHeight }, '*');
      }
    });

    // 3. Height tracking via ResizeObserver — only sends when height actually
    //    changes to avoid flooding the parent during text selection.
    var lastH = 0;
    new ResizeObserver(function() {
      var h = document.documentElement.scrollHeight;
      if (h === lastH) return;
      lastH = h;
      window.parent.postMessage({ type: 'height', h: h }, '*');
    }).observe(document.documentElement);
  })();</script>
</head>
<body>${bodyHtml}</body>
</html>`;
  }, [bodyHtml, isDark, isPlainText]);

  useEffect(() => {
    return () => {
      if (listenerRef.current) window.removeEventListener("message", listenerRef.current);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Keep cidMapRef current and push updates to the iframe whenever cidMap changes.
  useEffect(() => {
    cidMapRef.current = cidMap;
    if (!cidMap || cidMap.size === 0) return;
    console.log(`[CID-DBG] sending postMessage cid to iframe, keys:`, [...cidMap.keys()]);
    const win = iframeRef.current?.contentWindow;
    if (!win) { console.warn("[CID-DBG] iframe contentWindow null — message not sent"); return; }
    win.postMessage({ type: "cid", map: Object.fromEntries(cidMap) }, "*");
  }, [cidMap]);

  // Push failed CIDs to the iframe so it can render a placeholder.
  useEffect(() => {
    cidFailedRef.current = cidFailed;
    if (!cidFailed || cidFailed.size === 0) return;
    iframeRef.current?.contentWindow?.postMessage(
      { type: "cidFailed", cids: [...cidFailed] }, "*"
    );
  }, [cidFailed]);

  const handleLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    // Remove stale listener from previous load
    if (listenerRef.current) window.removeEventListener("message", listenerRef.current);

    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow) return;
      const msg = e.data as { type: string; h?: number; href?: string } | null;
      if (!msg?.type) return;

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

    listenerRef.current = onMessage;
    window.addEventListener("message", onMessage);

    // By the time the iframe `load` event fires, its inline script has already run
    // and set up its own message listener — so we can send directly here without
    // waiting for the 'ready' postMessage (which fires before our listener is active).
    iframe.contentWindow?.postMessage({ type: "getHeight" }, "*");
    const map = cidMapRef.current;
    if (map && map.size > 0) {
      iframe.contentWindow?.postMessage({ type: "cid", map: Object.fromEntries(map) }, "*");
    }
    const failed = cidFailedRef.current;
    if (failed && failed.size > 0) {
      iframe.contentWindow?.postMessage({ type: "cidFailed", cids: [...failed] }, "*");
    }
  }, []); // stable — dynamic values accessed via refs

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
        onLoad={handleLoad}
        className={`w-full border-0 ${isDark && !isPlainText ? "rounded-md" : ""}`}
        style={{ overflow: "hidden", minHeight: "120px" }}
        title="Email content"
      />
    </div>
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
