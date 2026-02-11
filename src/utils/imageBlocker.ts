/**
 * Utility functions for blocking/restoring remote images in email HTML.
 * Preserves data: and cid: URIs, only blocks http/https remote images.
 */

/**
 * Strip remote images from HTML by moving src to data-blocked-src.
 * Also strips remote url() references in inline styles.
 */
export function stripRemoteImages(html: string): string {
  // Replace <img src="http..."> with data-blocked-src
  let result = html.replace(
    /(<img\b[^>]*?)(\ssrc\s*=\s*)(["'])(https?:\/\/[^"']*)\3/gi,
    '$1 data-blocked-src=$3$4$3 src=$3$3',
  );

  // Replace background-image: url(http...) in inline styles
  result = result.replace(
    /url\(\s*(["']?)(https?:\/\/[^)"']*)\1\s*\)/gi,
    'url($1$1)',
  );

  return result;
}

/**
 * Restore previously blocked remote images by moving data-blocked-src back to src.
 */
export function restoreRemoteImages(html: string): string {
  return html.replace(
    /(<img\b[^>]*?)\sdata-blocked-src\s*=\s*(["'])(https?:\/\/[^"']*)\2([^>]*?)\ssrc\s*=\s*(["'])\5/gi,
    '$1 src=$2$3$2$4',
  );
}

/**
 * Check if an HTML string contains any blocked images.
 */
export function hasBlockedImages(html: string): boolean {
  return /data-blocked-src\s*=\s*["']https?:\/\//i.test(html);
}
