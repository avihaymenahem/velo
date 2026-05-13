import { queryWithRetry } from "./connection";

export interface ARFReportRow {
  id: string;
  account_id: string;
  original_recipient: string | null;
  reported_domain: string | null;
  feedback_type: string | null;
  user_agent: string | null;
  source_ip: string | null;
  arrival_date: number | null;
  report_raw: string | null;
  processed: number;
  created_at: number;
}

export async function saveARFReport(
  accountId: string,
  report: {
    feedbackType: string;
    userAgent: string;
    originalRecipient: string;
    originalMailFrom: string | null;
    arrivalDate: string | null;
    sourceIP: string | null;
    reportedDomain: string | null;
  },
  rawBody: string,
): Promise<void> {
  await queryWithRetry(async (db) => {
    const id = crypto.randomUUID();
    const arrivalTs = report.arrivalDate ? Math.floor(new Date(report.arrivalDate).getTime() / 1000) : null;
    await db.execute(
      `INSERT INTO arf_reports (id, account_id, original_recipient, reported_domain, feedback_type, user_agent, source_ip, arrival_date, report_raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, accountId, report.originalRecipient, report.reportedDomain, report.feedbackType, report.userAgent, report.sourceIP, arrivalTs, rawBody],
    );
  });
}

export async function getARFReports(accountId: string, limit: number = 50): Promise<ARFReportRow[]> {
  return queryWithRetry(async (db) =>
    db.select<ARFReportRow[]>(
      "SELECT * FROM arf_reports WHERE account_id = $1 ORDER BY created_at DESC LIMIT $2",
      [accountId, limit],
    ),
  );
}

export async function markARFProcessed(id: string): Promise<void> {
  await queryWithRetry(async (db) =>
    db.execute("UPDATE arf_reports SET processed = 1 WHERE id = $1", [id]),
  );
}
