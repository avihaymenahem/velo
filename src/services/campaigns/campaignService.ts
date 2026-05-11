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

  for (const recipient of recipients) {
    await enqueuePendingOperation(
      campaign.account_id,
      "send_campaign_email",
      `campaign:${campaignId}:${recipient.contact_id}`,
      {
        campaignId,
        contactId: recipient.contact_id,
        templateId: campaign.template_id,
      },
      campaignId,
    );
  }

  await updateCampaignStatus(campaignId, "sent");
  await incrementSentCount(campaignId);
}
