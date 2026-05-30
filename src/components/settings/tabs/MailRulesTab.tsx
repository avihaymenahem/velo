import { Section } from "./shared";
import { t } from "@/i18n";
import { LabelEditor } from "@/components/settings/LabelEditor";
import { FilterEditor } from "@/components/settings/FilterEditor";
import { SmartLabelEditor } from "@/components/settings/SmartLabelEditor";
import { SmartFolderEditor } from "@/components/settings/SmartFolderEditor";
import { QuickStepEditor } from "@/components/settings/QuickStepEditor";

export function MailRulesTab() {
  return (
    <>
      <Section title={t("settings.mailRules.sections.labels")}>
        <p className="text-xs text-text-tertiary mb-3">
          {t("settings.mailRules.labelsDesc")}
        </p>
        <LabelEditor />
      </Section>

      <Section title={t("settings.mailRules.sections.filters")}>
        <p className="text-xs text-text-tertiary mb-3">
          {t("settings.mailRules.filtersDesc")}
        </p>
        <FilterEditor />
      </Section>

      <Section title={t("settings.mailRules.sections.smartLabels")}>
        <p className="text-xs text-text-tertiary mb-3">
          {t("settings.mailRules.smartLabelsDesc")}
        </p>
        <SmartLabelEditor />
      </Section>

      <Section title={t("settings.mailRules.sections.smartFolders")}>
        <p className="text-xs text-text-tertiary mb-3">
          {t("settings.mailRules.smartFoldersDesc")}{" "}
          <code className="bg-bg-tertiary px-1 rounded">is:unread</code>,{" "}
          <code className="bg-bg-tertiary px-1 rounded">from:</code>,{" "}
          <code className="bg-bg-tertiary px-1 rounded">has:attachment</code>,{" "}
          <code className="bg-bg-tertiary px-1 rounded">after:</code>.
        </p>
        <SmartFolderEditor />
      </Section>

      <Section title={t("settings.mailRules.sections.quickSteps")}>
        <p className="text-xs text-text-tertiary mb-3">
          {t("settings.mailRules.quickStepsDesc")}
        </p>
        <QuickStepEditor />
      </Section>
    </>
  );
}
