import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";
import { Button } from "./Button";

interface InputField {
  key: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
}

interface InputDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => void;
  title: string;
  fields: InputField[];
  submitLabel?: string;
}

export function InputDialog({
  isOpen,
  onClose,
  onSubmit,
  title,
  fields,
  submitLabel,
}: InputDialogProps) {
  const { t } = useTranslation();
  const resolvedSubmitLabel = submitLabel ?? t("inputDialog.save");

  const buildInitial = useCallback(
    () =>
      Object.fromEntries(
        fields.map((f) => [f.key, f.defaultValue ?? ""]),
      ),
    [fields],
  );

  const [values, setValues] = useState<Record<string, string>>(buildInitial);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Reset values when the dialog opens or fields change
  useEffect(() => {
    if (isOpen) {
      setValues(buildInitial());
      const id = setTimeout(() => firstInputRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [isOpen, buildInitial]);

  const isValid = fields.every((f) => {
    const required = f.required ?? true;
    return !required || values[f.key]?.trim();
  });

  const handleSubmit = () => {
    if (!isValid) return;
    onSubmit(values);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && fields.length === 1 && isValid) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} width="w-96">
      <div className="p-4 space-y-3" onKeyDown={handleKeyDown}>
        {fields.map((field, i) => (
          <div key={field.key}>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              {field.label}
            </label>
            <input
              ref={i === 0 ? firstInputRef : undefined}
              type="text"
              value={values[field.key] ?? ""}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
              }
              placeholder={field.placeholder}
              className="w-full bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent focus:outline-none placeholder:text-text-tertiary"
            />
          </div>
        ))}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            {t("inputDialog.cancel")}
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!isValid}>
            {resolvedSubmitLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
