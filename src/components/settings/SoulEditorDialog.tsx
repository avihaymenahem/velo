import { useState, useEffect, useRef } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { getSoul, saveSoul } from "@/services/ai/soulService";
import { t } from "@/i18n";

interface SoulEditorDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SoulEditorDialog({ isOpen, onClose }: SoulEditorDialogProps) {
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setContent(getSoul());
      const id = setTimeout(() => textareaRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [isOpen]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveSoul(content);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("soulEditor.title")} width="w-[500px]">
      <div onKeyDown={handleKeyDown}>
        <div className="p-4">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t("soulEditor.placeholder")}
            className="w-full h-[300px] bg-bg-tertiary text-text-primary text-xs font-mono p-3 rounded-md border border-border-primary focus:border-accent focus:outline-none placeholder:text-text-tertiary resize-none"
          />
        </div>
        <div className="px-4 py-3 border-t border-border-primary flex justify-between items-center">
          <span className="text-xs text-text-tertiary">
            {t("soulEditor.restartToApply")}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              {t("soulEditor.cancel")}
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={isSaving}>
              {isSaving ? t("common.saving") : t("soulEditor.save")}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}