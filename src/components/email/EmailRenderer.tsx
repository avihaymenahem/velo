import { useRef, useCallback, useEffect, useMemo, useState } from "react";
import { ImageOff } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { stripRemoteImages, hasBlockedImages } from "@/utils/imageBlocker";
import { addToAllowlist } from "@/services/db/imageAllowlist";
import { escapeHtml, sanitizeHtml } from "@/utils/sanitize";
import { useUIStore } from "@/stores/uiStore";
import type { DbAttachment } from "@/services/db/attachments";

interface EmailRendererProps {
  html: string | null;
  text: string | null;
  blockImages?: boolean;
  senderAddress?: string | null;
  accountId?: string | null;
  senderAllowlisted?: boolean;
  messageId?: string | null;
  inlineAttachments?: DbAttachment[];
}

export function EmailRenderer({
  html,
  text,
  blockImages = false,
  senderAddress,
  accountId,
  senderAllowlisted = false,
  messageId,
  inlineAttachments,
}: EmailRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [overrideShow, setOverrideShow] = useState(false);
  const [cidMap, setCidMap] = useState<Map<string, string>>(new Map());

  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark"
    || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  const shouldBlock = blockImages && !senderAllowlisted && !overrideShow;

  // Resolve cid: references by fetching inline attachment data
  useEffect(() => {
    if (!accountId || !messageId || !inlineAttachments?.length) return;

    const cidAttachments = inlineAttachments.filter(
      (a) => a.content_id && a.gmail_attachment_id,
    );
    if (cidAttachments.length === 0) return;

    let cancelled = false;

    (async () => {
      try {
        const { getEmailProvider } = await import("@/services/email/providerFactory");
        const provider = await getEmailProvider(accountId);
        const resolved = new Map<string, string>();

        await Promise.all(
          cidAttachments.map(async (att) => {
            try {
              const response = await provider.fetchAttachment(
                messageId,
                att.gmail_attachment_id!,
              );
              const base64 = response.data.replace(/-/g, "+").replace(/_/g, "/");
              resolved.set(att.content_id!, `data:${att.mime_type ?? "image/png"};base64,${base64}`);
            } catch {
              // Skip individual failures
            }
          }),
        );

        if (!cancelled && resolved.size > 0) {
          setCidMap(resolved);
        }
      } catch {
        // Non-critical — images just won't render
      }
    })();

    return () => { cancelled = true; };
  }, [accountId, messageId, inlineAttachments]);

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

    // Replace cid: references with resolved data URIs
    if (cidMap.size > 0) {
      body = body.replace(
        /\bcid:([^"'\s)]+)/gi,
        (match, cidRef: string) => cidMap.get(cidRef) ?? match,
      );
    }

    return body;
  }, [sanitizedBody, text, shouldBlock, cidMap]);

  const blocked = useMemo(() => {
    if (!shouldBlock || !sanitizedBody) return false;
    return hasBlockedImages(stripRemoteImages(sanitizedBody));
  }, [shouldBlock, sanitizedBody]);

  // Build the full srcdoc string including an injected script.
  // The iframe uses sandbox="allow-scripts allow-popups" WITHOUT allow-same-origin,
  // giving it a null origin so Tauri's CSP (bound to ipc://localhost) does not apply
  // to its content — remote images load freely for allowlisted senders.
  // The injected script is safe: email HTML is already DOMPurify-sanitised, and the
  // sandbox prevents the iframe from accessing parent DOM or Tauri APIs.
  const srcdoc = useMemo(() => {
    const plainTextDark = isDark && isPlainText;
    const htmlDark = isDark && !isPlainText;

    // Script communicates height updates and link clicks to the parent via postMessage.
    // Using string concatenation for the closing script tag avoids bundler issues.
    const script = `<scri` + `pt>(function(){`
      + `function sh(){var h=document.body?document.body.scrollHeight:0;`
      + `window.parent.postMessage({t:'h',v:h},'*');}`
      + `document.addEventListener('click',function(e){`
      + `var a=e.target&&e.target.closest?e.target.closest('a'):null;`
      + `if(a&&a.href){e.preventDefault();window.parent.postMessage({t:'l',u:a.href},'*');}`
      + `});`
      + `if(window.ResizeObserver){new ResizeObserver(sh).observe(document.body);}`
      + `window.addEventListener('load',sh);`
      + `setTimeout(sh,0);`
      + `})();</scri` + `pt>`;

    return `<!DOCTYPE html>
<html>
<head>
<style>
body{margin:0;padding:16px;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:14px;line-height:1.6;color:${plainTextDark ? "#e5e7eb" : "#1f2937"};background:${htmlDark ? "#f8f9fa" : "transparent"};word-wrap:break-word;overflow-wrap:break-word;overflow:hidden;}
img{max-width:100%;height:auto;}
a{color:${plainTextDark ? "#60a5fa" : "#3b82f6"};}
blockquote{border-left:3px solid ${plainTextDark ? "#4b5563" : "#d1d5db"};margin:8px 0;padding:4px 12px;color:${plainTextDark ? "#9ca3af" : "#6b7280"};}
pre{overflow-x:auto;}
table{max-width:100%;}
</style>
</head>
<body>${bodyHtml}${script}</body>
</html>`;
  }, [bodyHtml, isDark, isPlainText]);

  // Listen for postMessage events from the iframe (height + link clicks).
  // We re-register whenever srcdoc changes so we always have the freshest iframe ref.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleMessage = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow) return;
      const d = e.data as { t: string; v?: number; u?: string } | null;
      if (!d) return;
      if (d.t === "h" && d.v != null && d.v > 0) {
        iframe.style.height = d.v + "px";
      } else if (d.t === "l" && d.u) {
        openUrl(d.u).catch((err) => {
          console.error("Failed to open link:", err);
        });
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [srcdoc]);

  // Fallback: set height after load in case postMessage was missed.
  // Wrapped in try-catch because sandboxed iframes (no allow-same-origin) throw
  // a SecurityError when the parent tries to access contentWindow.document.
  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const body = iframe.contentWindow?.document?.body;
      if (!body) return;
      const height = body.scrollHeight;
      if (height > 0) iframe.style.height = height + "px";
    } catch {
      // Cross-origin sandbox — height is managed via postMessage
    }
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
        sandbox="allow-scripts allow-popups"
        srcDoc={srcdoc}
        className={`w-full border-0 ${isDark && !isPlainText ? "rounded-md" : ""}`}
        style={{ overflow: "hidden", minHeight: "100px" }}
        title="Email content"
        onLoad={handleIframeLoad}
      />
    </div>
  );
}
