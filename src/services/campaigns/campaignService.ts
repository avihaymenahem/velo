import {
  createCampaign as dbCreateCampaign,
  getCampaign,
} from "@/services/db/campaigns";
import {
  addRecipientsBulk,
  getRecipients,
} from "@/services/db/campaignRecipients";
import { getContactGroupIds } from "@/services/db/contactGroups";

export interface CampaignCreateInput {
  accountId: string;
  name: string;
  templateId?: string;
  segmentId?: string;
  recipientContactIds?: string[];
  groupId?: string;
  abTestConfig?: {
    variantA: { subject: string; body: string };
    variantB: { subject: string; body: string };
    splitRatio: number;
    testDurationHours: number;
  };
}

export async function createCampaign(
  input: CampaignCreateInput,
): Promise<string> {
  const campaignId = await dbCreateCampaign(
    input.accountId,
    input.name,
    input.templateId,
    input.segmentId,
  );

  let contactIds: string[] = [];
  if (input.recipientContactIds) {
    contactIds = input.recipientContactIds;
  } else if (input.groupId) {
    const members = await getContactGroupIds(input.groupId);
    contactIds = members.map((m) => m.contact_id);
  } else if (input.segmentId) {
    const { getContactSegments } = await import(
      "@/services/db/contactSegments"
    );
    const segments = await getContactSegments(input.accountId);
    const seg = segments.find((s) => s.id === input.segmentId);
    if (seg) {
      const { evaluateSegmentQuery } = await import(
        "@/services/contacts/segments"
      );
      contactIds = await evaluateSegmentQuery(input.accountId, seg.query);
    }
  }

  if (contactIds.length > 0) {
    await addRecipientsBulk(campaignId, contactIds);
  }

  if (input.abTestConfig) {
    const { createABTest } = await import("@/services/campaigns/abTesting");
    await createABTest(campaignId, {
      variantA: input.abTestConfig.variantA,
      variantB: input.abTestConfig.variantB,
      splitRatio: input.abTestConfig.splitRatio,
      testDurationHours: input.abTestConfig.testDurationHours,
      winnerId: null,
      startedAt: null,
      endedAt: null,
      significant: false,
      pValue: null,
    });
  }

  return campaignId;
}

export async function sendCampaign(campaignId: string): Promise<void> {
  const { updateCampaignStatus, incrementSentCount } = await import(
    "@/services/db/campaigns"
  );
  await updateCampaignStatus(campaignId, "sending");

  const recipients = await getRecipients(campaignId);

  const campaign = await getCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found");

  const { enqueuePendingOperation } = await import(
    "@/services/db/pendingOperations"
  );

  const { getABTestConfig, assignVariant, setRecipientVariant, createABTest } = await import(
    "@/services/campaigns/abTesting"
  );

  const abConfig = await getABTestConfig(campaignId);

  for (const recipient of recipients) {
    if (abConfig) {
      const variant = await assignVariant(recipient.contact_id, abConfig.splitRatio);
      await setRecipientVariant(campaignId, recipient.contact_id, variant);
    }

    await enqueuePendingOperation(
      campaign.account_id,
      "send_campaign_email",
      `campaign:${campaignId}:${recipient.contact_id}`,
      {
        campaignId,
        contactId: recipient.contact_id,
        templateId: campaign.template_id,
        variant: abConfig ? undefined : undefined,
      },
      campaignId,
    );
  }

  if (abConfig && !abConfig.startedAt) {
    abConfig.startedAt = Math.floor(Date.now() / 1000);
    await createABTest(campaignId, abConfig);
  }

  await updateCampaignStatus(campaignId, "sent");
  await incrementSentCount(campaignId);
}
