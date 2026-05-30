/**
 * Utility functions for blocking/restoring remote images in email HTML.
 * Preserves data: and cid: URIs, only blocks http/https remote images.
 */

// Sentinel used for CSS background-image URLs that have been stripped.
// Must be a valid but inert data URI so WebKit doesn't attempt a network request.
const BLOCKED_BG_SENTINEL = "data:image/blocked";

/**
 * Strip remote images from HTML by moving src to data-blocked-src.
 * Also strips remote url() references in inline styles, replacing them with
 * a detectable sentinel so hasBlockedImages() can show the banner even for
 * emails that use only CSS background-image (common in newsletters/promos).
 */
export function stripRemoteImages(html: string): string {
  // Replace <img src="http..."> with data-blocked-src
  let result = html.replace(
    /(<img\b[^>]*?)(\ssrc\s*=\s*)(["'])(https?:\/\/[^"']*)\3/gi,
    '$1 data-blocked-src=$3$4$3 src=$3$3',
  );

  // Replace background-image: url(http...) with a detectable sentinel.
  // Using url('data:image/blocked') instead of url('') so hasBlockedImages()
  // can detect blocked CSS backgrounds and show the banner.
  result = result.replace(
    /url\(\s*(["']?)(https?:\/\/[^)"']*)\1\s*\)/gi,
    `url('${BLOCKED_BG_SENTINEL}')`,
  );

  return result;
}

/**
 * Restore previously blocked remote images by moving data-blocked-src back to src.
 * CSS background-image restoration is handled automatically: when overrideShow
 * is set, shouldBlock becomes false and stripRemoteImages is never called, so
 * the original sanitizedBody (with real URLs) is used directly.
 */
export function restoreRemoteImages(html: string): string {
  return html.replace(
    /(<img\b[^>]*?)\sdata-blocked-src\s*=\s*(["'])(https?:\/\/[^"']*)\2([^>]*?)\ssrc\s*=\s*(["'])\5/gi,
    '$1 src=$2$3$2$4',
  );
}

/**
 * Check if an HTML string contains any blocked images — either img tags with
 * data-blocked-src or CSS background-image replaced with the blocked sentinel.
 */
export function hasBlockedImages(html: string): boolean {
  return (
    /data-blocked-src\s*=\s*["']https?:\/\//i.test(html) ||
    html.includes(BLOCKED_BG_SENTINEL)
  );
}
