import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/react";
import { Shield, ShieldCheck, ShieldAlert, ChevronDown, ChevronUp } from "lucide-react";
import { detectJurisdiction, evaluateRules, aggregateResults } from "@/services/compliance/ruleEngine";
import { getActiveProfiles, insertCheck } from "@/services/db/complianceProfiles";
import type { ComplianceViolation, ComplianceCheckContext } from "@/services/compliance/types";
import { useComposerStore } from "@/stores/composerStore";

interface CompliancePanelProps {
  editor: Editor | null;
  accountId: string;
  subject: string;
  bodyHtml: string;
  recipients: string[];
  onViolationsChange?: (count: number) => void;
}

export function CompliancePanel({ editor, accountId, subject, bodyHtml, recipients, onViolationsChange }: CompliancePanelProps) {
  const { t } = useTranslation();
  const [score, setScore] = useState<number | null>(null);
  const [violations, setViolations] = useState<ComplianceViolation[]>([]);
  const [expanded, setExpanded] = useState(false);
  const hasErrors = violations.some((v) => v.severity === "error");

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const activeProfiles = await getActiveProfiles();
      if (cancelled) return;

      if (recipients.length === 0) return;

      const recipientObjs = recipients.map((r) => ({ email: r }));
      const matched = detectJurisdiction(recipientObjs, activeProfiles);
      if (matched.length === 0) return;

      const hasSignature = bodyHtml.includes("{{signature}}") || bodyHtml.includes("signature") || bodyHtml.includes("-- ");
      const hasUnsubscribe = bodyHtml.toLowerCase().includes("unsubscribe") || bodyHtml.includes("{{unsubscribe}}");
      const hasAttachments = bodyHtml.toLowerCase().includes("attachment");

      const context: ComplianceCheckContext = {
        subject: subject || "",
        bodyHtml: bodyHtml || "",
        senderEmail: "",
        recipients: recipientObjs,
        hasSignature,
        hasUnsubscribe,
        hasAttachments,
      };

      const results = matched.map((p) => evaluateRules(p, context));
      const aggregated = aggregateResults(results);
      if (cancelled) return;

      setScore(aggregated.score);
      setViolations(aggregated.violations);
      onViolationsChange?.(aggregated.violations.length);

      insertCheck({
        accountId,
        profileIds: matched.map((p) => p.id).join(","),
        score: aggregated.score,
        violationsJson: JSON.stringify(aggregated.violations),
      }).catch(() => {});
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [accountId, subject, bodyHtml, recipients, onViolationsChange]);

  const getScoreColor = useCallback(() => {
    if (score === null) return "text-text-tertiary";
    if (score >= 90) return "text-success";
    if (score >= 70) return "text-warning";
    return "text-danger";
  }, [score]);

  const getScoreBg = useCallback(() => {
    if (score === null) return "bg-bg-tertiary";
    if (score >= 90) return "bg-success/10";
    if (score >= 70) return "bg-warning/10";
    return "bg-danger/10";
  }, [score]);

  if (score === null) return null;

  const ScoreIcon = score >= 90 ? ShieldCheck : hasErrors ? ShieldAlert : Shield;
  const severityColors: Record<string, string> = {
    error: "text-danger",
    warning: "text-warning",
    info: "text-info",
  };
  const severityBgs: Record<string, string> = {
    error: "bg-danger/10",
    warning: "bg-warning/10",
    info: "bg-info/10",
  };

  const handleFix = (fixAction: string | undefined) => {
    if (!fixAction) return;
    switch (fixAction) {
      case "add_signature": {
        if (editor) {
          editor.chain().focus().insertContent("<p>{{signature}}</p>").run();
          useComposerStore.getState().setBodyHtml(editor.getHTML());
        }
        break;
      }
      case "add_unsubscribe": {
        if (editor) {
          editor.chain().focus().insertContent('<p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>').run();
          useComposerStore.getState().setBodyHtml(editor.getHTML());
        }
        break;
      }
      case "fix_subject_case": {
        const state = useComposerStore.getState();
        const val = state.subject;
        if (val && val === val.toUpperCase() && val.length > 10) {
          const titleCased = val.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
          state.setSubject(titleCased);
        }
        break;
      }
    }
  };

  const fixActionLabels: Record<string, string> = {
    add_signature: t("compliance.fixAddSignature"),
    add_unsubscribe: t("compliance.fixAddUnsubscribe"),
    fix_subject_case: t("compliance.fixSubjectCase"),
    add_attachment: t("compliance.fixAddAttachment"),
    add_disclaimer: t("compliance.fixAddDisclaimer"),
    add_retention_notice: t("compliance.fixAddRetentionNotice"),
    remove_sensitive_data: t("compliance.fixRemoveSensitiveData"),
    add_missing_content: t("compliance.fixAddMissingContent"),
  };

  return (
    <div className={`mx-3 my-1.5 px-3 py-1.5 rounded-lg border ${getScoreBg()} border-border-secondary flex items-center gap-2 relative`}>
      <ScoreIcon size={14} className={`shrink-0 ${getScoreColor()}`} />
      <span className={`text-xs font-medium ${getScoreColor()}`}>
        {score}/100
      </span>
      {violations.length > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-primary transition-colors"
        >
          {violations.length} {t("compliance.violations")}
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      )}
      {violations.length === 0 && (
        <span className="text-xs text-text-tertiary">{t("compliance.allGood")}</span>
      )}

      {expanded && violations.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 mx-3 p-2 rounded-lg border border-border-primary bg-bg-primary shadow-lg z-10">
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {violations.map((v, i) => (
              <div key={`${v.ruleId}-${i}`} className={`flex items-start gap-2 px-2 py-1.5 rounded ${severityBgs[v.severity] ?? "bg-bg-secondary"}`}>
                <span className={`text-xs ${severityColors[v.severity] ?? "text-text-tertiary"} shrink-0 mt-0.5`}>
                  {v.severity === "error" ? "!" : v.severity === "warning" ? "?" : "i"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-text-primary">{t(v.messageKey, v.messageKey)}</p>
                  {v.fixAction && (
                    <button
                      onClick={() => handleFix(v.fixAction)}
                      className="text-xs text-accent hover:text-accent-hover mt-0.5 transition-colors"
                    >
                      {fixActionLabels[v.fixAction] ?? v.fixAction}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
