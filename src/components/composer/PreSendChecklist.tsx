import { useState, useEffect, useCallback } from "react";
import { Shield, ShieldCheck, ShieldAlert, Loader2, RefreshCw, ExternalLink, X, Check, AlertTriangle, Info } from "lucide-react";
import { checkDomainDns, extractDomain, type DnsCheckResult } from "@/services/domainChecker";
import { checkContentQuality, type ContentQualityResult } from "@/services/ai/aiService";
import { Button } from "@/components/ui/Button";

export interface PreSendChecklistProps {
  subject: string;
  bodyHtml: string;
  bodyText: string;
  recipients: string[];
  senderEmail: string;
  isBulk: boolean;
  onClose: () => void;
  onProceed: () => void;
}

interface ChecklistItem {
  id: string;
  label: string;
  status: "pending" | "loading" | "pass" | "warn" | "fail";
  message?: string;
}

const SPAM_KEYWORDS = [
  "free", "guaranteed", "act now", "limited time", "click here",
  "congratulations", "exclusive offer", "risk-free", "no obligation",
  "urgent", "limited supply", "buy now", "order now", "don't delete",
  "amazing", "fantastic", "incredible", "once in a lifetime",
];

function extractTextFromHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function countLinks(html: string): number {
  const matches = html.match(/<a\s[^>]*href=["']([^"']+)["']/gi);
  return matches?.length ?? 0;
}

function hasUnsubscribeLink(html: string): boolean {
  return html.toLowerCase().includes("unsubscribe");
}

function getSubjectScoreWarnings(subject: string): { score: number; warnings: string[] } {
  let score = 0;
  const warnings: string[] = [];

  if (subject.length === 0) {
    return { score: 0, warnings: ["Subject line is empty"] };
  }

  if (subject.length > 9 && subject === subject.toUpperCase()) {
    score -= 15;
    warnings.push("Subject line is in ALL CAPS");
  }

  if (subject.length > 100) {
    score -= 5;
    warnings.push("Subject line is very long (>100 chars)");
  }

  const exclamationCount = (subject.match(/!/g) ?? []).length;
  if (exclamationCount >= 3) {
    score -= 10;
    warnings.push("Excessive exclamation marks in subject");
  }

  const spamInSubject = SPAM_KEYWORDS.filter((kw) => subject.toLowerCase().includes(kw));
  if (spamInSubject.length > 0) {
    score -= 10 * spamInSubject.length;
    warnings.push(`Subject contains spam trigger words: ${spamInSubject.join(", ")}`);
  }

  return { score: Math.max(score, -50), warnings };
}

function getBodyScoreWarnings(bodyHtml: string, bodyText: string): { score: number; warnings: string[] } {
  let score = 0;
  const warnings: string[] = [];

  const text = extractTextFromHtml(bodyHtml);

  const spamInBody = SPAM_KEYWORDS.filter((kw) => text.toLowerCase().includes(kw));
  if (spamInBody.length > 0) {
    score -= 5 * spamInBody.length;
    warnings.push(`Body contains spam trigger words: ${spamInBody.slice(0, 3).join(", ")}`);
  }

  const linkCount = countLinks(bodyHtml);
  if (linkCount > 2) {
    score -= 5 * (linkCount - 2);
    warnings.push(`High link count (${linkCount} links) — may trigger spam filters`);
  }

  const textLen = text.length;
  const imageMatches = bodyHtml.match(/<img[^>]+>/gi);
  const imageCount = imageMatches?.length ?? 0;
  if (imageCount > 0 && textLen > 0) {
    const imageHtmlLen = imageMatches?.reduce((sum, img) => sum + img.length, 0) ?? 0;
    const ratio = imageHtmlLen / (imageHtmlLen + bodyHtml.length);
    if (ratio > 0.6) {
      score -= 10;
      warnings.push("Image-to-text ratio is too high");
    }
  }

  const exclamationCount = (text.match(/!/g) ?? []).length;
  if (exclamationCount >= 5) {
    score -= 5;
    warnings.push("Excessive exclamation marks in body");
  }

  if (!bodyText || bodyText.length < 20) {
    score -= 10;
    warnings.push("No plain-text alternative available");
  }

  return { score: Math.max(score, -50), warnings };
}

