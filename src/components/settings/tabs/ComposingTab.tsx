import { useState, useEffect, useCallback } from "react";
import { useUIStore, type ComposerFontFamily, type ComposerFontSize } from "@/stores/uiStore";
import { getSetting, setSetting } from "@/services/db/settings";
import { Section, SettingRow, ToggleRow } from "./shared";
import { SignatureEditor } from "@/components/settings/SignatureEditor";
import { TemplateEditor } from "@/components/settings/TemplateEditor";
import { t } from "@/i18n";

export function ComposingTab() {
  const defaultReplyMode = useUIStore((s) => s.defaultReplyMode);
  const setDefaultReplyMode = useUIStore((s) => s.setDefaultReplyMode);
  const markAsReadBehavior = useUIStore((s) => s.markAsReadBehavior);
  const setMarkAsReadBehavior = useUIStore((s) => s.setMarkAsReadBehavior);
  const sendAndArchive = useUIStore((s) => s.sendAndArchive);
  const setSendAndArchive = useUIStore((s) => s.setSendAndArchive);
  const composerFontFamily = useUIStore((s) => s.composerFontFamily);
  const setComposerFontFamily = useUIStore((s) => s.setComposerFontFamily);
  const composerFontSize = useUIStore((s) => s.composerFontSize);
  const setComposerFontSize = useUIStore((s) => s.setComposerFontSize);

  const [undoSendDelay, setUndoSendDelay] = useState("5");

  useEffect(() => {
    getSetting("undo_send_delay_seconds").then((val) => {
      if (val) setUndoSendDelay(val);
    });
  }, []);

  const handleUndoDelayChange = useCallback(async (value: string) => {
    setUndoSendDelay(value);
    await setSetting("undo_send_delay_seconds", value);
  }, []);

  return (
    <>
      <Section title={t("settings.composing.sections.sending")}>
        <SettingRow label={t("settings.composing.undoSendDelay")}>
          <select
            value={undoSendDelay}
            onChange={(e) => handleUndoDelayChange(e.target.value)}
            className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
          >
            <option value="5">{t("settings.composing.undoSendDelay5s")}</option>
            <option value="10">{t("settings.composing.undoSendDelay10s")}</option>
            <option value="30">{t("settings.composing.undoSendDelay30s")}</option>
          </select>
        </SettingRow>
        <ToggleRow
          label={t("settings.composing.sendAndArchive")}
          description={t("settings.composing.sendAndArchiveDesc")}
          checked={sendAndArchive}
          onToggle={() => setSendAndArchive(!sendAndArchive)}
        />
      </Section>

      <Section title={t("settings.composing.sections.behavior")}>
        <SettingRow label={t("settings.composing.defaultReplyAction")}>
          <select
            value={defaultReplyMode}
            onChange={(e) => {
              setDefaultReplyMode(e.target.value as "reply" | "replyAll");
            }}
            className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
          >
            <option value="reply">{t("settings.composing.replyActionReply")}</option>
            <option value="replyAll">{t("settings.composing.replyActionReplyAll")}</option>
          </select>
        </SettingRow>
        <SettingRow label={t("settings.composing.markAsRead")}>
          <select
            value={markAsReadBehavior}
            onChange={(e) => {
              setMarkAsReadBehavior(e.target.value as "instant" | "2s" | "manual");
            }}
            className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
          >
            <option value="instant">{t("settings.composing.markAsReadInstant")}</option>
            <option value="2s">{t("settings.composing.markAsRead2s")}</option>
            <option value="manual">{t("settings.composing.markAsReadManual")}</option>
          </select>
        </SettingRow>
      </Section>

      <Section title={t("settings.composing.sections.style")}>
        <SettingRow label={t("settings.composing.defaultFont")}>
          <select
            value={composerFontFamily}
            onChange={(e) => setComposerFontFamily(e.target.value as ComposerFontFamily)}
            className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
          >
            <option value="system">{t("settings.composing.fontSystem")}</option>
            <option value="arial">Arial</option>
            <option value="calibri">Calibri</option>
            <option value="times">Times New Roman</option>
            <option value="courier">Courier New</option>
            <option value="georgia">Georgia</option>
            <option value="verdana">Verdana</option>
            <option value="avenir">Avenir</option>
            <option value="inter">Inter</option>
          </select>
        </SettingRow>
        <SettingRow label={t("settings.composing.defaultSize")}>
          <select
            value={composerFontSize}
            onChange={(e) => setComposerFontSize(e.target.value as ComposerFontSize)}
            className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
          >
            <option value="10px">10</option>
            <option value="12px">12</option>
            <option value="14px">14</option>
            <option value="16px">16</option>
            <option value="18px">18</option>
            <option value="20px">20</option>
            <option value="24px">24</option>
          </select>
        </SettingRow>
      </Section>

      <Section title={t("settings.composing.sections.signatures")}>
        <SignatureEditor />
      </Section>

      <Section title={t("settings.composing.sections.templates")}>
        <TemplateEditor />
      </Section>
    </>
  );
}
