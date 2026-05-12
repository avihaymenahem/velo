import { useState, useEffect } from "react";
import { useComposerStore } from "@/stores/composerStore";
import { useAccountStore } from "@/stores/accountStore";
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
  const [previewSig, setPreviewSig] = useState<DbSignature | null>(null);

  useEffect(() => {
    if (!isOpen || !activeAccountId) return;
    let cancelled = false;
    getSignaturesForAccount(activeAccountId).then((sigs) => {
      if (!cancelled) setSignatures(sigs);
    });
    return () => { cancelled = true; };
  }, [isOpen, activeAccountId]);

  if (signatures.length === 0) return null;

  const handleChange = (id: string) => {
    if (id === "") {
      setSignatureId(null);
      setSignatureHtml("");
      setPreviewSig(null);
      return;
    }
    const sig = signatures.find((s) => s.id === id);
    if (sig) {
      setSignatureId(sig.id);
      setSignatureHtml(sig.body_html);
      setPreviewSig(sig);
    }
  };

  return (
    <div className="space-y-1">
      <select
        value={signatureId ?? ""}
        onChange={(e) => handleChange(e.target.value)}
        onMouseEnter={(e) => {
          const id = e.currentTarget.value;
          if (id) {
            const sig = signatures.find((s) => s.id === id);
            if (sig) setPreviewSig(sig);
          }
        }}
        className="text-[0.625rem] bg-bg-tertiary text-text-secondary border border-border-primary rounded px-1.5 py-0.5 w-full"
      >
        <option value="">No signature</option>
        {signatures.map((sig) => (
          <option key={sig.id} value={sig.id}>
            {sig.name}
          </option>
        ))}
      </select>
      {previewSig && (
        <div className="border border-border-primary rounded-md bg-white shadow-sm">
          <iframe
            srcDoc={previewSig.body_html}
            sandbox="allow-same-origin"
            className="w-full border-0 rounded"
            style={{ height: 80 }}
            title="Signature preview"
          />
        </div>
      )}
    </div>
  );
}
