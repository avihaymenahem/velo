import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { HelpCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CONTEXTUAL_TIPS } from "@/constants/helpContent";
import { navigateToHelp } from "@/router/navigate";

interface HelpTooltipProps {
  contextId: string;
  size?: number;
}

export function HelpTooltip({ contextId, size = 14 }: HelpTooltipProps) {
  const { t } = useTranslation("help");
  const tip = CONTEXTUAL_TIPS[contextId];
  const [open, setOpen] = useState(false);
  const iconRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => { clearTimeout(closeTimeout.current); };
  }, []);

  if (!tip) return null;

  const show = () => {
    clearTimeout(closeTimeout.current);
    setOpen(true);
  };

  const hide = () => {
    closeTimeout.current = setTimeout(() => setOpen(false), 150);
  };

  const handleLearnMore = useCallback(() => {
    setOpen(false);
    navigateToHelp(tip.helpTopic);
  }, [tip.helpTopic]);

  const rect = iconRef.current?.getBoundingClientRect();

  return (
    <>
      <button
        ref={iconRef}
        type="button"
        onMouseEnter={show}
        onMouseLeave={hide}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center text-text-tertiary hover:text-text-secondary transition-colors"
        aria-label={t(tip.title)}
      >
        <HelpCircle size={size} />
      </button>
      {open &&
        rect &&
        createPortal(
          <div
            ref={popoverRef}
            onMouseEnter={show}
            onMouseLeave={hide}
            className="fixed z-[9999] w-64 p-3 rounded-lg bg-bg-primary border border-border-primary shadow-lg text-sm animate-in fade-in duration-150"
            style={{
              top: rect.bottom + 6,
              left: Math.max(8, rect.left - 100),
            }}
          >
            <p className="font-medium text-text-primary mb-1">{t(tip.title)}</p>
            <p className="text-text-secondary text-xs leading-relaxed">{t(tip.body)}</p>
            <button
              onClick={handleLearnMore}
              className="mt-2 text-xs text-accent hover:text-accent-hover transition-colors"
            >
              {t("learnMore")}
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
