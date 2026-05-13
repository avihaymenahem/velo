import { queryWithRetry } from "@/services/db/connection";

export async function exportCampaignToCSV(
  campaignId: string,
): Promise<string> {
  const rows = await queryWithRetry(async (db) =>
    db.select<
      {
        email: string;
        variant: string | null;
        status: string;
        opened_at: number | null;
        clicked_at: number | null;
      }[]
    >(
      `SELECT
         c.email,
         cr.variant,
         cr.status,
         cr.opened_at,
         cr.clicked_at
       FROM campaign_recipients cr
       JOIN contacts c ON c.id = cr.contact_id
       WHERE cr.campaign_id = $1
       ORDER BY c.email`,
      [campaignId],
    ),
  );

  const header = "email,variant,status,opened_at,clicked_at";
  const lines = rows.map((r) => {
    const opened = r.opened_at
      ? new Date(r.opened_at * 1000).toISOString()
      : "";
    const clicked = r.clicked_at
      ? new Date(r.clicked_at * 1000).toISOString()
      : "";
    return `${escapeCsvField(r.email)},${r.variant ?? ""},${r.status},${opened},${clicked}`;
  });

  return [header, ...lines].join("\n");
}

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
