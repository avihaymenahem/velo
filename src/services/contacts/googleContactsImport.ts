import { withTransaction } from "@/services/db/connection";
import { getSetting, setSetting } from "@/services/db/settings";
import { getAllAccounts } from "@/services/db/accounts";
import { getGmailClient } from "@/services/gmail/tokenManager";
import { normalizeEmail } from "@/utils/emailUtils";

const PEOPLE_API_BASE = "https://people.googleapis.com/v1";
const LAST_IMPORT_KEY_PREFIX = "google_contacts_imported_at:";

/** Re-import at most once a day; the address book changes slowly. */
const IMPORT_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Multi-row upsert chunk size: 3 params per row, safely under SQLite's 999 limit. */
const UPSERT_CHUNK_SIZE = 200;

const PAGE_SIZE = 1000;

interface GooglePerson {
  names?: Array<{ displayName?: string }>;
  emailAddresses?: Array<{ value?: string }>;
}

interface PeoplePage {
  connections?: GooglePerson[];
  otherContacts?: GooglePerson[];
  nextPageToken?: string;
}

interface ImportedContact {
  email: string;
  name: string | null;
}

/**
 * Import the account's Google address book (saved contacts plus the
 * auto-collected "Other contacts" Gmail itself autocompletes from) into the
 * local contacts table. This surfaces people the user corresponds with
 * outside the locally synced mail window — e.g. contacts Gmail suggests
 * that never appear as a sender in synced messages.
 *
 * Requires the contacts.readonly / contacts.other.readonly scopes; accounts
 * authorized before those scopes were added get a 403, which is logged and
 * skipped until the user re-authenticates.
 *
 * Returns the number of contacts imported.
 */
export async function importGoogleContactsForAccount(accountId: string): Promise<number> {
  const lastKey = `${LAST_IMPORT_KEY_PREFIX}${accountId}`;
  const last = parseInt((await getSetting(lastKey)) ?? "0", 10) || 0;
  if (Date.now() - last < IMPORT_INTERVAL_MS) return 0;

  const client = await getGmailClient(accountId);

  const contacts = new Map<string, ImportedContact>();
  const collect = (people: GooglePerson[] | undefined) => {
    for (const person of people ?? []) {
      const name = person.names?.[0]?.displayName?.trim() || null;
      for (const addr of person.emailAddresses ?? []) {
        if (!addr.value) continue;
        const email = normalizeEmail(addr.value);
        const at = email.indexOf("@");
        if (at < 1 || at === email.length - 1) continue;
        const existing = contacts.get(email);
        if (!existing) {
          contacts.set(email, { email, name });
        } else if (!existing.name && name) {
          existing.name = name;
        }
      }
    }
  };

  try {
    // Saved contacts
    let pageToken: string | undefined;
    do {
      const page: PeoplePage = await client.request<PeoplePage>(
        `${PEOPLE_API_BASE}/people/me/connections?personFields=names,emailAddresses&pageSize=${PAGE_SIZE}` +
          (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""),
      );
      collect(page.connections);
      pageToken = page.nextPageToken;
    } while (pageToken);

    // Auto-collected "Other contacts" — what Gmail's own compose suggests
    pageToken = undefined;
    do {
      const page: PeoplePage = await client.request<PeoplePage>(
        `${PEOPLE_API_BASE}/otherContacts?readMask=names,emailAddresses&pageSize=${PAGE_SIZE}` +
          (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""),
      );
      collect(page.otherContacts);
      pageToken = page.nextPageToken;
    } while (pageToken);
  } catch (err) {
    if (String(err).includes("403")) {
      console.warn(
        `[googleContacts] Account ${accountId} lacks the contacts scopes — re-authenticate to enable Google Contacts import.`,
      );
      return 0;
    }
    throw err;
  }

  if (contacts.size > 0) {
    await upsertImportedContacts([...contacts.values()]);
  }
  await setSetting(lastKey, String(Date.now()));
  return contacts.size;
}

/** Import Google contacts for every Gmail account. Intended to be fire-and-forget. */
export async function importGoogleContactsForAllAccounts(): Promise<void> {
  const accounts = await getAllAccounts();
  for (const account of accounts) {
    if (account.provider !== "gmail_api") continue;
    try {
      await importGoogleContactsForAccount(account.id);
    } catch (err) {
      console.warn(`[googleContacts] Import failed for account ${account.id}:`, err);
    }
  }
}

async function upsertImportedContacts(contacts: ImportedContact[]): Promise<void> {
  await withTransaction(async (tx) => {
    for (let i = 0; i < contacts.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = contacts.slice(i, i + UPSERT_CHUNK_SIZE);
      const values = chunk
        .map((_, idx) => {
          const base = idx * 3;
          return `($${base + 1}, $${base + 2}, $${base + 3}, 1, unixepoch(), unixepoch())`;
        })
        .join(", ");
      const params = chunk.flatMap((c) => [crypto.randomUUID(), c.email, c.name]);
      // Import is not an interaction: existing frequency (a ranking signal
      // from actual correspondence) is left untouched on conflict, and
      // existing display names — including user edits — are never clobbered.
      await tx.execute(
        `INSERT INTO contacts (id, email, display_name, frequency, created_at, updated_at)
         VALUES ${values}
         ON CONFLICT(email) DO UPDATE SET
           display_name = COALESCE(contacts.display_name, excluded.display_name),
           updated_at   = unixepoch()`,
        params,
      );
    }
  });
}
