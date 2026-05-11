import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { UserIcon, ArrowRight } from "lucide-react";

export interface MergeCandidate {
  keepId: string;
  keepEmail: string;
  keepName: string | null;
  mergeId: string;
  mergeEmail: string;
  mergeName: string | null;
}

interface ContactMergeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  candidates: MergeCandidate[];
  onMerge: (keepId: string, mergeId: string) => void;
}

export function ContactMergeDialog({ isOpen, onClose, candidates, onMerge }: ContactMergeDialogProps) {
  if (candidates.length === 0) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Merge Contacts" width="w-96">
        <div className="p-4 text-sm text-text-tertiary text-center">
          No duplicate contacts found.
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Merge Duplicate Contacts" width="w-full max-w-lg">
      <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
        {candidates.map((c) => (
          <div
            key={`${c.keepId}-${c.mergeId}`}
            className="flex items-center gap-3 p-3 rounded-lg border border-border-primary bg-bg-secondary"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <UserIcon size={14} className="text-text-tertiary shrink-0" />
                <span className="text-xs font-medium text-text-primary truncate">
                  {c.keepName ?? c.keepEmail}
                </span>
              </div>
              <div className="text-[0.625rem] text-text-tertiary truncate mt-0.5">
                {c.keepEmail}
              </div>
            </div>

            <ArrowRight size={14} className="text-text-tertiary shrink-0" />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <UserIcon size={14} className="text-text-tertiary shrink-0" />
                <span className="text-xs font-medium text-text-primary truncate">
                  {c.mergeName ?? c.mergeEmail}
                </span>
              </div>
              <div className="text-[0.625rem] text-text-tertiary truncate mt-0.5">
                {c.mergeEmail}
              </div>
            </div>

            <Button
              variant="primary"
              size="xs"
              onClick={() => onMerge(c.keepId, c.mergeId)}
            >
              Merge
            </Button>
          </div>
        ))}
      </div>
    </Modal>
  );
}
