import { Section } from "./shared";
import { t } from "@/i18n";
import { ContactEditor } from "@/components/settings/ContactEditor";
import { SubscriptionManager } from "@/components/settings/SubscriptionManager";

export function PeopleTab() {
  return (
    <>
      <Section title={t("settings.people.sections.contacts")}>
        <p className="text-xs text-text-tertiary mb-3">
          {t("settings.people.contactsDesc")}
        </p>
        <ContactEditor />
      </Section>

      <Section title={t("settings.people.sections.subscriptions")}>
        <p className="text-xs text-text-tertiary mb-3">
          {t("settings.people.subscriptionsDesc")}
        </p>
        <SubscriptionManager />
      </Section>
    </>
  );
}
