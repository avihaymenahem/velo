import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { freshTestDb, runMigrations, getTestAccountId, seedAccount, MockTauriDb } from "./setup";

let db: MockTauriDb;

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn(() => {
      db = freshTestDb();
      return Promise.resolve(db);
    }),
  },
}));

vi.mock("@/services/contacts/segments", () => ({
  evaluateSegmentQuery: vi.fn(() => Promise.resolve([])),
}));

vi.mock("@/services/db/contactGroups", () => ({
  getContactGroupIds: vi.fn(() => Promise.resolve([])),
}));

vi.mock("@/utils/crypto", () => ({
  encryptValue: vi.fn((val: string) => Promise.resolve(`enc:${val}`)),
  decryptValue: vi.fn((val: string) => Promise.resolve(val.replace("enc:", ""))),
  isEncrypted: vi.fn((val: string) => val.startsWith("enc:")),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

describe("Integration: Campaigns", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { resetDb } = await import("@/services/db/connection");
    resetDb();
    await runMigrations();
    await seedAccount();
  });

  afterEach(() => {
    db?.close();
  });

  describe("Test #9: Campaign send flow", () => {
    it("creates a campaign, adds recipients, sends via queue", async () => {
      const contactId = "contact-1";
      const contactId2 = "contact-2";

      await db!.execute(
        "INSERT INTO contacts (id, email, display_name, frequency) VALUES ($1, $2, $3, 1)",
        [contactId, "alice@example.com", "Alice"],
      );
      await db!.execute(
        "INSERT INTO contacts (id, email, display_name, frequency) VALUES ($1, $2, $3, 1)",
        [contactId2, "bob@example.com", "Bob"],
      );

      const { createCampaign } = await import("@/services/campaigns/campaignService");
      const campaignId = await createCampaign({
        accountId: getTestAccountId(),
        name: "Test Campaign",
        recipientContactIds: [contactId, contactId2],
      });

      expect(campaignId).toBeTruthy();

      const campaigns = await db!.select<{ id: string; name: string; status: string }[]>(
        "SELECT id, name, status FROM campaigns WHERE id = $1",
        [campaignId],
      );
      expect(campaigns).toHaveLength(1);
      expect(campaigns[0]!.name).toBe("Test Campaign");
      expect(campaigns[0]!.status).toBe("draft");

      const recipients = await db!.select<{ contact_id: string }[]>(
        "SELECT contact_id FROM campaign_recipients WHERE campaign_id = $1 ORDER BY contact_id",
        [campaignId],
      );
      expect(recipients).toHaveLength(2);
      expect(recipients[0]!.contact_id).toBe(contactId);
      expect(recipients[1]!.contact_id).toBe(contactId2);

      const { sendCampaign } = await import("@/services/campaigns/campaignService");
      await sendCampaign(campaignId);

      const campaignAfter = await db!.select<{ status: string; sent_count: number }[]>(
        "SELECT status, sent_count FROM campaigns WHERE id = $1",
        [campaignId],
      );
      expect(campaignAfter[0]!.status).toBe("sent");
      expect(campaignAfter[0]!.sent_count).toBe(1);

      const pendingOps = await db!.select<{ operation_type: string; resource_id: string; status: string }[]>(
        "SELECT operation_type, resource_id, status FROM pending_operations WHERE campaign_id = $1",
        [campaignId],
      );
      expect(pendingOps).toHaveLength(2);
      expect(pendingOps[0]!.operation_type).toBe("send_campaign_email");
      expect(pendingOps[0]!.status).toBe("pending");
    });

    it("creates campaign with group-based recipients", async () => {
      const groupId = "group-1";
      const contactIds = ["c1", "c2", "c3"];

      for (const cid of contactIds) {
        await db!.execute(
          "INSERT INTO contacts (id, email, display_name, frequency) VALUES ($1, $2, $3, 1)",
          [cid, `${cid}@example.com`, `Contact ${cid}`],
        );
      }
      await db!.execute(
        "INSERT INTO contact_groups (id, account_id, name) VALUES ($1, $2, $3)",
        [groupId, getTestAccountId(), "Test Group"],
      );
      for (const cid of contactIds) {
        await db!.execute(
          "INSERT INTO contact_group_pivot (contact_id, group_id) VALUES ($1, $2)",
          [cid, groupId],
        );
      }

      const mockGroups = await import("@/services/db/contactGroups");
      vi.mocked(mockGroups.getContactGroupIds).mockResolvedValue(
        contactIds.map((cid) => ({ contact_id: cid })),
      );

      const { createCampaign } = await import("@/services/campaigns/campaignService");
      const campaignId = await createCampaign({
        accountId: getTestAccountId(),
        name: "Group Campaign",
        groupId,
      });

      const recipients = await db!.select<{ contact_id: string }[]>(
        "SELECT contact_id FROM campaign_recipients WHERE campaign_id = $1 ORDER BY contact_id",
        [campaignId],
      );
      expect(recipients).toHaveLength(3);
      const ids = recipients.map((r) => r.contact_id).sort();
      expect(ids).toEqual(["c1", "c2", "c3"]);
    });
  });
});
