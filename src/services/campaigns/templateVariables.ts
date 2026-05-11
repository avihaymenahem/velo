import { escapeHtml } from "@/utils/sanitize";
import { getContactById } from "@/services/db/contacts";

export interface CampaignVariableSource {
  contactId: string;
  accountId: string;
}

export async function resolveCampaignVariables(
  template: string,
  source: CampaignVariableSource,
): Promise<string> {
  if (!template.includes("{{")) return template;

  const contact = await getContactById(source.contactId);

  let result = template;

  const email = contact?.email ?? "";
  const displayName = contact?.display_name ?? "";
  const firstName = displayName.split(/\s+/)[0] ?? email.split("@")[0] ?? "";
  const company = email.includes("@") ? email.split("@")[1]?.split(".")[0] ?? "" : "";

  const replacements: Record<string, string> = {
    "{{email}}": email,
    "{{first_name}}": firstName,
    "{{company}}": company,
    "{{display_name}}": displayName,
  };

  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(key, escapeHtml(value));
  }

  return result;
}
