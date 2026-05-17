import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Check } from "lucide-react";
import { useComposerStore } from "@/stores/composerStore";
import { useAccountStore } from "@/stores/accountStore";
import { useClickOutside } from "@/hooks/useClickOutside";
import {
  getSignaturesForAccount,
  type DbSignature,
} from "@/services/db/signatures";

export function SignatureSelector() {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const isOpen = useComposerStore((s) => s.isOpen);
  const signatureId = useComposerStore((s) => s.signatureId);
  const setSignatureHtml = useComposerStore((s) => s.setSignatureHtml);
  const setSignatureId = useComposerStore((s) => s.setSignatureId);
  const [signatures, setSignatures] = useState<DbSignature[]>([]);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useClickOutside(dropdownRef, () => setOpen(false));

  useEffect(() => {
    if (!isOpen || !activeAccountId) return;
    let cancelled = false;
    getSignaturesForAccount(activeAccountId).then((sigs) => {
      if (!cancelled) setSignatures(sigs);
    });
    return () => { cancelled = true; };
  }, [isOpen, activeAccountId]);

  const handleSelect = useCallback(
    (id: string) => {
      if (id === "") {
        setSignatureId(null);
        setSignatureHtml("");
      } else {
        const sig = signatures.find((s) => s.id === id);
        if (sig) {
          setSignatureId(sig.id);
          setSignatureHtml(sig.body_html);
        }
      }
      setOpen(false);
    },
    [signatures, setSignatureId, setSignatureHtml],
  );

  if (signatures.length === 0) return null;

  const currentSignature = signatures.find((s) => s.id === signatureId);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2 py-0.5 text-[0.625rem] bg-bg-tertiary text-text-primary border border-border-primary rounded hover:bg-bg-hover transition-colors"
      >
        <span className="truncate max-w-[120px] text-xs">
          {currentSignature?.name ?? "No signature"}
        </span>
        <ChevronDown
          size={12}
          className={`shrink-0 text-text-secondary transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 bottom-full mb-1 py-1 w-64 rounded-lg border border-border-primary bg-bg-primary shadow-lg z-50 glass-panel">
          <div
            className="px-3 py-1.5 text-[0.625rem] font-medium text-text-tertiary uppercase tracking-wider"
            onClick={(e) => {
              e.stopPropagation();
              handleSelect("");
            }}
          >
            <button className="w-full text-left hover:bg-bg-hover rounded px-1.5 py-0.5 transition-colors">
              No signature
            </button>
          </div>
          <div className="border-t border-border-primary my-1" />
          {signatures.map((sig) => {
            const isActive = sig.id === signatureId;
            return (
              <button
                key={sig.id}
                onClick={() => handleSelect(sig.id)}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-left transition-colors ${
                  isActive
                    ? "bg-accent/8 text-accent"
                    : "text-text-primary hover:bg-bg-hover"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate leading-tight">
                    {sig.name}
                  </div>
                </div>
                {isActive && (
                  <Check size={12} className="shrink-0 text-accent" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
