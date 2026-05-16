import { invoke } from "@tauri-apps/api/core";
import { getAccount } from "../db/accounts";
import { buildImapConfig } from "./imapConfigBuilder";
import { ensureFreshToken } from "../oauth/oauthTokenManager";
import type { DbAttachment } from "../db/attachments";

interface CidImageRequest {
  attachmentDbId: string;
  messageId: string;
  partId: string;
  mimeType: string | null;
  contentId: string | null;
}

interface CidImageResult {
  attachmentDbId: string;
  localPath: string;
}

/**
 * Resolves all IMAP inline CID images for a single email in ONE Rust command.
 * Binary data never crosses the WKWebView XPC bridge — Rust writes to disk,
 * JS receives only file paths. Single tokio task → same jemalloc arena →
 * pages freed at iteration N are reused at iteration N+1 (O(max_one) footprint).
 */
export async function resolveImapCidImages(
  accountId: string,
  messageId: string,
  cidAtts: DbAttachment[],
): Promise<Map<string, string>> {
  const account = await getAccount(accountId);
  if (!account?.imap_host) return new Map();

  let accessToken: string | undefined;
  if (account.auth_method === "oauth2") {
    accessToken = await ensureFreshToken(account);
  }
  const config = buildImapConfig(account, accessToken);

  const requests: CidImageRequest[] = cidAtts.map((att) => ({
    attachmentDbId: att.id,
    messageId,
    partId: att.imap_part_id!,
    mimeType: att.mime_type ?? null,
    // Strip angle brackets — mail-parser stores Content-ID without them.
    contentId: att.content_id ? att.content_id.replace(/[<>]/g, "").trim() : null,
  }));

  console.log(`[CID-RS] invoke start msg=${messageId} requests=${requests.length}`);
  console.time(`[CID-RS] ${messageId}`);
  const results = await invoke<CidImageResult[]>(
    "imap_batch_resolve_cid_images",
    { config, requests },
  );
  console.timeEnd(`[CID-RS] ${messageId}`);
  console.log(`[CID-RS] invoke done msg=${messageId} results=${results.length}`);

  return new Map(results.map((r) => [r.attachmentDbId, r.localPath]));
}
