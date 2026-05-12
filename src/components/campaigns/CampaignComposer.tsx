import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/ui/Modal";
import { CampaignRecipientPicker } from "./CampaignRecipientPicker";
import { CampaignTemplatePicker } from "./CampaignTemplatePicker";
import { useCampaignStore } from "@/stores/campaignStore";
import { campaignTemplates } from "@/constants/campaignTemplates";

interface CampaignComposerProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
}

type Step = "name" | "template" | "recipients" | "preview";

export function CampaignComposer({ isOpen, onClose, accountId }: CampaignComposerProps) {
  const { t } = useTranslation();
  const createCampaign = useCampaignStore((s) => s.createCampaign);

  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName("");
    setTemplateId("");
    setSelectedContactIds([]);
    setStep("name");
    setCreating(false);
  }, [isOpen]);

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    await createCampaign({
      accountId,
      name: name.trim(),
      templateId: templateId || undefined,
    });
    setCreating(false);
    onClose();
  }

  const canNext = step === "name" ? name.trim().length > 0 : true;

  function nextStep() {
    if (step === "name") setStep("template");
    else if (step === "template") setStep("recipients");
    else if (step === "recipients") setStep("preview");
  }

  function prevStep() {
    if (step === "template") setStep("name");
    else if (step === "recipients") setStep("template");
    else if (step === "preview") setStep("recipients");
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('campaign.newCampaign')} width="w-[32rem]">
      <div className="p-4 space-y-4">
        {/* Step indicator */}
        <div className="flex items-center gap-2 text-xs text-text-tertiary">
          {(["name", "template", "recipients", "preview"] as Step[]).map((s, i) => (
            <span key={s} className="flex items-center gap-1">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[0.625rem] font-medium ${
                  step === s
                    ? "bg-accent text-white"
                    : ["name", "template", "recipients", "preview"].indexOf(step) > i
                      ? "bg-accent/20 text-accent"
                      : "bg-bg-secondary text-text-tertiary"
                }`}
              >
                {i + 1}
              </span>
              <span className={step === s ? "text-text-primary font-medium" : ""}>
                {t(`campaign.step${s.charAt(0).toUpperCase() + s.slice(1)}`)}
              </span>
              {i < 3 && <span className="text-text-tertiary/40 mx-0.5">—</span>}
            </span>
          ))}
        </div>

        {/* Step 1: Name */}
        {step === "name" && (
          <div className="space-y-2">
            <label className="text-sm text-text-primary font-medium">{t('campaign.campaignName')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('campaign.campaignNamePlaceholder')}
              className="w-full px-3 py-2 bg-bg-secondary border border-border-primary rounded-lg text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-accent"
              autoFocus
            />
          </div>
        )}

        {/* Step 2: Template */}
        {step === "template" && (
          <div className="space-y-2">
            <label className="text-sm text-text-primary font-medium">{t('campaign.selectTemplate')}</label>
            <CampaignTemplatePicker
              templates={campaignTemplates}
              selectedTemplateId={templateId}
              onSelect={(id) => setTemplateId(id ?? "")}
            />
          </div>
        )}

        {/* Step 3: Recipients */}
        {step === "recipients" && (
          <div className="space-y-2">
            <label className="text-sm text-text-primary font-medium">{t('campaign.selectRecipients')}</label>
            <CampaignRecipientPicker
              accountId={accountId}
              selectedIds={selectedContactIds}
              onChange={setSelectedContactIds}
            />
          </div>
        )}

        {/* Step 4: Preview */}
        {step === "preview" && (
          <div className="space-y-3">
            <div className="text-sm text-text-primary font-medium">{t('campaign.campaignSummary')}</div>
            <div className="glass-panel rounded-lg p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-text-tertiary">{t('campaign.campaignName')}</span>
                <span className="text-text-primary">{name.trim()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-tertiary">{t('campaign.selectTemplate')}</span>
                <span className="text-text-primary">
                  {templateId ? campaignTemplates.find((t) => t.id === templateId)?.name ?? "Unknown" : t('campaign.noTemplate')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-tertiary">{t('campaign.recipients')}</span>
                <span className="text-text-primary">{selectedContactIds.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-tertiary">{t('campaign.status')}</span>
                <span className="text-text-tertiary">{t('campaign.statusDraft')}</span>
              </div>
            </div>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={step === "name" ? onClose : prevStep}
            className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            {step === "name" ? t('common.cancel') : t('common.back')}
          </button>
          {step === "preview" ? (
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg transition-colors disabled:opacity-50"
            >
              {creating ? t('campaign.creating') : t('campaign.createCampaign')}
            </button>
          ) : (
            <button
              onClick={nextStep}
              disabled={!canNext}
              className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg transition-colors disabled:opacity-50"
            >
              {t('campaign.next')}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
