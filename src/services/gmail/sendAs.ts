import type { GmailClient } from "./client";
import { upsertAlias } from "../db/sendAsAliases";

interface GmailSendAsEntry {
  sendAsEmail: string;
  displayName?: string;
  replyToAddress?: string;
  isPrimary?: boolean;
  treatAsAlias?: boolean;
  verificationStatus?: string;
  signature?: string;
}

interface GmailSendAsResponse {
  sendAs: GmailSendAsEntry[];
}

/**
 * Fetch send-as aliases from Gmail API and store them locally.
 */
export async function fetchSendAsAliases(
  client: GmailClient,
  accountId: string,
): Promise<void> {
  const response = await client.request<GmailSendAsResponse>(
    "/settings/sendAs",
  );

  if (!response.sendAs) return;

  for (const entry of response.sendAs) {
    await upsertAlias({
      accountId,
      email: entry.sendAsEmail,
      displayName: entry.displayName ?? null,
      replyToAddress: entry.replyToAddress ?? null,
      isPrimary: entry.isPrimary ?? false,
      treatAsAlias: entry.treatAsAlias ?? true,
      verificationStatus: entry.verificationStatus ?? "accepted",
    });
  }
}