export function PreSendChecklist({
  subject,
  bodyHtml,
  bodyText,
  recipients,
  senderEmail,
  isBulk,
  onClose,
  onProceed,
}: PreSendChecklistProps) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [dnsResult, setDnsResult] = useState<DnsCheckResult | null>(null);
  const [aiQuality, setAiQuality] = useState<ContentQualityResult | null>(null);
  const [score, setScore] = useState(100);
  const [checking, setChecking] = useState(true);

  const updateItem = useCallback((id: string, updates: Partial<ChecklistItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  }, []);

  useEffect(() => {
    const runChecks = async () => {
      setChecking(true);

      // Initialize all items
      const baseItems: ChecklistItem[] = [
        { id: "subject", label: "Subject line check", status: "loading" },
        { id: "spam", label: "Spam keyword check", status: "loading" },
        { id: "links", label: "Link analysis", status: "loading" },
        { id: "images", label: "Image-to-text ratio", status: "loading" },
      ];

      if (isBulk) {
        baseItems.push({ id: "unsubscribe", label: "Unsubscribe link present", status: "loading" });
        baseItems.push({ id: "recipients", label: "Recipient count check", status: "loading" });
      }

      baseItems.push({ id: "dns", label: "Sender domain DNS records", status: "loading" });
      baseItems.push({ id: "quality", label: "AI content quality score", status: "loading" });

      setItems(baseItems);

      // Run all checks in parallel
      const subjectResult = getSubjectScoreWarnings(subject);
      const bodyResult = getBodyScoreWarnings(bodyHtml, bodyText);
      const domain = extractDomain(senderEmail);
      const linkCount = countLinks(bodyHtml);
      const imageMatches = bodyHtml.match(/<img[^>]+>/gi);
      const imageCount = imageMatches?.length ?? 0;

      const [dnsCheck, qualityCheck] = await Promise.all([
        domain ? checkDomainDns(domain).catch(() => null) : Promise.resolve(null),
        checkContentQuality(subject, bodyHtml, { isBulk, recipientCount: recipients.length }).catch(() => null),
      ]);

      let totalScore = 100;
      const allWarnings: string[] = [];

      // Subject
      totalScore += subjectResult.score;
      allWarnings.push(...subjectResult.warnings);
      updateItem("subject", {
        status: subjectResult.warnings.length === 0 ? "pass" : "warn",
        message: subjectResult.warnings.length > 0
          ? subjectResult.warnings.join("; ")
          : `Length: ${subject.length} chars`,
      });

      // Spam keywords
      const bodyTextPlain = extractTextFromHtml(bodyHtml);
      const spamInBody = SPAM_KEYWORDS.filter((kw) => bodyTextPlain.toLowerCase().includes(kw));
      const hasSpam = subjectResult.warnings.length > 0 || spamInBody.length > 0;
      totalScore += bodyResult.score;
      allWarnings.push(...bodyResult.warnings);
      updateItem("spam", {
        status: hasSpam ? "warn" : "pass",
        message: hasSpam
          ? `${subjectResult.warnings.length + spamInBody.length} trigger words found`
          : "No spam trigger words detected",
      });

      // Links
      totalScore -= Math.max(0, (linkCount - 2) * 5);
      updateItem("links", {
        status: linkCount === 0 ? "pass" : linkCount <= 3 ? "pass" : "warn",
        message: `${linkCount} link${linkCount !== 1 ? "s" : ""} found`,
      });

      // Images
      updateItem("images", {
        status: imageCount === 0 ? "pass" : "pass",
        message: `${imageCount} image${imageCount !== 1 ? "s" : ""} found`,
      });

      // Unsubscribe (bulk only)
      if (isBulk) {
        const hasUnsub = hasUnsubscribeLink(bodyHtml);
        if (!hasUnsub) totalScore -= 5;
        updateItem("unsubscribe", {
          status: hasUnsub ? "pass" : "warn",
          message: hasUnsub ? "Unsubscribe link detected" : "Consider adding an unsubscribe link for bulk emails",
        });
      }

      // Recipients (bulk only)
      if (isBulk) {
        updateItem("recipients", {
          status: recipients.length <= 5 ? "pass" : recipients.length <= 20 ? "warn" : "fail",
          message: `${recipients.length} recipient${recipients.length !== 1 ? "s" : ""}`,
        });
      }

      // DNS
      setDnsResult(dnsCheck);
      if (dnsCheck) {
        const dnsIssues: string[] = [];
        if (!dnsCheck.spf) dnsIssues.push("SPF");
        if (!dnsCheck.dkim) dnsIssues.push("DKIM");
        if (!dnsCheck.dmarc) dnsIssues.push("DMARC");

        if (dnsIssues.length === 0) {
          updateItem("dns", { status: "pass", message: "SPF, DKIM, and DMARC all configured" });
        } else {
          totalScore -= 10 * dnsIssues.length;
          allWarnings.push(`Missing DNS records: ${dnsIssues.join(", ")}`);
          updateItem("dns", {
            status: "warn",
            message: `Missing: ${dnsIssues.join(", ")}`,
          });
        }
      } else {
        updateItem("dns", {
          status: "warn",
          message: "Could not check DNS records",
        });
      }

      // AI quality
      setAiQuality(qualityCheck);
      if (qualityCheck) {
        totalScore = Math.round((totalScore + qualityCheck.score) / 2);
        allWarnings.push(...qualityCheck.issues);
        updateItem("quality", {
          status: qualityCheck.score >= 70 ? "pass" : qualityCheck.score >= 40 ? "warn" : "fail",
          message: `Score: ${qualityCheck.score}/100`,
        });
      } else {
        updateItem("quality", {
          status: "warn",
          message: "AI quality check unavailable",
        });
      }

      setScore(Math.max(0, Math.min(100, totalScore)));
      setChecking(false);
    };

    runChecks();
  }, [subject, bodyHtml, bodyText, recipients, senderEmail, isBulk, updateItem]);

  const getScoreIcon = () => {
    if (score >= 70) return ShieldCheck;
    if (score >= 40) return Shield;
    return ShieldAlert;
  };

  const getScoreColor = () => {
    if (score >= 70) return "text-success";
    if (score >= 40) return "text-warning";
    return "text-danger";
  };

  const getScoreBg = () => {
    if (score >= 70) return "bg-success/10 border-success/20";
    if (score >= 40) return "bg-warning/10 border-warning/20";
    return "bg-danger/10 border-danger/20";
  };

  const getScoreLabel = () => {
    if (score >= 70) return "Ready to send";
    if (score >= 40) return "Review recommended";
    return "Issues found";
  };

  const ScoreIcon = getScoreIcon();

  const statusIcon = (status: ChecklistItem["status"]) => {
    switch (status) {
      case "loading":
        return <Loader2 size={14} className="animate-spin text-text-tertiary" />;
      case "pass":
        return <Check size={14} className="text-success" />;
      case "warn":
        return <AlertTriangle size={14} className="text-warning" />;
      case "fail":
        return <X size={14} className="text-danger" />;
      default:
        return <Info size={14} className="text-text-tertiary" />;
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-bg-primary border border-border-primary rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-secondary">
          <div className="flex items-center gap-2.5">
            <Shield size={18} className="text-text-primary" />
            <h2 className="text-base font-semibold text-text-primary">Pre-send Checklist</h2>
          </div>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary p-1 rounded transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Score */}
        <div className={`mx-5 mt-4 p-4 rounded-xl border ${getScoreBg()}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${getScoreColor()} bg-current/10`}>
                <ScoreIcon size={20} className={getScoreColor()} />
              </div>
              <div>
                <div className={`text-lg font-bold ${getScoreColor()}`}>
                  {score}/100
                  {checking && <Loader2 size={14} className="inline animate-spin ml-2" />}
                </div>
                <div className="text-xs text-text-tertiary mt-0.5">{getScoreLabel()}</div>
              </div>
            </div>
            {!checking && (
              <button
                onClick={() => window.location.reload()}
                className="text-xs text-accent hover:text-accent-hover flex items-center gap-1 transition-colors"
              >
                <RefreshCw size={12} />
                Recheck
              </button>
            )}
          </div>

          {/* Score bar */}
          <div className="mt-3 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                score >= 70 ? "bg-success" : score >= 40 ? "bg-warning" : "bg-danger"
              }`}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>

        {/* Checklist Items */}
        <div className="px-5 py-4 space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                item.status === "pass"
                  ? "border-success/20 bg-success/5"
                  : item.status === "warn"
                    ? "border-warning/20 bg-warning/5"
                    : item.status === "fail"
                      ? "border-danger/20 bg-danger/5"
                      : "border-border-secondary bg-bg-secondary/50"
              }`}
            >
              <div className="mt-0.5 shrink-0">{statusIcon(item.status)}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text-primary">{item.label}</div>
                {item.message && (
                  <div className="text-xs text-text-tertiary mt-0.5">{item.message}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* DNS Details */}
        {dnsResult && (
          <div className="mx-5 mb-2 p-3 rounded-lg bg-bg-secondary border border-border-secondary">
            <div className="text-xs font-medium text-text-secondary mb-2 flex items-center gap-1.5">
              <ExternalLink size={12} />
              DNS Records for {extractDomain(senderEmail)}
            </div>
            <div className="space-y-1.5">
              {[
                { label: "SPF", value: dnsResult.spf, ok: !!dnsResult.spf },
                { label: "DKIM", value: dnsResult.dkim, ok: !!dnsResult.dkim },
                { label: "DMARC", value: dnsResult.dmarc, ok: !!dnsResult.dmarc },
              ].map((rec) => (
                <div key={rec.label} className="flex items-center gap-2">
                  {rec.ok ? (
                    <Check size={10} className="text-success shrink-0" />
                  ) : (
                    <X size={10} className="text-danger shrink-0" />
                  )}
                  <span className={`text-xs ${rec.ok ? "text-text-secondary" : "text-danger"}`}>
                    {rec.label}
                  </span>
                  {rec.value && (
                    <span className="text-[10px] text-text-tertiary truncate flex-1 ml-1">{rec.value}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Quality Details */}
        {aiQuality && aiQuality.issues.length > 0 && (
          <div className="mx-5 mb-2 p-3 rounded-lg bg-warning/5 border border-warning/20">
            <div className="text-xs font-medium text-warning mb-1">AI Quality Warnings</div>
            <ul className="space-y-0.5">
              {aiQuality.issues.slice(0, 4).map((w: string, i: number) => (
                <li key={i} className="text-[11px] text-text-tertiary flex items-start gap-1.5">
                  <AlertTriangle size={10} className="text-warning mt-0.5 shrink-0" />
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border-secondary bg-bg-secondary rounded-b-xl">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={onProceed}
            disabled={checking || score < 20}
            variant={score >= 40 ? "primary" : "danger"}
          >
            {score >= 70 ? "Send Anyway" : score >= 40 ? "Send Anyway" : "Fix Issues"}
          </Button>
        </div>
      </div>
    </div>
  );
}
