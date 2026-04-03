import { type ReactNode, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";
import { Button } from "./Button";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string | ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "primary" | "danger";
  loading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = "primary",
  loading = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const confirmRef = useRef<HTMLButtonElement>(null);

  const resolvedConfirmLabel = confirmLabel ?? t("confirmDialog.confirm");
  const resolvedCancelLabel = cancelLabel ?? t("confirmDialog.cancel");

  useEffect(() => {
    if (isOpen) {
      // Delay focus to allow modal transition
      const id = setTimeout(() => confirmRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onConfirm();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} width="w-80">
      <div className="p-4" onKeyDown={handleKeyDown}>
        <div className="text-sm text-text-secondary mb-4">{message}</div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {resolvedCancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={variant === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "..." : resolvedConfirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
