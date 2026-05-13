import { saveARFReport, getARFReports } from "@/services/db/arfReports";
import { addToSuppression } from "./suppressionList";

export interface ARFReport {
  feedbackType: string;
  userAgent: string;
  originalRecipient: string;
  originalMailFrom: string | null;
  arrivalDate: string | null;
  sourceIP: string | null;
  reportedDomain: string | null;
}

export interface ARFSummary {
  totalReports: number;
  unprocessedReports: number;
  abuseComplaints: number;
  topDomains: { domain: string; count: number }[];
}

export function parseARF(messageBody: string): ARFReport | null {
  const lines = messageBody.split("\r\n");
  const report: Record<string, string> = {};
  let inFeedbackReport = false;

  for (const line of lines) {
    if (line.startsWith("Content-Type: message/feedback-report")) {
      inFeedbackReport = true;
      continue;
    }
    if (inFeedbackReport) {
      const colonIdx = line.indexOf(":");
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim();
        const value = line.slice(colonIdx + 1).trim();
        report[key] = value;
      }
      if (line.trim() === "" && Object.keys(report).length > 0) {
        break;
      }
    }
  }

  if (Object.keys(report).length === 0) return null;

  const originalRecipient = report["Original-Recipient"]?.replace(/^rfc822;\s*/i, "") ?? "";
  const reportedDomain = report["Reported-Domain"] ?? null;
  const feedbackType = report["Feedback-Type"] ?? "unknown";
  const userAgent = report["User-Agent"] ?? "";
  const sourceIP = report["Source-IP"] ?? null;
  const arrivalDate = report["Arrival-Date"] ?? null;
  const originalMailFrom = report["Original-Mail-From"]?.replace(/^rfc822;\s*/i, "") ?? null;

  return {
    feedbackType,
    userAgent,
    originalRecipient,
    originalMailFrom,
    arrivalDate,
    sourceIP,
    reportedDomain,
  };
}

export async function processARFReport(accountId: string, rawBody: string): Promise<ARFReport> {
  const report = parseARF(rawBody);

  if (!report) {
    throw new Error("Failed to parse ARF report");
  }

  await addToSuppression(accountId, report.originalRecipient, "abuse_complaint");

  await saveARFReport(accountId, report, rawBody);

  return report;
}

export async function getARFSummary(accountId: string): Promise<ARFSummary> {
  const reports = await getARFReports(accountId, 100);
  const unprocessed = reports.filter((r) => r.processed === 0);
  const abuseComplaints = reports.filter((r) => r.feedback_type === "abuse").length;

  const domainCount = new Map<string, number>();
  for (const r of reports) {
    if (r.reported_domain) {
      domainCount.set(r.reported_domain, (domainCount.get(r.reported_domain) ?? 0) + 1);
    }
  }

  const topDomains = [...domainCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([domain, count]) => ({ domain, count }));

  return {
    totalReports: reports.length,
    unprocessedReports: unprocessed.length,
    abuseComplaints,
    topDomains,
  };
}
